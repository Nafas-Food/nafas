import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { MenuEventLogger } from '../../common/logging/menu-event.logger';
import { ActorContext } from '../../common/actor-context/actor-context.service';
import { CreateMenuDto } from './dto/create-menu.dto';

/**
 * Phase 3 shell + Phase 4 expansion. Owns menu reads and writes.
 *
 * Note: the Phase 0 `Menu` schema has no `isActive` boolean — "active" in
 * FR-014 means "not soft-deleted", which the `prismaService.extended.menu.*`
 * client filters automatically. No additional `isActive` predicate is added.
 */
@Injectable()
export class MenusService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly menuEventLogger: MenuEventLogger,
    private readonly actorContext: ActorContext,
  ) {}

  /** FR-014 category-filter membership check. */
  async hasMenuInCategory(
    chefId: string,
    categoryId: string,
  ): Promise<boolean> {
    const found = await this.prismaService.extended.menu.findFirst({
      where: { chefId, categoryId },
      select: { id: true },
    });
    return found !== null;
  }

  /** Returns the unique active category IDs the chef currently has menus in. */
  async categoriesForChef(chefId: string): Promise<string[]> {
    const rows = await this.prismaService.extended.menu.findMany({
      where: { chefId },
      select: { categoryId: true },
      distinct: ['categoryId'],
    });
    return rows.map((r) => r.categoryId);
  }

  /** Returns chef IDs that have at least one non-soft-deleted menu in `categoryId`. */
  async chefIdsInCategory(categoryId: string): Promise<string[]> {
    const rows = await this.prismaService.extended.menu.findMany({
      where: { categoryId },
      select: { chefId: true },
      distinct: ['chefId'],
    });
    return rows.map((r) => r.chefId);
  }

  /**
   * FR-001: create a menu owned by the calling chef. The chef row is
   * re-derived from the JWT sub upstream (controller calls
   * chefs.service.findOwnedOrThrow first and passes the resolved
   * chef.id as `chefId` here).
   *
   * Category existence is enforced via the cross-module call
   * categories.service.findOneActiveOrThrow.
   *
   * If `initialAvailability` is supplied, the weekday rows are
   * created in the same transaction as the menu insert.
   */
  async createMenu(
    chefId: string,
    dto: CreateMenuDto,
  ): Promise<MenuWithAvailability> {
    await this.categoriesService.findOneActiveOrThrow(dto.categoryId);

    const menu = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.menu.create({
        data: {
          chefId,
          categoryId: dto.categoryId,
          name: dto.name as unknown as Prisma.JsonObject,
          availableAllDays: dto.availableAllDays,
        },
      });
      if (dto.initialAvailability && dto.initialAvailability.length > 0) {
        await tx.menuAvailability.createMany({
          data: dto.initialAvailability.map((dayOfWeek) => ({
            menuId: created.id,
            dayOfWeek,
          })),
          skipDuplicates: true,
        });
      }
      return tx.menu.findUniqueOrThrow({
        where: { id: created.id },
        include: { availability: true },
      });
    });

    this.menuEventLogger.emit({
      event: 'menu.create',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menu.id,
    });
    return menu;
  }

  /**
   * FR-006: chef-side browse. Returns every non-soft-deleted menu
   * owned by `chefId`, in the deterministic order
   * (displayOrder ASC, createdAt ASC, id ASC). Items inside each
   * menu are returned in the same order, INCLUDING items the chef
   * has marked inactive (FR-015 — chef sees full catalogue).
   */
  async findManyForChef(chefId: string): Promise<ChefMenuWithItems[]> {
    return this.prismaService.extended.menu.findMany({
      where: { chefId },
      include: {
        availability: true,
        items: {
          orderBy: [
            { displayOrder: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * FR-004: idempotent on the (menuId, dayOfWeek) composite. A re-
   * submit with the same dayOfWeek is a no-op (handled by upsert).
   */
  async addAvailability(
    menuId: string,
    chefId: string,
    dayOfWeek: number,
  ): Promise<void> {
    await this.assertMenuOwnedByChef(menuId, chefId);
    await this.prismaService.menuAvailability.upsert({
      where: { menuId_dayOfWeek: { menuId, dayOfWeek } },
      create: { menuId, dayOfWeek },
      update: {},
    });
    this.menuEventLogger.emit({
      event: 'menu.availability_add',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menuId,
    });
  }

  /**
   * FR-004: idempotent. Removing a weekday that is not currently
   * included is a no-op (HTTP 204 from the controller).
   */
  async removeAvailability(
    menuId: string,
    chefId: string,
    dayOfWeek: number,
  ): Promise<void> {
    await this.assertMenuOwnedByChef(menuId, chefId);
    try {
      await this.prismaService.menuAvailability.delete({
        where: { menuId_dayOfWeek: { menuId, dayOfWeek } },
      });
    } catch (err: unknown) {
      // Prisma P2025 = "Record to delete does not exist" — idempotent no-op.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        return;
      }
      throw err;
    }
    this.menuEventLogger.emit({
      event: 'menu.availability_remove',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menuId,
    });
  }

  /**
   * Private ownership helper. Returns the menu when owned by the
   * caller's chef; throws NotFoundException with code MENU_NOT_FOUND
   * when the menu does not exist, is soft-deleted, OR is owned by
   * a different chef. The 404 shape is identical across all three
   * cases (FR-026 / SC-014).
   */
  private async assertMenuOwnedByChef(
    menuId: string,
    chefId: string,
  ): Promise<void> {
    const menu = await this.prismaService.extended.menu.findFirst({
      where: { id: menuId, chefId },
      select: { id: true },
    });
    if (!menu) {
      throw new NotFoundException({ code: 'MENU_NOT_FOUND' });
    }
  }
}

type MenuWithAvailability = Prisma.MenuGetPayload<{
  include: { availability: true };
}>;
type ChefMenuWithItems = Prisma.MenuGetPayload<{
  include: { availability: true; items: true };
}>;
