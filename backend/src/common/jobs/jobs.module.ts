import { Module } from '@nestjs/common';
import { InvalidatedTokenCleanupJob } from './invalidated-token-cleanup.job';

@Module({
  providers: [InvalidatedTokenCleanupJob],
})
export class JobsModule {}
