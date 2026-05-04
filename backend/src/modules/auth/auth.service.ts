import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
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

  /**
   * Builds a fresh session pair (access + refresh JWT) for a user.
   * Used by register, sign-in, and refresh.
   */
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

  // Phase 3 (T046): sendOtp(phone)
  // Phase 3 (T049): register(...)
  // Phase 4 (T060): signIn(phone, password)
  // Phase 5 (T070): refresh(currentRefreshPayload, rawToken)
  // Phase 5 (T072): getMe(userId)
  // Phase 7 (T100): signOut(currentRefreshPayload)
}