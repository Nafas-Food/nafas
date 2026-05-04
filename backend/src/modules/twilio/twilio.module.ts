import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TwilioVerifyService } from './twilio-verify.service';
import { TWILIO_VERIFY_CLIENT } from './twilio-verify.client.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    TwilioVerifyService,
    { provide: TWILIO_VERIFY_CLIENT, useExisting: TwilioVerifyService },
  ],
  exports: [TWILIO_VERIFY_CLIENT],
})
export class TwilioModule {}