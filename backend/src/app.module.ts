import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AdminContextModule } from './common/admin-context/admin-context.module';
import { JobsModule } from './common/jobs/jobs.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { LoggingModule } from './common/logging/logging.module';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpExceptionNormalizerFilter } from './common/errors/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TwilioModule } from './modules/twilio/twilio.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 900_000, limit: 10 },  // FR-016a applies globally; per-route @Throttle overrides for FR-016
    ]),
    AdminContextModule,
    PrismaModule,
    HealthModule,
    JobsModule,
    LoggingModule,
    TwilioModule,
    AuthModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionNormalizerFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}