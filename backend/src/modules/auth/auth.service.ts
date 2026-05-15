import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TWILIO_VERIFY_CLIENT } from '../twilio/twilio-verify.client.interface';
import type { TwilioVerifyClient } from '../twilio/twilio-verify.client.interface';
import { AuthEventLogger } from '../../common/logging/auth-event.logger';
import { Role } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { serializeUser } from '../users/user.serializer';
import { EmailOtpService } from './email-otp.service';

export interface SessionPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: AuthEventLogger,
    @Inject(TWILIO_VERIFY_CLIENT) private readonly twilio: TwilioVerifyClient,
    private readonly users: UsersService,
    private readonly emailOtp: EmailOtpService,
  ) {}

  async issueSession(userId: string, role: Role): Promise<SessionPair> {
    const accessTtl = parseInt(
      this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
      10,
    );
    const refreshTtl = parseInt(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
      10,
    );
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role, type: 'access' },
      { expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, role, type: 'refresh', jti: uuidv4() },
      { expiresIn: refreshTtl },
    );
    return { accessToken, refreshToken };
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
  }

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 1) return '***' + email.slice(at);
    return email[0] + '***' + email.slice(at);
  }

  /**
   * Channel routing: if `dto.email` is present we dispatch via the
   * email-OTP path (our own short-lived row + Resend/logger). Phone is
   * still required and remains the identity anchor, but no SMS is sent
   * — that saves the Twilio cost. Email-in-use is pre-checked so we
   * never burn an email send on a duplicate.
   */
  async sendOtp(dto: { phone: string; email?: string }): Promise<void> {
    if (dto.email) {
      const existing = await this.prisma.extended.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.phone !== dto.phone) {
        this.events.emit({
          event: 'otp.send',
          outcome: 'mismatch',
          extra: { channel: 'email', reason: 'email_in_use' },
        });
        throw new ConflictException({
          code: 'EMAIL_IN_USE',
          message: 'Email is already in use.',
        });
      }
      await this.emailOtp.issue(dto.email, 'en');
      return;
    }

    try {
      await this.twilio.sendOtp(dto.phone);
      this.events.emit({
        event: 'otp.send',
        outcome: 'success',
        extra: { channel: 'sms', phone: this.maskPhone(dto.phone) },
      });
    } catch (err) {
      this.events.emit({
        event: 'otp.send',
        outcome: 'provider_failure',
        extra: { channel: 'sms', phone: this.maskPhone(dto.phone) },
      });
      throw err;
    }
  }

  async register(dto: {
    fullName: string;
    phone: string;
    password: string;
    birthdate: Date;
    otpCode: string;
    email?: string;
  }) {
    if (dto.email) {
      // Throws UnauthorizedException(EMAIL_OTP_INVALID) or
      // 429(EMAIL_OTP_ATTEMPTS_EXCEEDED) on failure.
      await this.emailOtp.verify(dto.email, dto.otpCode);
      this.events.emit({
        event: 'otp.verify',
        outcome: 'success',
        extra: { channel: 'email', email: this.maskEmail(dto.email) },
      });
    } else {
      const verified = await this.twilio.checkOtp(dto.phone, dto.otpCode);
      if (!verified) {
        this.events.emit({
          event: 'otp.verify',
          outcome: 'mismatch',
          extra: { channel: 'sms', phone: this.maskPhone(dto.phone) },
        });
        throw new UnauthorizedException({
          code: 'AUTH_OTP_INVALID',
          message: 'OTP code does not match or has expired.',
        });
      }
      this.events.emit({
        event: 'otp.verify',
        outcome: 'success',
        extra: { channel: 'sms', phone: this.maskPhone(dto.phone) },
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email ?? null,
          passwordHash,
          birthdate: dto.birthdate,
          phoneVerified: !dto.email, // verified via SMS only; email path doesn't prove phone
          role: Role.customer,
        },
      });

      const tokens = await this.issueSession(user.id, user.role);
      return { user: serializeUser(user), ...tokens };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002') {
        if (e.meta?.target?.includes('phone')) {
          throw new ConflictException({
            code: 'PHONE_IN_USE',
            message: 'Phone is already in use.',
          });
        }
        if (e.meta?.target?.includes('email')) {
          // Defence in depth: race window between pre-check and create.
          throw new ConflictException({
            code: 'EMAIL_IN_USE',
            message: 'Email is already in use.',
          });
        }
      }
      throw err;
    }
  }

  private dummyHashPromise: Promise<string> | null = null;
  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = bcrypt.hash(
        'dummy-password-for-timing-equalization',
        12,
      );
    }
    return this.dummyHashPromise;
  }

  async signIn(phone: string, password: string) {
    const user = await this.users.findByPhone(phone);
    if (!user) {
      // Equalize response time with the password-failure branch so callers
      // cannot enumerate registered phones via timing (FR-017 / SC-012).
      await bcrypt.compare(password, await this.getDummyHash());
      this.events.emit({
        event: 'auth.sign_in',
        outcome: 'unknown_phone',
        extra: { phone: this.maskPhone(phone) },
      });
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Phone or password is incorrect.',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      this.events.emit({
        event: 'auth.sign_in',
        outcome: 'password_failure',
        actorId: user.id,
      });
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Phone or password is incorrect.',
      });
    }
    const tokens = await this.issueSession(user.id, user.role);
    this.events.emit({
      event: 'auth.sign_in',
      outcome: 'success',
      actorId: user.id,
    });
    return { user: serializeUser(user), ...tokens };
  }

  async refresh(currentPayload: {
    sub: string;
    role: Role;
    jti: string;
    exp: number;
  }) {
    // Reject if already revoked or rotated.
    const blacklisted = await this.prisma.invalidatedToken.findUnique({
      where: { jti: currentPayload.jti },
    });
    if (blacklisted) {
      this.events.emit({
        event: 'auth.refresh',
        outcome: 'rotated_replay',
        actorId: currentPayload.sub,
        extra: { jti: currentPayload.jti },
      });
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_REUSED',
        message: 'Refresh credential has already been used.',
      });
    }

    // Reject soft-deleted accounts.
    const user = await this.users.findById(currentPayload.sub);
    if (!user) {
      this.events.emit({
        event: 'auth.refresh',
        outcome: 'soft_deleted_account',
        actorId: currentPayload.sub,
      });
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_INVALID',
        message: 'Refresh credential is invalid.',
      });
    }

    // Atomic rotate: insert blacklist row + return new pair.
    try {
      const tokens = await this.prisma.$transaction(async (tx) => {
        await tx.invalidatedToken.create({
          data: {
            jti: currentPayload.jti,
            userId: currentPayload.sub,
            expiresAt: new Date(currentPayload.exp * 1000),
          },
        });
        return this.issueSession(currentPayload.sub, user.role);
      });

      this.events.emit({
        event: 'auth.refresh',
        outcome: 'success',
        actorId: currentPayload.sub,
      });
      return tokens;
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        // Concurrent rotation raced — another request already blacklisted this jti.
        this.events.emit({
          event: 'auth.refresh',
          outcome: 'rotated_replay',
          actorId: currentPayload.sub,
          extra: { jti: currentPayload.jti },
        });
        throw new UnauthorizedException({
          code: 'AUTH_REFRESH_REUSED',
          message: 'Refresh credential has already been used.',
        });
      }
      throw err;
    }
  }

  async getMe(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'User not found.',
      });
    }
    return { user: serializeUser(user) };
  }

  async signOut(payload: { sub: string; jti: string; exp: number }) {
    // Idempotent: if the row already exists from a prior sign-out, swallow the unique-violation.
    try {
      await this.prisma.invalidatedToken.create({
        data: {
          jti: payload.jti,
          userId: payload.sub,
          expiresAt: new Date(payload.exp * 1000),
        },
      });
    } catch (err) {
      const e = err as { code?: string };
      if (e.code !== 'P2002') throw err;
    }
    this.events.emit({
      event: 'auth.sign_out',
      outcome: 'success',
      actorId: payload.sub,
    });
  }
}
