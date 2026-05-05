import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

// Keys exposed via the unauthenticated /settings endpoints. Any key not in
// this set is admin-only and must not leak through the public surface.
const PUBLIC_SETTING_KEYS: ReadonlySet<string> = new Set([
  'WELCOME_BACKGROUND_IMAGE',
  'CHEF_LOGO_PLACEHOLDER',
  'CHEF_BANNER_PLACEHOLDER',
]);

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.extended.setting.findMany({
      where: { key: { in: [...PUBLIC_SETTING_KEYS] } },
    });
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  async getPublicByKey(key: string): Promise<string | null> {
    if (!PUBLIC_SETTING_KEYS.has(key)) return null;
    const row = await this.prisma.extended.setting.findUnique({
      where: { key },
    });
    return row?.value ?? null;
  }

  async upsert(key: string, value: string) {
    return this.prisma.extended.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
