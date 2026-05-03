import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminContextModule } from './common/admin-context/admin-context.module';
import { JobsModule } from './common/jobs/jobs.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'auth', ttl: 15 * 60_000, limit: 10 },
    ]),
    AdminContextModule,
    PrismaModule,
    HealthModule,
    JobsModule,
  ],
})
export class AppModule {}
