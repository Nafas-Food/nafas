import { Module, Global } from '@nestjs/common';
import { AuthEventLogger } from './auth-event.logger';
import { AddressEventLogger } from './address-event.logger';

@Global()
@Module({
  providers: [AuthEventLogger, AddressEventLogger],
  exports: [AuthEventLogger, AddressEventLogger],
})
export class LoggingModule {}
