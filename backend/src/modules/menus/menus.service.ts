import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Phase 3 shell. Owns the only Phase 3 reads against `Menu`. Phase 4 will
 * expand this module with menu writes; do NOT add controllers / endpoints
 * here until then. See data-model.md "Menu (read-only shell, FR-014 filter only)".
 *
 * Note: the Phase 0 `Menu` schema has no `isActive` boolean — "active" in
 * FR-014 means "not soft-deleted", which the `prismaService.extended.menu.*`
 * client filters automatically. No additional `isActive` predicate is added.
 */
@Injectable()
export class MenusService {
  constructor(private readonly prismaService: PrismaService) {}

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
}
