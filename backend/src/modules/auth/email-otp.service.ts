import { randomInt } from 'crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthEventLogger } from '../../common/logging/auth-event.logger';
import {
  EMAIL_CLIENT,
  type EmailClient,
} from '../email/email.client.interface';

const DEFAULT_TTL_SECONDS = 600;
const DEFAULT_MAX_ATTEMPTS = 5;
const BCRYPT_COST = 10;

@Injectable()
export class EmailOtpService {
  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: AuthEventLogger,
    @Inject(EMAIL_CLIENT) private readonly email: EmailClient,
  ) {
    const ttl = parseInt(
      this.config.get<string>('OTP_EMAIL_TTL_SECONDS') ?? '',
      10,
    );
    this.ttlSeconds =
      Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS;
    const max = parseInt(
      this.config.get<string>('OTP_EMAIL_MAX_ATTEMPTS') ?? '',
      10,
    );
    this.maxAttempts =
      Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_ATTEMPTS;
  }

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 1) return '***' + email.slice(at);
    return email[0] + '***' + email.slice(at);
  }

  private generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /**
   * Generate a fresh OTP for an email destination. Invalidates prior
   * unconsumed rows so a "resend" tap supersedes the previous code. The
   * email send happens AFTER the DB commit so we never email a code we
   * failed to persist.
   */
  async issue(email: string, locale: 'en' | 'ar'): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, BCRYPT_COST);

    await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.updateMany({
        where: {
          channel: OtpChannel.email,
          destination: email,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      await tx.otpCode.create({
        data: {
          channel: OtpChannel.email,
          destination: email,
          codeHash,
          expiresAt,
        },
      });
    });

    try {
      await this.email.sendOtp(email, code, locale);
      this.events.emit({
        event: 'otp.send',
        outcome: 'success',
        extra: { channel: 'email', email: this.maskEmail(email) },
      });
    } catch (err) {
      this.events.emit({
        event: 'otp.send',
        outcome: 'provider_failure',
        extra: { channel: 'email', email: this.maskEmail(email) },
      });
      throw err;
    }
  }

  /**
   * Verify a submitted code against the latest unconsumed row for this
   * email. Atomic consume (updateMany guarded on consumedAt: null)
   * prevents double-consume races. Wrong code increments attempts; on
   * MAX_ATTEMPTS the row is marked consumed so the attacker has to wait
   * for the throttle window to start a new send.
   */
  async verify(email: string, code: string): Promise<void> {
    const now = new Date();
    const row = await this.prisma.otpCode.findFirst({
      where: {
        channel: OtpChannel.email,
        destination: email,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      this.events.emit({
        event: 'otp.verify',
        outcome: 'expired',
        extra: { channel: 'email', email: this.maskEmail(email) },
      });
      throw new UnauthorizedException({
        code: 'EMAIL_OTP_INVALID',
        message: 'Email OTP code does not match or has expired.',
      });
    }

    const updated = await this.prisma.otpCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });

    if (updated.attempts > this.maxAttempts) {
      // Mark consumed so further submissions hit the "not found" branch.
      await this.prisma.otpCode.updateMany({
        where: { id: row.id, consumedAt: null },
        data: { consumedAt: now },
      });
      this.events.emit({
        event: 'otp.verify',
        outcome: 'tripped',
        extra: { channel: 'email', email: this.maskEmail(email) },
      });
      throw new HttpException(
        {
          code: 'EMAIL_OTP_ATTEMPTS_EXCEEDED',
          message: 'Too many wrong attempts. Request a fresh code.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await bcrypt.compare(code, row.codeHash);
    if (!ok) {
      this.events.emit({
        event: 'otp.verify',
        outcome: 'mismatch',
        extra: { channel: 'email', email: this.maskEmail(email) },
      });
      throw new UnauthorizedException({
        code: 'EMAIL_OTP_INVALID',
        message: 'Email OTP code does not match or has expired.',
      });
    }

    // Atomic consume — if a sibling request already consumed this row
    // we lose the race and treat it as invalid.
    const consume = await this.prisma.otpCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consume.count !== 1) {
      this.events.emit({
        event: 'otp.verify',
        outcome: 'rotated_replay',
        extra: { channel: 'email', email: this.maskEmail(email) },
      });
      throw new UnauthorizedException({
        code: 'EMAIL_OTP_INVALID',
        message: 'Email OTP code does not match or has expired.',
      });
    }

    this.events.emit({
      event: 'otp.verify',
      outcome: 'success',
      extra: { channel: 'email', email: this.maskEmail(email) },
    });
  }
}
