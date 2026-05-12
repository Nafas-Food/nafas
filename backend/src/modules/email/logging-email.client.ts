import { Injectable, Logger } from '@nestjs/common';
import type { EmailClient } from './email.client.interface';

/**
 * Dev/test fake that prints the OTP code to stdout instead of sending an
 * email. Used when `EMAIL_OTP_LIVE !== 'true'` so contributors can run
 * the email-OTP flow end-to-end without a Resend key and without burning
 * the free-tier quota.
 *
 * Intentionally logs the plaintext code — that is the entire point of
 * this fake. In production we wire ResendEmailClient instead, which
 * never logs the code.
 */
@Injectable()
export class LoggingEmailClient implements EmailClient {
  private readonly log = new Logger('LoggingEmailClient');

  async sendOtp(to: string, code: string, locale: 'en' | 'ar'): Promise<void> {
    this.log.warn(`[email-otp] to=${to} code=${code} locale=${locale}`);
  }
}
