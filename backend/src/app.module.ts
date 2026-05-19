import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AdminContextModule } from './common/admin-context/admin-context.module';
import { ActorContextModule } from './common/actor-context/actor-context.module';
import { JobsModule } from './common/jobs/jobs.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { LoggingModule } from './common/logging/logging.module';
import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
import { HttpExceptionNormalizerFilter } from './common/errors/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TwilioModule } from './modules/twilio/twilio.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { OrdersModule } from './modules/orders/orders.module';
import { StorageModule } from './modules/storage/storage.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MenusModule } from './modules/menus/menus.module';
import { ItemsModule } from './modules/items/items.module';
import { ChefsModule } from './modules/chefs/chefs.module';
import { AdminModule } from './modules/admin/admin.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      // Single named tier (research R7 — never add a second named tier globally).
      // Global default is a sane API baseline (60 req/min/IP). Sensitive endpoints
      // tighten it per-route via @Throttle: FR-016 (send-otp / change-phone) =
      // 3/min, FR-016a (register / sign-in / refresh) = 10 / 15 min.
      // Test runs (NODE_ENV=test, set by Jest) get a 1M cap so the e2e suite's
      // shared-IP traffic doesn't trip the limiter under test.
      {
        name: 'default',
        ttl: 60_000,
        limit: process.env.NODE_ENV === 'test' ? 1_000_000 : 60,
      },
    ]),
    AdminContextModule,
    ActorContextModule,
    PrismaModule,
    HealthModule,
    JobsModule,
    LoggingModule,
    TwilioModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    OrdersModule,
    AddressesModule,
    StorageModule,
    NotificationsModule,
    MenusModule,
    ItemsModule,
    ChefsModule,
    AdminModule,
    CategoriesModule,
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
