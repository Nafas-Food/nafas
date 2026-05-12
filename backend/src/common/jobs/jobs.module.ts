import { Module } from '@nestjs/common';
import { InvalidatedTokenCleanupJob } from './invalidated-token-cleanup.job';
import { OtpCodeCleanupJob } from './otp-code-cleanup.job';

@Module({
  providers: [InvalidatedTokenCleanupJob, OtpCodeCleanupJob],
})
export class JobsModule {}
