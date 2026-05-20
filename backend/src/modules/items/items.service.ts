import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MenusService } from '../menus/menus.service';
import { StorageService } from '../storage/storage.service';
import { ItemEventLogger } from '../../common/logging/item-event.logger';
import { ActorContext } from '../../common/actor-context/actor-context.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { stockInputToDb, dbToStockOutput } from './dto/stock-input.dto';
import { effectivePrice } from './effective-price';
import { randomUUID } from 'crypto';
import type { Item } from '@prisma/client';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(forwardRef(() => MenusService))
    private readonly menusService: MenusService,
    private readonly storage: StorageService,
    private readonly itemEventLogger: ItemEventLogger,
    private readonly actorContext: ActorContext,
  ) {}

  /**
   * FR-007: create an item under one of the calling chef's own menus.
   * Caller is responsible for resolving `chefId` via
   * chefs.service.findOwnedOrThrow upstream and passing it in.
   */
  async createItem(
    menuId: string,
    chefId: string,
    dto: CreateItemDto,
  ): Promise<ItemWire> {
    await this.menusService.assertMenuOwnedByChefPublic(menuId, chefId);
    this.assertNonNegativeEffectivePrice(dto);

    const created = await this.prismaService.item.create({
      data: {
        menuId,
        name: dto.name as any,
        description: dto.description as any,
        price: new Decimal(dto.price).toFixed(2),
        discountValue: new Decimal(dto.discountValue ?? '0').toFixed(2),
        discountUnit: (dto.discountUnit ?? 'fixed') as any,
        quantity: stockInputToDb(dto.stock),
        isActive: dto.isActive ?? true,
      },
    });
    this.itemEventLogger.emit({
      event: 'item.create',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: created.id,
    });
    return this.toWire(created);
  }

  /**
   * FR-015: chef-side browse of one menu's items, INCLUDING inactive.
   */
  async findManyForChef(menuId: string, chefId: string): Promise<ItemWire[]> {
    await this.menusService.assertMenuOwnedByChefPublic(menuId, chefId);
    const rows = await this.prismaService.extended.item.findMany({
      where: { menuId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.toWire(r));
  }

  /**
   * FR-012 / FR-013: append a new image to an item's images array.
   * Enforces:
   *   - mime-type ∈ {image/jpeg, image/png, image/webp}
   *   - file size ≤ 3 MB (also enforced upstream by the FileInterceptor)
   *   - the item's current images.length must be < 5 (FR-012 cap)
   *
   * The throttle (FR-012b: 20 / 60 s per chef) is applied at the
   * controller (T031). This service method is called only after the
   * throttle passes.
   *
   * Uses an optimistic-concurrency retry loop so concurrent uploads do
   * not overwrite each other (compare-and-swap via updatedAt).
   */
  async appendImage(
    itemId: string,
    chefId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<ItemWire> {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(mimeType)) {
      this.itemEventLogger.emit({
        event: 'item.image_upload',
        outcome: 'unsupported_media_type',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef',
        sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: itemId,
      });
      throw new BadRequestException({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    }

    // Verify ownership + cap before uploading storage.
    const item = await this.findOwnedItemOrThrow(itemId, chefId);
    if (item.images.length >= 5) {
      this.itemEventLogger.emit({
        event: 'item.image_upload',
        outcome: 'images_full',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef',
        sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: itemId,
      });
      throw new BadRequestException({ code: 'ITEM_IMAGES_FULL' });
    }

    const ext =
      mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/png'
          ? 'png'
          : 'webp';
    const objectKey = `items/${chefId}/${itemId}/${randomUUID()}.${ext}`;
    const publicUrl = await this.storage.upload(
      'item-images',
      objectKey,
      fileBuffer,
      mimeType,
    );

    // Optimistic-concurrency retry loop (max 3 attempts).
    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
      const current = await this.prismaService.extended.item.findFirst({
        where: { id: itemId, menu: { chefId } },
      });
      if (!current) {
        throw new NotFoundException({ code: 'ITEM_NOT_FOUND' });
      }
      if (current.images.length >= 5) {
        // Cap hit by a concurrent upload; clean up the orphan storage object.
        this.storage.delete('item-images', objectKey).catch(() => {});
        throw new BadRequestException({ code: 'ITEM_IMAGES_FULL' });
      }

      const next = [...current.images, publicUrl];
      const { count } = await this.prismaService.item.updateMany({
        where: { id: itemId, updatedAt: current.updatedAt },
        data: { images: { set: next } },
      });

      if (count === 1) {
        this.itemEventLogger.emit({
          event: 'item.image_upload',
          outcome: 'success',
          actorUserId: this.actorContext.getUserId() ?? null,
          actorRole: 'chef',
          sourceIp: this.actorContext.getSourceIp() ?? null,
          targetItemId: itemId,
        });
        return this.toWire({ ...current, images: next, updatedAt: new Date() });
      }

      // CAS miss — another writer changed the row. Retry.
      attempt++;
    }

    // Exceeded retries; clean up orphan storage object.
    this.storage.delete('item-images', objectKey).catch(() => {});
    throw new BadRequestException({
      code: 'ITEM_CONCURRENT_UPDATE',
      message: 'Concurrent image upload conflict — please retry.',
    });
  }

  /** FR-008a: patch one or more item fields. */
  async updateItem(
    itemId: string,
    chefId: string,
    dto: UpdateItemDto,
  ): Promise<ItemWire> {
    const item = await this.findOwnedItemOrThrow(itemId, chefId);
    if (
      dto.price !== undefined ||
      dto.discountValue !== undefined ||
      dto.discountUnit !== undefined
    ) {
      const next = {
        price: dto.price ?? (item.price as unknown as string),
        discountValue:
          dto.discountValue ?? (item.discountValue as unknown as string),
        discountUnit:
          dto.discountUnit ?? (item.discountUnit as 'fixed' | 'percent'),
      };
      this.assertNonNegativeEffectivePrice(next);
    }
    const updated = await this.prismaService.item.update({
      where: { id: itemId },
      data: {
        ...(dto.name ? { name: dto.name as any } : {}),
        ...(dto.description ? { description: dto.description as any } : {}),
        ...(dto.price !== undefined
          ? { price: new Decimal(dto.price).toFixed(2) }
          : {}),
        ...(dto.discountValue !== undefined
          ? { discountValue: new Decimal(dto.discountValue).toFixed(2) }
          : {}),
        ...(dto.discountUnit !== undefined
          ? { discountUnit: dto.discountUnit as any }
          : {}),
        ...(dto.stock !== undefined
          ? { quantity: stockInputToDb(dto.stock) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    const onlyActive =
      Object.keys(dto).length === 1 && dto.isActive !== undefined;
    this.itemEventLogger.emit({
      event: onlyActive ? 'item.active_toggle' : 'item.update',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
    return this.toWire(updated);
  }

  /** FR-011: soft-delete an item owned by `chefId`. */
  async softDeleteItem(itemId: string, chefId: string): Promise<void> {
    await this.findOwnedItemOrThrow(itemId, chefId);
    await this.prismaService.extended.item.softDelete({ id: itemId });
    this.itemEventLogger.emit({
      event: 'item.soft_delete',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
  }

  /**
   * FR-009a: atomic dense renumber. Ownership is re-derived inside
   * the transaction so a stale menuId can't slip past.
   */
  async reorderItems(
    menuId: string,
    chefId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    await this.menusService.assertMenuOwnedByChefPublic(menuId, chefId);
    await this.prismaService.$transaction(async (tx) => {
      const currentRows = await tx.item.findMany({
        where: { menuId, deletedAt: null },
        select: { id: true },
      });
      const currentSet = new Set(currentRows.map((r) => r.id));
      const submittedSet = new Set(orderedItemIds);
      if (
        currentSet.size !== submittedSet.size ||
        orderedItemIds.length !== submittedSet.size ||
        [...submittedSet].some((id) => !currentSet.has(id))
      ) {
        throw new BadRequestException({ code: 'ITEMS_REORDER_NOT_EXACT_SET' });
      }
      for (let i = 0; i < orderedItemIds.length; i++) {
        await tx.item.update({
          where: { id: orderedItemIds[i] },
          data: { displayOrder: i },
        });
      }
    });
    this.itemEventLogger.emit({
      event: 'item.reorder',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
    });
  }

  /**
   * FR-012a: idempotent per-image remove. The `imageKey` is the
   * storage object key suffix (everything after the bucket name in
   * the public URL). Stable across concurrent edits — does NOT
   * depend on array indices.
   */
  async removeImage(
    itemId: string,
    chefId: string,
    imageKey: string,
  ): Promise<ItemWire> {
    const item = await this.findOwnedItemOrThrow(itemId, chefId);
    const remaining = item.images.filter(
      (u) => extractImageKey(u) !== imageKey,
    );
    if (remaining.length === item.images.length) {
      // Idempotent: key is already absent — return current state.
      this.itemEventLogger.emit({
        event: 'item.image_remove',
        outcome: 'success',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef',
        sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: itemId,
      });
      return this.toWire(item);
    }
    const updated = await this.prismaService.item.update({
      where: { id: itemId },
      data: { images: { set: remaining } },
    });
    // Best-effort storage cleanup — mirrors Phase 3 chef-logo replacement.
    this.storage.delete('item-images', imageKey).catch((err) => {
      console.error('storage.delete failed', { imageKey, err });
    });
    this.itemEventLogger.emit({
      event: 'item.image_remove',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
    return this.toWire(updated);
  }

  /**
   * FR-010: refuses combinations that would drive the effective
   * price below 0. The effectivePrice helper itself clamps to 0;
   * the validator only refuses when the CHEF INPUT would have
   * driven it negative — i.e., fixed-discount > price, or
   * percent-discount > 100.
   */
  private assertNonNegativeEffectivePrice(dto: {
    price: string;
    discountValue?: string;
    discountUnit?: 'fixed' | 'percent';
  }): void {
    const unit = dto.discountUnit ?? 'fixed';
    const discount = new Decimal(dto.discountValue ?? '0');
    if (unit === 'fixed' && discount.gt(dto.price)) {
      throw new BadRequestException({ code: 'ITEM_NEGATIVE_EFFECTIVE_PRICE' });
    }
    if (unit === 'percent' && discount.gt(100)) {
      throw new BadRequestException({ code: 'ITEM_NEGATIVE_EFFECTIVE_PRICE' });
    }
  }

  /**
   * Maps a stored Item row to the wire shape (R4): omits the -1
   * sentinel from `quantity`, returns `isUnlimitedStock` and
   * server-computed `inStock`, surfaces both base and effective
   * prices as decimal strings.
   */
  private toWire(item: Item): ItemWire {
    const stock = dbToStockOutput(item.quantity);
    return {
      id: item.id,
      menuId: item.menuId,
      name: item.name as any,
      description: item.description as any,
      price: new Decimal(item.price as unknown as Decimal.Value).toFixed(2),
      effectivePrice: effectivePrice(item as any).toFixed(2),
      discountValue: new Decimal(
        item.discountValue as unknown as Decimal.Value,
      ).toFixed(2),
      discountUnit: item.discountUnit as 'fixed' | 'percent',
      isUnlimitedStock: stock.isUnlimitedStock,
      ...(stock.quantity !== undefined ? { quantity: stock.quantity } : {}),
      inStock: stock.inStock,
      images: item.images,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  /**
   * Customer-facing wire shape. Omits chef-only fields (isActive).
   */
  toPublicWire(item: Item): PublicItemWire {
    const wire = this.toWire(item);
    const { isActive: _isActive, ...publicWire } = wire;
    return publicWire as PublicItemWire;
  }

  /**
   * Private ownership helper. Walks item → menu → chefId and
   * returns the item when the chain resolves to the calling chef.
   * Throws NotFoundException with code ITEM_NOT_FOUND when the
   * item does not exist, is soft-deleted, OR its owning chef
   * differs from `chefId`. Identical 404 shape across all three.
   */
  private async findOwnedItemOrThrow(
    itemId: string,
    chefId: string,
  ): Promise<Item> {
    const item = await this.prismaService.extended.item.findFirst({
      where: { id: itemId, menu: { chefId } },
    });
    if (!item) {
      throw new NotFoundException({ code: 'ITEM_NOT_FOUND' });
    }
    return item;
  }
}

/** Extracts the storage object key from a Supabase public URL. */
const ITEM_IMAGES_MARKER = '/storage/v1/object/public/item-images/';
function extractImageKey(publicUrl: string): string {
  const i = publicUrl.indexOf(ITEM_IMAGES_MARKER);
  if (i === -1) return publicUrl;
  const raw = publicUrl.slice(i + ITEM_IMAGES_MARKER.length);
  const q = raw.indexOf('?');
  const h = raw.indexOf('#');
  const end = Math.min(q === -1 ? raw.length : q, h === -1 ? raw.length : h);
  return raw.slice(0, end);
}

export interface ItemWire {
  id: string;
  menuId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  price: string;
  effectivePrice: string;
  discountValue: string;
  discountUnit: 'fixed' | 'percent';
  isUnlimitedStock: boolean;
  quantity?: number;
  inStock: boolean;
  images: string[];
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PublicItemWire = Omit<ItemWire, 'isActive'>;
