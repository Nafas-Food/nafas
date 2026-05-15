import { Injectable, Logger } from '@nestjs/common';
import type { EmailClient } from './email.client.interface';

@Injectable()
export class LoggingEmailClient implements EmailClient {
  private readonly log = new Logger(LoggingEmailClient.name);

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 1) return '***' + email.slice(at);
    return email[0] + '***' + email.slice(at);
  }

  async sendOtp(to: string, code: string, locale: 'en' | 'ar'): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      this.log.log(`OTP send: dest=${this.maskEmail(to)} locale=${locale}`);
    } else {
      this.log.warn(`OTP send: dest=${to} code=${code} locale=${locale}`);
    }
  }
}
