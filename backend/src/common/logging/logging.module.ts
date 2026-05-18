import { Module, Global } from '@nestjs/common';
import { AuthEventLogger } from './auth-event.logger';
import { AddressEventLogger } from './address-event.logger';
import { ChefEventLogger } from './chef-event.logger';
import { CategoryEventLogger } from './category-event.logger';
import { MenuEventLogger } from './menu-event.logger';
import { ItemEventLogger } from './item-event.logger';
import { CorrelationIdContext } from './correlation-id.context';

@Global()
@Module({
  providers: [
    AuthEventLogger,
    AddressEventLogger,
    ChefEventLogger,
    CategoryEventLogger,
    MenuEventLogger,
    ItemEventLogger,
    CorrelationIdContext,
  ],
  exports: [
    AuthEventLogger,
    AddressEventLogger,
    ChefEventLogger,
    CategoryEventLogger,
    MenuEventLogger,
    ItemEventLogger,
    CorrelationIdContext,
  ],
})
export class LoggingModule {}
