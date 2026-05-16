import { Injectable } from '@nestjs/common';
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
}
