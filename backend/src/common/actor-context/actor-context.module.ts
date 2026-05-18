import { Module, Global } from '@nestjs/common';
import { ActorContext } from './actor-context.service';

@Global()
@Module({
  providers: [ActorContext],
  exports: [ActorContext],
})
export class ActorContextModule {}
