import { Injectable, Logger } from '@nestjs/common';
import { correlationStorage } from './correlation-id.context';

export type AuthEventType =
  | 'otp.send'
  | 'otp.verify'
  | 'auth.sign_in'
  | 'auth.refresh'
  | 'auth.sign_out'
  | 'auth.password_validation'
  | 'auth.rate_limit';

export type AuthEventOutcome =
  | 'success'
  | 'provider_failure'
  | 'mismatch'
  | 'expired'
  | 'password_failure'
  | 'unknown_phone'
  | 'soft_deleted_account'
  | 'rate_limited'
  | 'blacklisted'
  | 'rotated_replay'
  | 'too_short'
  | 'tripped';

export interface AuthEventInput {
  event: AuthEventType;
  outcome: AuthEventOutcome;
  actorId?: string;
  extra?: Record<string, string | number | boolean | null>;
}

/**
 * Emits one structured JSON line per auth event (FR-020).
 * The plaintext password and OTP code MUST NEVER be passed in `extra`.
 * Verified by SC-016 in quickstart step 11 / closing checklist.
 */
@Injectable()
export class AuthEventLogger {
  private readonly log = new Logger('AuthEvent');

  emit(input: AuthEventInput) {
    const store = correlationStorage.getStore();
    const payload = {
      event: input.event,
      outcome: input.outcome,
      actorId: input.actorId ?? null,
      sourceIp: store?.sourceIp ?? 'unknown',
      correlationId: store?.correlationId ?? 'unknown',
      timestamp: new Date().toISOString(),
      ...(input.extra ?? {}),
    };
    this.log.log(JSON.stringify(payload));
  }
}