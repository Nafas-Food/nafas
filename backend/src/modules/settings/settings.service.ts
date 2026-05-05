import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.extended.setting.findMany();
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  async getByKey(key: string): Promise<string | null> {
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
