import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthEventLogger } from '../../common/logging/auth-event.logger';
import { TWILIO_VERIFY_CLIENT } from '../twilio/twilio-verify.client.interface';
import type { TwilioVerifyClient } from '../twilio/twilio-verify.client.interface';
import { serializeUser } from './user.serializer';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AuthEventLogger,
    @Inject(TWILIO_VERIFY_CLIENT) private readonly twilio: TwilioVerifyClient,
  ) {}

  /** Used by AuthService for sign-in lookups. */
  findByPhone(phone: string) {
    return this.prisma.extended.user.findUnique({ where: { phone } });
  }

  /** Used by AuthService for getMe / refresh subject lookups. */
  findById(id: string) {
    return this.prisma.extended.user.findUnique({ where: { id } });
  }

  /**
   * Soft-delete-aware lookup of the JWT subject before any privileged
   * write. Access tokens have a 15-minute TTL, so a user soft-deleted
   * within that window could otherwise mutate their profile (FR-007).
   */
  private async assertActiveUser(userId: string) {
    const user = await this.prisma.extended.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHENTICATED',
        message: 'Account not found.',
      });
    }
    return user;
  }

  async updateProfile(
    userId: string,
    dto: { fullName?: string; email?: string },
  ) {
    await this.assertActiveUser(userId);
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { fullName: dto.fullName, email: dto.email },
      });
      return { user: serializeUser(updated) };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002' && e.meta?.target?.includes('email')) {
        throw new ConflictException({
          code: 'EMAIL_IN_USE',
          message: 'Email already in use.',
        });
      }
      throw err;
    }
  }

  async startPhoneChange(userId: string, newPhone: string): Promise<void> {
    const me = await this.assertActiveUser(userId);
    // Reject no-op changes BEFORE incurring SMS cost or hitting the SMS rate limit.
    if (me.phone === newPhone) {
      throw new BadRequestException({
        code: 'PHONE_UNCHANGED',
        message: 'New phone matches your current phone.',
      });
    }
    // Pre-check uniqueness BEFORE incurring SMS cost.
    const existing = await this.prisma.extended.user.findUnique({
      where: { phone: newPhone },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException({
        code: 'PHONE_IN_USE',
        message: 'Phone is already in use.',
      });
    }
    await this.twilio.sendOtp(newPhone);
    this.events.emit({
      event: 'otp.send',
      outcome: 'success',
      actorId: userId,
      extra: { context: 'change-phone' },
    });
  }

  async verifyPhoneChange(
    userId: string,
    dto: { newPhone: string; otpCode: string },
  ) {
    await this.assertActiveUser(userId);
    const verified = await this.twilio.checkOtp(dto.newPhone, dto.otpCode);
    if (!verified) {
      this.events.emit({
        event: 'otp.verify',
        outcome: 'mismatch',
        actorId: userId,
        extra: { context: 'change-phone' },
      });
      throw new UnauthorizedException({
        code: 'AUTH_OTP_INVALID',
        message: 'OTP code does not match or has expired.',
      });
    }
    this.events.emit({
      event: 'otp.verify',
      outcome: 'success',
      actorId: userId,
      extra: { context: 'change-phone' },
    });
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { phone: dto.newPhone, phoneVerified: true },
      });
      return { user: serializeUser(updated) };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002' && e.meta?.target?.includes('phone')) {
        // Race: another account claimed this phone between start and verify.
        throw new ConflictException({
          code: 'PHONE_IN_USE',
          message: 'Phone is already in use.',
        });
      }
      throw err;
    }
  }

  async registerFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.assertActiveUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    });
  }

  /**
   * Phase 3 R6 chokepoint — the ONLY method that mutates User.role.
   * Callable only from inside the modular monolith (admin.service uses it
   * inside the verify / revoke prisma.$transaction; pass `tx` to participate).
   */
  async setRole(
    userId: string,
    nextRole: Role,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    // Prevent role changes on soft-deleted users
    const user = await client.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHENTICATED',
        message: 'Account not found.',
      });
    }

    // Phase 3 only allows customer ↔ chef transitions
    const allowed = new Set<Role>(['customer', 'chef']);
    if (!allowed.has(nextRole)) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_TRANSITION',
        message: `Role transition to ${nextRole} is not permitted.`,
      });
    }
    const current = user.role;
    if (current === nextRole) {
      return; // no-op
    }
    if (
      !(
        (current === 'customer' && nextRole === 'chef') ||
        (current === 'chef' && nextRole === 'customer')
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_TRANSITION',
        message: `Cannot transition from ${current} to ${nextRole}.`,
      });
    }

    await client.user.update({
      where: { id: userId, deletedAt: null },
      data: { role: nextRole },
    });
  }
}
