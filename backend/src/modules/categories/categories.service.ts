import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, Category } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const CACHE_TTL_MS = 60_000;

@Injectable()
export class CategoriesService {
  constructor(private readonly prismaService: PrismaService) {}

  private cache: { value: unknown[]; ts: number } | null = null;

  async listActive(): Promise<unknown[]> {
    if (this.cache && Date.now() - this.cache.ts < CACHE_TTL_MS) {
      return this.cache.value;
    }
    const rows = await this.prismaService.extended.category.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    this.cache = { value: rows, ts: Date.now() };
    return rows;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async create(data: {
    name: { en: string; ar: string };
    icon?: string;
    displayOrder: number;
  }) {
    const created = await this.prismaService.category.create({
      data: {
        name: data.name as unknown as Prisma.InputJsonValue,
        icon: data.icon,
        displayOrder: data.displayOrder,
        isActive: true,
      },
    });
    this.invalidateCache();
    return created;
  }

  async update(
    id: string,
    patch: {
      name?: { en?: string; ar?: string };
      icon?: string;
      displayOrder?: number;
    },
  ) {
    const existing = await this.prismaService.extended.category.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });

    let mergedName = existing.name as unknown as { en: string; ar: string };
    if (patch.name) mergedName = { ...mergedName, ...patch.name };

    const updated = await this.prismaService.category.update({
      where: { id },
      data: {
        ...(patch.name !== undefined
          ? { name: mergedName as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.displayOrder !== undefined
          ? { displayOrder: patch.displayOrder }
          : {}),
      },
    });
    this.invalidateCache();
    return updated;
  }

  async softDelete(id: string) {
    const existing = await this.prismaService.extended.category.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    await this.prismaService.extended.category.softDelete({ id });
    this.invalidateCache();
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await this.prismaService.$transaction(
      items.map((i) =>
        this.prismaService.category.update({
          where: { id: i.id },
          data: { displayOrder: i.displayOrder },
        }),
      ),
    );
    this.invalidateCache();
    return this.listActive();
  }

  /**
   * FR-003 guard for menu create / update. Refuses a soft-deleted
   * or non-existent category reference with 400 CATEGORY_NOT_FOUND.
   *
   * Consulted by menus.service before any Menu write. Reads through
   * prismaService.extended.category.* so the Phase 0 soft-delete
   * filter applies automatically; the in-process cache from Phase 3
   * R7 is also consulted first when present.
   */
  async findOneActiveOrThrow(id: string): Promise<Category> {
    const row = await this.prismaService.extended.category.findUnique({
      where: { id },
    });
    if (!row) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND' });
    }
    return row;
  }
}
