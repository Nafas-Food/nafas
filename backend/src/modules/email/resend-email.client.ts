import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { EmailClient } from './email.client.interface';

@Injectable()
export class ResendEmailClient implements EmailClient {
  private readonly log = new Logger(ResendEmailClient.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.getOrThrow<string>('RESEND_API_KEY');
    this.from = this.config.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.client = new Resend(key);
  }

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 1) return '***' + email.slice(at);
    return email[0] + '***' + email.slice(at);
  }

  async sendOtp(to: string, code: string, locale: 'en' | 'ar'): Promise<void> {
    const subject =
      locale === 'ar' ? 'رمز التحقق الخاص بك' : 'Your verification code';
    const text =
      locale === 'ar'
        ? `رمز التحقق الخاص بك في نفس هو ${code}. صالح لمدة 10 دقائق.`
        : `Your nafas verification code is ${code}. It is valid for 10 minutes.`;

    const { data, error } = await this.client.emails.send({
      from: this.from,
      to,
      subject,
      text,
    });
    if (error) {
      this.log.error(
        `Resend send failed for ${this.maskEmail(to)}: ${error.message}`,
      );
      throw new Error(`Resend API error: ${error.message}`);
    }
  }
}
