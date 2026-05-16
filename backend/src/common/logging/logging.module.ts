import { Module, Global } from '@nestjs/common';
import { AuthEventLogger } from './auth-event.logger';
import { AddressEventLogger } from './address-event.logger';
import { ChefEventLogger } from './chef-event.logger';
import { CategoryEventLogger } from './category-event.logger';

@Global()
@Module({
  providers: [AuthEventLogger, AddressEventLogger, ChefEventLogger, CategoryEventLogger],
  exports: [AuthEventLogger, AddressEventLogger, ChefEventLogger, CategoryEventLogger],
})
export class LoggingModule {}
