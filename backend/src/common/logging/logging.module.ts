import { Module, Global } from '@nestjs/common';
import { AuthEventLogger } from './auth-event.logger';

@Global()
@Module({
  providers: [AuthEventLogger],
  exports: [AuthEventLogger],
})
export class LoggingModule {}