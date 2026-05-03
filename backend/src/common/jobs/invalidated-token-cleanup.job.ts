import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvalidatedTokenCleanupJob {
  private readonly logger = new Logger(InvalidatedTokenCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'invalidated-token-cleanup',
    timeZone: 'UTC',
  })
  async run(): Promise<void> {
    const result = await this.prisma.invalidatedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`InvalidatedToken cleanup: deleted ${result.count} rows`);
  }
}
