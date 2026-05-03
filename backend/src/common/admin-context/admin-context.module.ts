import { Global, Module } from '@nestjs/common';
import { AdminContextService } from './admin-context.service';

@Global()
@Module({
  providers: [AdminContextService],
  exports: [AdminContextService],
})
export class AdminContextModule {}
