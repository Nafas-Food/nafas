import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TWILIO_VERIFY_CLIENT } from '../twilio/twilio-verify.client.interface';
import type { TwilioVerifyClient } from '../twilio/twilio-verify.client.interface';
import { AuthEventLogger } from '../../common/logging/auth-event.logger';
import { Role } from '@prisma/client';

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
  ) {}

  async issueSession(userId: string, role: Role): Promise<SessionPair> {
    const accessTtl = parseInt(this.config.getOrThrow<string>('JWT_ACCESS_TTL'), 10);
    const refreshTtl = parseInt(this.config.getOrThrow<string>('JWT_REFRESH_TTL'), 10);
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

  async sendOtp(phone: string): Promise<void> {
    try {
      await this.twilio.sendOtp(phone);
      this.events.emit({ event: 'otp.send', outcome: 'success', extra: { phone: this.maskPhone(phone) } });
    } catch (err) {
      this.events.emit({ event: 'otp.send', outcome: 'provider_failure', extra: { phone: this.maskPhone(phone) } });
      throw err;
    }
  }

  async register(dto: {
    fullName: string;
    phone: string;
    password: string;
    birthdate: Date;
    otpCode: string;
  }) {
    const verified = await this.twilio.checkOtp(dto.phone, dto.otpCode);
    if (!verified) {
      this.events.emit({ event: 'otp.verify', outcome: 'mismatch', extra: { phone: this.maskPhone(dto.phone) } });
      throw new UnauthorizedException({
        code: 'AUTH_OTP_INVALID',
        message: 'OTP code does not match or has expired.',
      });
    }
    this.events.emit({ event: 'otp.verify', outcome: 'success', extra: { phone: this.maskPhone(dto.phone) } });

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          passwordHash,
          birthdate: dto.birthdate,
          phoneVerified: true,
          role: Role.CUSTOMER,
        },
      });

      const tokens = await this.issueSession(user.id, user.role);
      return { user: this.serializeUser(user), ...tokens };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002' && e.meta?.target?.includes('phone')) {
        throw new ConflictException({ code: 'PHONE_IN_USE', message: 'Phone is already in use.' });
      }
      throw err;
    }
  }

  private serializeUser(u: { id: string; phone: string; email: string | null; fullName: string; role: Role; phoneVerified: boolean }) {
    return {
      id: u.id,
      phone: u.phone,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      phoneVerified: u.phoneVerified,
    };
  }

  // Phase 4 (T060): signIn(phone, password)
  // Phase 5 (T070): refresh(currentRefreshPayload, rawToken)
  // Phase 5 (T072): getMe(userId)
  // Phase 7 (T100): signOut(currentRefreshPayload)
}