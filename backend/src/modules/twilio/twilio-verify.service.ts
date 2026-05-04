import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';
import type { TwilioVerifyClient } from './twilio-verify.client.interface';

@Injectable()
export class TwilioVerifyService implements TwilioVerifyClient {
  private readonly log = new Logger(TwilioVerifyService.name);
  private readonly client: Twilio;
  private readonly serviceSid: string;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.serviceSid = this.config.getOrThrow<string>('TWILIO_VERIFY_SERVICE_SID');
    this.client = twilio(sid, token);
  }

  async sendOtp(phone: string): Promise<void> {
    try {
      await this.client.verify.v2.services(this.serviceSid).verifications.create({
        to: phone,
        channel: 'sms',
      });
    } catch (err) {
      this.log.error(`Twilio sendOtp failed for ${phone}: ${(err as Error).message}`);
      throw err;
    }
  }

  async checkOtp(phone: string, code: string): Promise<boolean> {
    try {
      const result = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({ to: phone, code });
      return result.status === 'approved';
    } catch (err) {
      this.log.error(`Twilio checkOtp failed for ${phone}: ${(err as Error).message}`);
      return false; // a transient Twilio error is treated as "not verified"
    }
  }
}