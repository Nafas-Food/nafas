import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sweeps `otp_codes` rows that are no longer useful: either already
 * consumed (any age) or expired more than 24h ago. `OtpCode` has no
 * `deletedAt` and is exempt from the soft-delete extension, so hard
 * delete is appropriate here.
 */
@Injectable()
export class OtpCodeCleanupJob {
  private readonly logger = new Logger(OtpCodeCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'otp-code-cleanup',
    timeZone: 'UTC',
  })
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.prisma.otpCode.deleteMany({
      where: {
        OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: cutoff } }],
      },
    });
    this.logger.log(`OtpCode cleanup: deleted ${result.count} rows`);
  }
}
