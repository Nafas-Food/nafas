import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const timeoutMs = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('db timeout')), timeoutMs);
        }),
      ]);
      return this.getStatus(key, true);
    } catch {
      return this.getStatus(key, false, { reason: 'unreachable' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
