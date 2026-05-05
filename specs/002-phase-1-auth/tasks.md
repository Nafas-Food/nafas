---
description: "Phase 1 Authentication, Users, Phone Verification — implementation tasks"
---

# Tasks: Authentication, Users, and Phone Verification

**Input**: Design documents from `/specs/002-phase-1-auth/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Branch**: `002-phase-1-auth`
**Repo root**: `C:\Users\faragelo\Desktop\nafas` (referred to below as `<repo>`)

> **Implementer guidance**: Each task is atomic and self-contained.
> File paths are absolute (`<repo>\...`) or repo-relative. Where a file's
> full content matters, the content is inlined verbatim — copy it
> directly. Where a decision is non-obvious, the task points at the
> decision in `research.md` (R1–R12). Where an endpoint contract matters,
> the task points at `contracts/auth.openapi.yaml`. Run commands exactly
> as written. If a command fails, do not improvise — re-read the task
> and the referenced artifact, then ask for help.
>
> **Three clarifications were integrated into the spec** (see
> `spec.md#Clarifications`):
> 1. Password policy: minimum length 8, no character-class rules.
> 2. Rate limit: register/sign-in/refresh capped at 10 per 15 min per IP
>    (send-OTP keeps its tighter ≤3/min/IP). Implemented as a **single
>    global default tier of 10/15min**, with per-route `@Throttle({ default:
>    { limit: 3, ttl: 60_000 } })` overrides on the two SMS-dispatching
>    endpoints (`/auth/send-otp` and `/users/me/change-phone/start`).
>    See research R7 + analysis A1 for why we do NOT use two named tiers
>    globally — they would compound, over-throttling sign-in/refresh.
> 3. Auth event observability: structured logs only, no new database
>    entity (FR-021). Two events from FR-020 — `auth.password_validation`
>    and `auth.rate_limit` — are emitted by the global
>    `HttpExceptionNormalizerFilter` (T014a) rather than by service
>    methods, because the underlying triggers (ValidationPipe rejection
>    and ThrottlerException) happen before any controller code runs.
>
> **Phase 0 invariants this phase MUST preserve**:
> - All `User` reads go through `prismaService.extended.user.*` (the
>   default `deletedAt: null` filter is what implements SC-008).
> - `InvalidatedToken` is hard-delete (no `deletedAt`); use
>   `prismaService.invalidatedToken.*` directly.
> - No raw SQL is introduced; the Phase 0 `$queryRaw` carve-out for the
>   health probe remains the only exception.
> - All money math in Phase 1 is N/A (no money flows here).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks → safe to
  parallelize.
- **[Story]**: Maps to a user story in `spec.md` (`US1`–`US6`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add Phase 1 dependencies, generate the RS256 keypair, and
extend `backend/.env` with the new env vars. No source files are written
yet.

- [X] T001 Verify the working directory and branch. From PowerShell at `<repo>`, run `git rev-parse --abbrev-ref HEAD` and confirm it prints `002-phase-1-auth`. Run `Test-Path specs\002-phase-1-auth\plan.md` and confirm `True`. Run `Test-Path backend\src\main.ts` and confirm `True` (Phase 0 must be in place). Do not proceed unless all three checks pass.

- [X] T002 [P] Install backend Phase 1 dependencies. From `<repo>\backend` run:
  ```powershell
  npm install @nestjs/jwt@10 @nestjs/passport@10 passport@0.7 passport-jwt@4 bcrypt@5 twilio@5 uuid@11
  npm install -D @types/passport-jwt@4 @types/bcrypt@5 @types/uuid@10
  ```
  Expected outcome: `<repo>\backend\package.json` lists all eight packages under `dependencies` / `devDependencies`. `npm ls --depth=0` shows no `UNMET PEER DEPENDENCY` warnings. If `passport-jwt` reports a peer issue with `@nestjs/passport`, accept the listed version and continue.

- [X] T003 [P] Install mobile Phase 1 dependencies. From `<repo>\mobile` run:
  ```powershell
  npx expo install expo-secure-store expo-localization @react-native-async-storage/async-storage axios
  ```
  Expected outcome: `<repo>\mobile\package.json` lists all four packages under `dependencies`. `expo-secure-store`, `expo-localization`, and `@react-native-async-storage/async-storage` versions are pinned by `expo install` to whatever Expo SDK 54 ships; do not override. `axios` should be `^1.x`.

- [X] T004 Generate the RS256 keypair for development. From `<repo>` run:
  ```powershell
  openssl genrsa -out backend\private.pem 2048
  openssl rsa -in backend\private.pem -pubout -out backend\public.pem
  ```
  Then base64-encode both keys (PowerShell):
  ```powershell
  $priv = [Convert]::ToBase64String([IO.File]::ReadAllBytes("backend\private.pem"))
  $pub  = [Convert]::ToBase64String([IO.File]::ReadAllBytes("backend\public.pem"))
  Write-Output "JWT_PRIVATE_KEY=$priv"
  Write-Output "JWT_PUBLIC_KEY=$pub"
  ```
  Copy both lines into the next task. **Then immediately delete the `.pem` files** (they are gitignored already but should not sit in the working tree): `Remove-Item backend\private.pem, backend\public.pem`.

  Expected outcome: two long base64 strings printed. The `.pem` files are no longer present.

- [X] T005 Append Phase 1 env vars to `<repo>\backend\.env` (create the file if it does not exist; remember it is gitignored). Add these lines, substituting the base64 strings from T004 and your real Twilio credentials:
  ```dotenv
  # Phase 1 — JWT (research R3, R4)
  JWT_PRIVATE_KEY=<paste from T004>
  JWT_PUBLIC_KEY=<paste from T004>
  JWT_ACCESS_TTL=900            # 15 minutes (R4)
  JWT_REFRESH_TTL=2592000       # 30 days (R4)
  JWT_ISSUER=nafas

  # Phase 1 — Twilio Verify (research R1)
  TWILIO_ACCOUNT_SID=<your AC... from console.twilio.com>
  TWILIO_AUTH_TOKEN=<your auth token>
  TWILIO_VERIFY_SERVICE_SID=<your VA... from Verify Services console>
  ```
  Expected outcome: `cat backend\.env` shows all eight new keys with values. **Do not commit `.env`.**

- [X] T006 Create `<repo>\backend\.env.example` (this one IS committed — it documents required vars without secrets). Append to it (or create) the following block, then verify it does NOT contain real secrets:
  ```dotenv
  # Phase 1 — JWT (research R3, R4). Generate with `openssl genrsa` then base64-encode.
  JWT_PRIVATE_KEY=
  JWT_PUBLIC_KEY=
  JWT_ACCESS_TTL=900
  JWT_REFRESH_TTL=2592000
  JWT_ISSUER=nafas

  # Phase 1 — Twilio Verify (research R1)
  TWILIO_ACCOUNT_SID=
  TWILIO_AUTH_TOKEN=
  TWILIO_VERIFY_SERVICE_SID=
  ```
  Expected outcome: `<repo>\backend\.env.example` exists and contains the eight keys with empty values.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure every user story depends on. After Phase 2 the auth and users modules exist as empty shells with strategies, guards, decorators, and the Twilio wrapper — no endpoints are implemented yet.

**⚠️ CRITICAL**: No user-story work can begin until Phase 2 is complete.

### Backend — error codes, decorators, logging, guards

- [X] T007 [P] Create `<repo>\backend\src\common\errors\auth-error.codes.ts` with this exact content:
  ```ts
  /**
   * Stable error codes returned by Phase 1 endpoints. The mobile client
   * maps each code to a bilingual message in `mobile/constants/i18n/`.
   * The `message` field on responses is an English fallback for
   * curl-level diagnostics only (see contracts/auth.openapi.yaml).
   */
  /**
   * `AUTH_REFRESH_REUSED` covers BOTH FR-008 (rotated-replay) and
   * FR-009 (signed-out-replay). The platform does not distinguish them
   * externally because both produce the same row in `InvalidatedToken`
   * and FR-021 forbids new entities in Phase 1.
   */
  export const AuthErrorCode = {
    AUTH_OTP_INVALID: 'AUTH_OTP_INVALID',
    AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
    AUTH_REFRESH_INVALID: 'AUTH_REFRESH_INVALID',
    AUTH_REFRESH_REUSED: 'AUTH_REFRESH_REUSED',
    AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',
    PHONE_IN_USE: 'PHONE_IN_USE',
    EMAIL_IN_USE: 'EMAIL_IN_USE',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
  } as const;

  export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
  ```

- [X] T008 [P] Create `<repo>\backend\src\common\decorators\public.decorator.ts` with this exact content:
  ```ts
  import { SetMetadata } from '@nestjs/common';

  export const IS_PUBLIC_KEY = 'isPublic';
  /**
   * Marks a route as bypassing JwtAuthGuard. Used on /auth/send-otp,
   * /auth/register, /auth/sign-in, /auth/refresh.
   */
  export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
  ```

- [X] T009 [P] Create `<repo>\backend\src\common\decorators\roles.decorator.ts` with this exact content:
  ```ts
  import { SetMetadata } from '@nestjs/common';
  import { Role } from '@prisma/client';

  export const ROLES_KEY = 'roles';
  /**
   * Restricts a route to the listed roles. Used by future phases
   * (admin-only endpoints in Phase 3, chef-only in Phase 4 onward).
   * Phase 1 ships the decorator + guard; no route uses it yet.
   */
  export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
  ```

- [X] T010 [P] Create `<repo>\backend\src\common\decorators\current-user.decorator.ts` with this exact content:
  ```ts
  import { createParamDecorator, ExecutionContext } from '@nestjs/common';

  export interface CurrentUserPayload {
    sub: string;        // User.id
    role: 'CUSTOMER' | 'CHEF' | 'ADMIN' | 'DRIVER';
    type: 'access' | 'refresh';
    jti?: string;       // present on refresh credentials
  }

  /**
   * Reads the JWT-derived user payload that JwtStrategy.validate() set
   * on `request.user`. Use as: `@CurrentUser() user: CurrentUserPayload`.
   */
  export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
      const req = ctx.switchToHttp().getRequest();
      return req.user as CurrentUserPayload;
    },
  );
  ```

- [X] T011 Create `<repo>\backend\src\common\logging\correlation-id.context.ts` with this exact content:
  ```ts
  import { AsyncLocalStorage } from 'async_hooks';

  export interface CorrelationStore {
    correlationId: string;
    sourceIp: string;
  }

  /**
   * Per-request scope used by the auth-event logger and any future
   * cross-cutting code that needs the request ID. Set by
   * CorrelationIdMiddleware. Read by AuthEventLogger.
   *
   * This is the same primitive Phase 0 used for AdminContextService —
   * one AsyncLocalStorage instance per concern, by design.
   */
  export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();
  ```

- [X] T012 Create `<repo>\backend\src\common\logging\correlation-id.middleware.ts` with this exact content:
  ```ts
  import { Injectable, NestMiddleware } from '@nestjs/common';
  import { Request, Response, NextFunction } from 'express';
  import { randomUUID } from 'crypto';
  import { correlationStorage } from './correlation-id.context';

  @Injectable()
  export class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
      const headerVal = req.header('x-request-id');
      const correlationId = headerVal && headerVal.length <= 128 ? headerVal : randomUUID();
      const sourceIp = (req.ip ?? req.socket.remoteAddress ?? 'unknown').toString();
      res.setHeader('x-request-id', correlationId);
      correlationStorage.run({ correlationId, sourceIp }, () => next());
    }
  }
  ```

- [X] T013 Create `<repo>\backend\src\common\logging\auth-event.logger.ts` with this exact content:
  ```ts
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
  ```

- [X] T014 Create `<repo>\backend\src\common\logging\logging.module.ts` with this exact content:
  ```ts
  import { Module, Global } from '@nestjs/common';
  import { AuthEventLogger } from './auth-event.logger';

  @Global()
  @Module({
    providers: [AuthEventLogger],
    exports: [AuthEventLogger],
  })
  export class LoggingModule {}
  ```

- [X] T014a Create `<repo>\backend\src\common\errors\http-exception.filter.ts` with this exact content. **This filter delivers three things at once**: (a) normalises every error response to the contract shape `{ code, message, details? }` so `mobile/services/api.ts#errorCodeOf()` can read `data.code` reliably (analysis A6); (b) emits `auth.password_validation outcome=too_short` when the global `ValidationPipe` rejects a password length (analysis A3 / FR-020); (c) emits `auth.rate_limit outcome=tripped` when the global `ThrottlerGuard` throws (analysis A4 / FR-020).
  ```ts
  import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
  import { ThrottlerException } from '@nestjs/throttler';
  import { Request, Response } from 'express';
  import { AuthEventLogger } from '../logging/auth-event.logger';

  interface NormalizedError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }

  @Catch(HttpException)
  export class HttpExceptionNormalizerFilter implements ExceptionFilter {
    constructor(private readonly events: AuthEventLogger) {}

    catch(exception: HttpException, host: ArgumentsHost): void {
      const ctx = host.switchToHttp();
      const res = ctx.getResponse<Response>();
      const req = ctx.getRequest<Request>();
      const status = exception.getStatus();
      const raw = exception.getResponse();

      const normalized = this.normalize(exception, status, raw);

      // Side-effects — emit auth events for the cases FR-020 names that are
      // unreachable from inside controllers/services.
      if (exception instanceof ThrottlerException) {
        this.events.emit({
          event: 'auth.rate_limit',
          outcome: 'tripped',
          extra: { path: req.url, method: req.method },
        });
      } else if (
        normalized.code === 'VALIDATION_ERROR' &&
        Array.isArray(normalized.details?.fields)
      ) {
        const passwordTooShort = (normalized.details!.fields as string[]).some((m) =>
          /password/i.test(m) && /(short|longer|at least|min)/i.test(m),
        );
        if (passwordTooShort) {
          this.events.emit({ event: 'auth.password_validation', outcome: 'too_short' });
        }
      }

      res.status(status).json(normalized);
    }

    private normalize(exception: HttpException, status: number, raw: unknown): NormalizedError {
      // 1) ThrottlerException — uniform rate-limit code
      if (exception instanceof ThrottlerException) {
        return { code: 'AUTH_RATE_LIMITED', message: 'Too many requests. Please retry later.' };
      }

      // 2) Class-validator failure (NestJS ValidationPipe default shape):
      //    { statusCode, message: string[], error: 'Bad Request' }
      if (status === HttpStatus.BAD_REQUEST && typeof raw === 'object' && raw !== null) {
        const obj = raw as { message?: unknown };
        if (Array.isArray(obj.message)) {
          return {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed.',
            details: { fields: obj.message },
          };
        }
      }

      // 3) Our own structured throws — `new ConflictException({ code, message })` etc.
      if (typeof raw === 'object' && raw !== null) {
        const obj = raw as { code?: unknown; message?: unknown };
        if (typeof obj.code === 'string') {
          return {
            code: obj.code,
            message: typeof obj.message === 'string' ? obj.message : 'An error occurred.',
          };
        }
        if (typeof obj.message === 'string') {
          return { code: this.codeFromStatus(status), message: obj.message };
        }
      }

      // 4) String body — bare HttpException('msg', 404) etc.
      if (typeof raw === 'string') {
        return { code: this.codeFromStatus(status), message: raw };
      }

      return { code: this.codeFromStatus(status), message: 'An error occurred.' };
    }

    private codeFromStatus(status: number): string {
      switch (status) {
        case HttpStatus.UNAUTHORIZED:
          return 'AUTH_UNAUTHENTICATED';
        case HttpStatus.FORBIDDEN:
          return 'AUTH_FORBIDDEN';
        case HttpStatus.NOT_FOUND:
          return 'NOT_FOUND';
        default:
          return 'UNKNOWN';
      }
    }
  }
  ```
  Expected outcome: `npm run build` from `<repo>\backend` succeeds. The filter is registered as an `APP_FILTER` provider in T028 (next).

- [X] T015 Create `<repo>\backend\src\common\guards\jwt-auth.guard.ts` with this exact content:
  ```ts
  import { ExecutionContext, Injectable } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { AuthGuard } from '@nestjs/passport';
  import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

  /**
   * Global guard. Every route is authenticated by default; @Public() opts out.
   * Registered as APP_GUARD provider in app.module.ts (T040).
   */
  @Injectable()
  export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private readonly reflector: Reflector) {
      super();
    }

    canActivate(context: ExecutionContext) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) return true;
      return super.canActivate(context);
    }
  }
  ```

- [X] T016 Create `<repo>\backend\src\common\guards\roles.guard.ts` with this exact content:
  ```ts
  import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { Role } from '@prisma/client';
  import { ROLES_KEY } from '../decorators/roles.decorator';
  import type { CurrentUserPayload } from '../decorators/current-user.decorator';

  /**
   * Restricts handlers decorated with @Roles(...) to those roles.
   * Phase 1 ships this guard alongside @Roles() but no Phase 1 route
   * uses it yet (admin/chef restrictions begin in Phase 3).
   */
  @Injectable()
  export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
      const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!required || required.length === 0) return true;
      const user = context.switchToHttp().getRequest().user as CurrentUserPayload | undefined;
      if (!user) throw new ForbiddenException();
      if (!required.includes(user.role as Role)) throw new ForbiddenException();
      return true;
    }
  }
  ```

### Backend — TwilioModule (research R1)

- [X] T017 [P] Create `<repo>\backend\src\modules\twilio\twilio-verify.client.interface.ts` with this exact content:
  ```ts
  /**
   * The narrow interface AuthService and UsersService talk to. The real
   * implementation wraps the Twilio Node SDK; tests inject a mock that
   * never sends SMS. Keeping the interface narrow is what lets us mock
   * cleanly per research R1.
   */
  export interface TwilioVerifyClient {
    sendOtp(phone: string): Promise<void>;
    /**
     * Returns true when Twilio reports `status === 'approved'`,
     * false otherwise. NEVER throws on a wrong code — that is a
     * regular outcome, not an exception.
     */
    checkOtp(phone: string, code: string): Promise<boolean>;
  }

  export const TWILIO_VERIFY_CLIENT = Symbol('TWILIO_VERIFY_CLIENT');
  ```

- [X] T018 Create `<repo>\backend\src\modules\twilio\twilio-verify.service.ts` with this exact content:
  ```ts
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
  ```

- [X] T019 Create `<repo>\backend\src\modules\twilio\twilio.module.ts` with this exact content:
  ```ts
  import { Module } from '@nestjs/common';
  import { ConfigModule } from '@nestjs/config';
  import { TwilioVerifyService } from './twilio-verify.service';
  import { TWILIO_VERIFY_CLIENT } from './twilio-verify.client.interface';

  @Module({
    imports: [ConfigModule],
    providers: [
      TwilioVerifyService,
      { provide: TWILIO_VERIFY_CLIENT, useExisting: TwilioVerifyService },
    ],
    exports: [TWILIO_VERIFY_CLIENT],
  })
  export class TwilioModule {}
  ```

### Backend — JWT strategies (research R3, R5, R8)

- [X] T020 Create `<repo>\backend\src\modules\auth\strategies\jwt.strategy.ts` with this exact content:
  ```ts
  import { Injectable, UnauthorizedException } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { PassportStrategy } from '@nestjs/passport';
  import { ExtractJwt, Strategy } from 'passport-jwt';
  import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

  /**
   * Verifies access credentials presented as `Authorization: Bearer ...`.
   * Refuses any token whose `type` claim is not `'access'` so the
   * refresh credential cannot be used as an access credential by mistake.
   */
  @Injectable()
  export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(config: ConfigService) {
      const publicKey = Buffer.from(
        config.getOrThrow<string>('JWT_PUBLIC_KEY'),
        'base64',
      ).toString('utf8');
      super({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey: publicKey,
        algorithms: ['RS256'],
        issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
      });
    }

    async validate(payload: CurrentUserPayload): Promise<CurrentUserPayload> {
      if (payload.type !== 'access') {
        throw new UnauthorizedException();
      }
      return payload;
    }
  }
  ```

- [X] T021 Create `<repo>\backend\src\modules\auth\strategies\refresh.strategy.ts` with this exact content:
  ```ts
  import { Injectable, UnauthorizedException } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { PassportStrategy } from '@nestjs/passport';
  import { ExtractJwt, Strategy } from 'passport-jwt';
  import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';

  /**
   * Verifies refresh credentials presented in the request body
   * (`{ refreshToken }`). Distinct from JwtStrategy so that JwtAuthGuard
   * (the global default) cannot be bypassed by sending a refresh
   * credential as a Bearer header.
   *
   * The blacklist check (FR-008/009) lives in AuthService.refresh and
   * AuthService.signOut, NOT here — this strategy only verifies signature
   * and expiry. AuthService rejects rotated/revoked credentials by
   * looking them up in InvalidatedToken.
   */
  @Injectable()
  export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor(config: ConfigService) {
      const publicKey = Buffer.from(
        config.getOrThrow<string>('JWT_PUBLIC_KEY'),
        'base64',
      ).toString('utf8');
      super({
        jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
        ignoreExpiration: false,
        secretOrKey: publicKey,
        algorithms: ['RS256'],
        issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
      });
    }

    async validate(payload: CurrentUserPayload): Promise<CurrentUserPayload> {
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException();
      }
      return payload;
    }
  }
  ```

### Backend — AuthModule and UsersModule shells

- [X] T022 Create `<repo>\backend\src\modules\auth\auth.service.ts` with this exact starter content (methods will be filled in by Phase 3+):
  ```ts
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
  ```

- [X] T023 Create `<repo>\backend\src\modules\auth\auth.controller.ts` with this exact starter content (route handlers will be added by Phase 3+):
  ```ts
  import { Controller } from '@nestjs/common';
  import { ApiTags } from '@nestjs/swagger';
  import { AuthService } from './auth.service';

  @ApiTags('Auth')
  @Controller('auth')
  export class AuthController {
    constructor(private readonly auth: AuthService) {}

    // Phase 3 (T047): @Post('send-otp') sendOtp
    // Phase 3 (T050): @Post('register') register
    // Phase 4 (T061): @Post('sign-in') signIn
    // Phase 5 (T071): @Post('refresh') refresh
    // Phase 5 (T073): @Get('me') getMe
    // Phase 7 (T101): @Post('sign-out') signOut
  }
  ```

- [X] T024 Create `<repo>\backend\src\modules\auth\auth.module.ts` with this exact content:
  ```ts
  import { Module } from '@nestjs/common';
  import { JwtModule } from '@nestjs/jwt';
  import { ConfigModule, ConfigService } from '@nestjs/config';
  import { PassportModule } from '@nestjs/passport';
  import { AuthController } from './auth.controller';
  import { AuthService } from './auth.service';
  import { JwtStrategy } from './strategies/jwt.strategy';
  import { RefreshStrategy } from './strategies/refresh.strategy';
  import { PrismaModule } from '../../common/prisma/prisma.module';
  import { TwilioModule } from '../twilio/twilio.module';

  @Module({
    imports: [
      ConfigModule,
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.registerAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const privateKey = Buffer.from(
            config.getOrThrow<string>('JWT_PRIVATE_KEY'),
            'base64',
          ).toString('utf8');
          const publicKey = Buffer.from(
            config.getOrThrow<string>('JWT_PUBLIC_KEY'),
            'base64',
          ).toString('utf8');
          return {
            privateKey,
            publicKey,
            signOptions: {
              algorithm: 'RS256',
              issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
            },
            verifyOptions: {
              algorithms: ['RS256'],
              issuer: config.get<string>('JWT_ISSUER') ?? 'nafas',
            },
          };
        },
      }),
      PrismaModule,
      TwilioModule,
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, RefreshStrategy],
    exports: [AuthService],
  })
  export class AuthModule {}
  ```

- [X] T025 Create `<repo>\backend\src\modules\users\users.service.ts` with this exact starter content (methods filled in by Phase 6):
  ```ts
  import { Injectable, Inject } from '@nestjs/common';
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { TWILIO_VERIFY_CLIENT } from '../twilio/twilio-verify.client.interface';
  import type { TwilioVerifyClient } from '../twilio/twilio-verify.client.interface';
  import { AuthEventLogger } from '../../common/logging/auth-event.logger';

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

    // Phase 6 (T080): updateProfile(userId, dto)
    // Phase 6 (T082): startPhoneChange(userId, dto)
    // Phase 6 (T084): verifyPhoneChange(userId, dto)
    // Phase 6 (T086): registerFcmToken(userId, dto)
  }
  ```

- [X] T026 Create `<repo>\backend\src\modules\users\users.controller.ts` with this exact starter content (handlers added by Phase 6):
  ```ts
  import { Controller } from '@nestjs/common';
  import { ApiTags } from '@nestjs/swagger';
  import { UsersService } from './users.service';

  @ApiTags('Users')
  @Controller('users')
  export class UsersController {
    constructor(private readonly users: UsersService) {}

    // Phase 6 (T081): @Patch('me') updateProfile
    // Phase 6 (T083): @Post('me/change-phone/start') startChangePhone
    // Phase 6 (T085): @Post('me/change-phone/verify') verifyChangePhone
    // Phase 6 (T087): @Post('me/fcm-token') registerFcmToken
  }
  ```

- [X] T027 Create `<repo>\backend\src\modules\users\users.module.ts` with this exact content:
  ```ts
  import { Module } from '@nestjs/common';
  import { UsersController } from './users.controller';
  import { UsersService } from './users.service';
  import { PrismaModule } from '../../common/prisma/prisma.module';
  import { TwilioModule } from '../twilio/twilio.module';

  @Module({
    imports: [PrismaModule, TwilioModule],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
  })
  export class UsersModule {}
  ```

### Backend — wire it all into AppModule and main.ts

- [X] T028 Open `<repo>\backend\src\app.module.ts`. **Add** these imports at the top:
  ```ts
  import { APP_GUARD, APP_FILTER } from '@nestjs/core';
  import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
  import { MiddlewareConsumer, NestModule } from '@nestjs/common';
  import { LoggingModule } from './common/logging/logging.module';
  import { CorrelationIdMiddleware } from './common/logging/correlation-id.middleware';
  import { HttpExceptionNormalizerFilter } from './common/errors/http-exception.filter';
  import { AuthModule } from './modules/auth/auth.module';
  import { UsersModule } from './modules/users/users.module';
  import { TwilioModule } from './modules/twilio/twilio.module';
  import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
  ```
  In the module's `imports` array, **add** (Phase 0 already has `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])` or similar — replace it with this **single default-tier configuration** of `10 / 15 min / IP` per research R7. Tighter caps for SMS-dispatching endpoints are applied per-route via `@Throttle` overrides in T041 and T068 — see analysis A1 for why we deliberately do NOT register a second named tier globally):
  ```ts
  ThrottlerModule.forRoot([
    { name: 'default', ttl: 900_000, limit: 10 },  // FR-016a applies globally; per-route @Throttle overrides for FR-016
  ]),
  LoggingModule,
  TwilioModule,
  AuthModule,
  UsersModule,
  ```
  In the module's `providers` array, **add** these three providers (order matters: JwtAuthGuard runs before ThrottlerGuard so unauthenticated bursts still get throttled; the exception filter runs around everything):
  ```ts
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_FILTER, useClass: HttpExceptionNormalizerFilter },
  ```
  Make `AppModule` implement `NestModule` and export the middleware configuration:
  ```ts
  export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    }
  }
  ```
  Expected outcome: `npm run build` from `<repo>\backend` succeeds with zero TypeScript errors.

- [X] T029 Sanity-check the foundational layer compiles and the app boots. From `<repo>\backend` run:
  ```powershell
  npm run build
  npm run start:dev
  ```
  Expected outcome: server boots without errors. Logs show `AuthModule`, `UsersModule`, `TwilioModule`, `LoggingModule` all initialised. Open http://localhost:3000/api/v1/health (Phase 0 endpoint) and confirm a healthy response. Stop the dev server (Ctrl+C). **Do not proceed if the build fails.**

### Mobile — i18n dictionaries and LanguageContext (research R9)

- [X] T030 [P] Create `<repo>\mobile\constants\i18n\en.ts` with this exact content (Phase 1 keys; later phases append more):
  ```ts
  /**
   * English strings for Phase 1 auth screens. Keys MUST match ar.ts exactly.
   * Add a new key here AND in ar.ts together — never one without the other
   * (Constitution Principle I).
   */
  export const en = {
    common: {
      retry: 'Try again',
      cancel: 'Cancel',
      submit: 'Submit',
      loading: 'Loading...',
    },
    welcome: {
      title: 'Welcome to Nafas',
      tagline: 'Authentic Egyptian home-cooked food, from real homemakers.',
      signIn: 'Sign in',
      createAccount: 'Create an account',
      languageToggle: 'العربية',
    },
    signIn: {
      title: 'Sign in',
      phoneLabel: 'Phone number',
      phonePlaceholder: '+20...',
      passwordLabel: 'Password',
      submit: 'Sign in',
      forgotPassword: 'Forgot your password?',
    },
    register: {
      title: 'Create your account',
      fullNameLabel: 'Full name',
      phoneLabel: 'Phone number',
      passwordLabel: 'Password (8 characters or more)',
      birthdateLabel: 'Date of birth',
      sendCode: 'Send verification code',
    },
    verifyOtp: {
      title: 'Verify your phone',
      subtitle: 'Enter the code we sent to {phone}.',
      codeLabel: 'Verification code',
      submit: 'Verify and create account',
      resend: 'Resend code',
      resendIn: 'Resend in {seconds}s',
    },
    profile: {
      signOut: 'Sign out',
    },
    errors: {
      AUTH_OTP_INVALID: 'The code is incorrect or has expired. Try again.',
      AUTH_INVALID_CREDENTIALS: 'Phone or password is incorrect.',
      AUTH_REFRESH_INVALID: 'Your session is invalid. Please sign in again.',
      AUTH_REFRESH_REUSED: 'Your session has ended. Please sign in again.',
      AUTH_RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
      PHONE_IN_USE: 'This phone number is already in use.',
      EMAIL_IN_USE: 'This email is already in use.',
      VALIDATION_ERROR: 'Please check the form and try again.',
      NETWORK: 'Network error. Check your connection and try again.',
      UNKNOWN: 'Something went wrong. Please try again.',
    },
  } as const;

  /**
   * `as const` makes every leaf in `en` a literal type (e.g. `'Sign in'`),
   * which would prevent `ar.ts` from assigning Arabic strings of its own.
   * `DeepStringify` widens leaves back to `string` while preserving the
   * key shape, so both dictionaries share the same structural contract.
   */
  type DeepStringify<T> = {
    [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
  };

  export type I18nDict = DeepStringify<typeof en>;
  ```

- [X] T031 [P] Create `<repo>\mobile\constants\i18n\ar.ts` with this exact content (Arabic translations; keys MUST match en.ts):
  ```ts
  import type { I18nDict } from './en';

  export const ar: I18nDict = {
    common: {
      retry: 'حاول مرة أخرى',
      cancel: 'إلغاء',
      submit: 'إرسال',
      loading: 'جارٍ التحميل...',
    },
    welcome: {
      title: 'أهلاً بك في نَفَس',
      tagline: 'أكل بيتي مصري أصيل من ربّات بيوت حقيقيات.',
      signIn: 'تسجيل الدخول',
      createAccount: 'إنشاء حساب',
      languageToggle: 'English',
    },
    signIn: {
      title: 'تسجيل الدخول',
      phoneLabel: 'رقم الهاتف',
      phonePlaceholder: '+20...',
      passwordLabel: 'كلمة المرور',
      submit: 'دخول',
      forgotPassword: 'نسيت كلمة المرور؟',
    },
    register: {
      title: 'إنشاء حسابك',
      fullNameLabel: 'الاسم بالكامل',
      phoneLabel: 'رقم الهاتف',
      passwordLabel: 'كلمة المرور (8 أحرف على الأقل)',
      birthdateLabel: 'تاريخ الميلاد',
      sendCode: 'إرسال رمز التحقق',
    },
    verifyOtp: {
      title: 'تحقق من رقمك',
      subtitle: 'أدخل الرمز الذي أرسلناه إلى {phone}.',
      codeLabel: 'رمز التحقق',
      submit: 'تحقق وأنشئ الحساب',
      resend: 'إعادة إرسال الرمز',
      resendIn: 'إعادة الإرسال خلال {seconds} ث',
    },
    profile: {
      signOut: 'تسجيل الخروج',
    },
    errors: {
      AUTH_OTP_INVALID: 'الرمز غير صحيح أو منتهي. حاول مرة أخرى.',
      AUTH_INVALID_CREDENTIALS: 'رقم الهاتف أو كلمة المرور غير صحيحة.',
      AUTH_REFRESH_INVALID: 'الجلسة غير صالحة. الرجاء تسجيل الدخول من جديد.',
      AUTH_REFRESH_REUSED: 'انتهت الجلسة. الرجاء تسجيل الدخول من جديد.',
      AUTH_RATE_LIMITED: 'محاولات كثيرة جدًا. الرجاء الانتظار قليلاً ثم المحاولة مجددًا.',
      PHONE_IN_USE: 'رقم الهاتف مسجَّل بالفعل.',
      EMAIL_IN_USE: 'البريد الإلكتروني مسجَّل بالفعل.',
      VALIDATION_ERROR: 'الرجاء مراجعة البيانات والمحاولة مجددًا.',
      NETWORK: 'مشكلة في الاتصال. تحقق من الإنترنت وحاول مجددًا.',
      UNKNOWN: 'حدث خطأ ما. حاول مرة أخرى.',
    },
  };
  ```

- [X] T032 Create `<repo>\mobile\context\LanguageContext.tsx` with this exact content:
  ```tsx
  import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
  import { I18nManager } from 'react-native';
  import * as Localization from 'expo-localization';
  import * as Updates from 'expo-updates';
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import { en, type I18nDict } from '../constants/i18n/en';
  import { ar } from '../constants/i18n/ar';

  type Locale = 'en' | 'ar';
  const STORAGE_KEY = '@nafas/lang';
  const dicts: Record<Locale, I18nDict> = { en, ar };

  interface LanguageContextValue {
    locale: Locale;
    isRTL: boolean;
    setLocale: (next: Locale) => Promise<void>;
    t: (key: string, vars?: Record<string, string | number>) => string;
    ready: boolean;
  }

  const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

  function lookup(dict: I18nDict, key: string): string {
    const parts = key.split('.');
    let cursor: unknown = dict;
    for (const p of parts) {
      if (typeof cursor !== 'object' || cursor === null || !(p in (cursor as Record<string, unknown>))) {
        return key;
      }
      cursor = (cursor as Record<string, unknown>)[p];
    }
    return typeof cursor === 'string' ? cursor : key;
  }

  function interpolate(s: string, vars?: Record<string, string | number>): string {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }

  export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>('en');
    const [ready, setReady] = useState(false);

    useEffect(() => {
      (async () => {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
        if (stored === 'en' || stored === 'ar') {
          setLocaleState(stored);
          if (I18nManager.isRTL !== (stored === 'ar')) {
            I18nManager.forceRTL(stored === 'ar');
          }
        } else {
          const detected = Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
          setLocaleState(detected);
          if (I18nManager.isRTL !== (detected === 'ar')) {
            I18nManager.forceRTL(detected === 'ar');
          }
        }
        setReady(true);
      })();
    }, []);

    const setLocale = useCallback(async (next: Locale) => {
      await AsyncStorage.setItem(STORAGE_KEY, next);
      const wantRTL = next === 'ar';
      if (I18nManager.isRTL !== wantRTL) {
        I18nManager.forceRTL(wantRTL);
        // Reload required for native primitives to flip direction (R9).
        await Updates.reloadAsync();
      } else {
        setLocaleState(next);
      }
    }, []);

    const t = useCallback(
      (key: string, vars?: Record<string, string | number>) => interpolate(lookup(dicts[locale], key), vars),
      [locale],
    );

    return (
      <LanguageContext.Provider value={{ locale, isRTL: locale === 'ar', setLocale, t, ready }}>
        {children}
      </LanguageContext.Provider>
    );
  }

  export function useLanguage(): LanguageContextValue {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
    return ctx;
  }
  ```

### Mobile — services/api.ts shell + AuthContext shell (filled in US3)

- [X] T033 Create `<repo>\mobile\services\api.ts` with this exact starter content (single-flight refresh interceptor lands in T074):
  ```ts
  import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

  const BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

  /**
   * The single shared Axios instance for every backend call.
   * Phase 1 wires:
   *   - Request interceptor that attaches the access credential (T034 will set it).
   *   - Response interceptor for the single-flight refresh (T074).
   */
  export const api: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
  });

  let accessTokenGetter: () => string | null = () => null;
  export function _setAccessTokenGetter(fn: () => string | null) {
    accessTokenGetter = fn;
  }

  api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const token = accessTokenGetter();
    if (token) {
      cfg.headers.Authorization = `Bearer ${token}`;
    }
    return cfg;
  });

  /** Maps an Axios error to a stable error code the i18n dictionary knows about. */
  export function errorCodeOf(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<{ code?: string }>;
      if (!ax.response) return 'NETWORK';
      const code = ax.response.data?.code;
      if (typeof code === 'string') return code;
    }
    return 'UNKNOWN';
  }
  ```

- [X] T034 Create `<repo>\mobile\context\AuthContext.tsx` with this exact starter content (silent restore + sign-out wiring lands in later tasks):
  ```tsx
  import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
  import * as SecureStore from 'expo-secure-store';
  import { api, _setAccessTokenGetter } from '../services/api';

  const REFRESH_KEY = 'nafas.refreshToken';

  export type Role = 'CUSTOMER' | 'CHEF' | 'ADMIN' | 'DRIVER';

  export interface AuthUser {
    id: string;
    phone: string;
    fullName: string;
    role: Role;
    phoneVerified: boolean;
    email: string | null;
  }

  interface AuthContextValue {
    user: AuthUser | null;
    isLoading: boolean;
    /** Stores the new session pair and updates `user`. Used by sign-in/register/refresh outcomes. */
    setSession: (next: { user: AuthUser; accessToken: string; refreshToken: string }) => Promise<void>;
    /** Clears local state and SecureStore. Server-side revocation lives in a separate task (T101). */
    clearSession: () => Promise<void>;
    getRefreshToken: () => Promise<string | null>;
  }

  const AuthContext = createContext<AuthContextValue | undefined>(undefined);

  export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const accessRef = useRef<string | null>(null);

    useEffect(() => {
      _setAccessTokenGetter(() => accessRef.current);
    }, []);

    const setSession = useCallback(
      async (next: { user: AuthUser; accessToken: string; refreshToken: string }) => {
        accessRef.current = next.accessToken;
        await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken);
        setUser(next.user);
      },
      [],
    );

    const clearSession = useCallback(async () => {
      accessRef.current = null;
      await SecureStore.deleteItemAsync(REFRESH_KEY);
      setUser(null);
    }, []);

    const getRefreshToken = useCallback(() => SecureStore.getItemAsync(REFRESH_KEY), []);

    useEffect(() => {
      // T072 will replace this stub with a silent-restore call to /auth/me.
      setIsLoading(false);
    }, []);

    return (
      <AuthContext.Provider value={{ user, isLoading, setSession, clearSession, getRefreshToken }}>
        {children}
      </AuthContext.Provider>
    );
  }

  export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
  }
  ```

- [X] T035 Create `<repo>\mobile\services\auth.ts` with this exact starter content (functions are filled in by their respective story phases — body is intentionally empty until then):
  ```ts
  import { api } from './api';
  import type { AuthUser } from '../context/AuthContext';

  export interface SessionResponse {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  }

  // Phase 3 (T053): export async function sendOtp(phone: string)
  // Phase 3 (T056): export async function register(...)
  // Phase 4 (T064): export async function signIn(phone, password)
  // Phase 5 (T076): export async function refresh(refreshToken)
  // Phase 5 (T078): export async function getMe()
  // Phase 7 (T103): export async function signOut(refreshToken)

  export {}; // placeholder to keep this a module until Phase 3
  ```

- [X] T036 Open `<repo>\mobile\app\_layout.tsx`. Replace whatever Expo Router scaffolded with this exact content:
  ```tsx
  import React from 'react';
  import { Slot } from 'expo-router';
  import { LanguageProvider, useLanguage } from '../context/LanguageContext';
  import { AuthProvider } from '../context/AuthContext';
  import { ActivityIndicator, View } from 'react-native';

  function ProvidersInner({ children }: { children: React.ReactNode }) {
    const { ready } = useLanguage();
    if (!ready) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      );
    }
    return <>{children}</>;
  }

  export default function RootLayout() {
    return (
      <LanguageProvider>
        <AuthProvider>
          <ProvidersInner>
            <Slot />
          </ProvidersInner>
        </AuthProvider>
      </LanguageProvider>
    );
  }
  ```

**Checkpoint**: Foundation complete. Backend boots with the two new modules wired in; mobile boots with both contexts mounted (no auth screens yet). User-story implementation can now begin.

---

## Phase 3: User Story 1 - A new customer signs up by verifying their phone (Priority: P1) 🎯 MVP

**Goal**: A first-time visitor can register via phone-OTP and walk away signed in. Delivers SC-001, SC-006, SC-007, SC-014.

**Independent Test**: Per quickstart.md Step 3 — fresh device, real SIM, complete the register form, land on the (placeholder) home screen.

### Backend — DTOs

- [X] T037 [P] [US1] Create `<repo>\backend\src\modules\auth\dto\send-otp.dto.ts` with this exact content:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, Matches } from 'class-validator';

  export class SendOtpDto {
    @ApiProperty({ example: '+201234567890', description: 'E.164-formatted phone number.' })
    @IsString()
    @Matches(/^\+[1-9]\d{7,14}$/)
    phone!: string;
  }
  ```

- [X] T038 [P] [US1] Create `<repo>\backend\src\modules\auth\dto\register.dto.ts` with this exact content:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { Type } from 'class-transformer';
  import { IsDate, IsString, Length, Matches, MinLength } from 'class-validator';

  export class RegisterDto {
    @ApiProperty({ example: 'Mona Hassan', minLength: 2, maxLength: 80 })
    @IsString()
    @Length(2, 80)
    fullName!: string;

    @ApiProperty({ example: '+201234567890' })
    @IsString()
    @Matches(/^\+[1-9]\d{7,14}$/)
    phone!: string;

    @ApiProperty({
      example: 'a-strong-passphrase',
      minLength: 8,
      description: 'Password. Minimum length 8, no character-class rules (FR-006a).',
    })
    @IsString()
    @MinLength(8)
    password!: string;

    @ApiProperty({ example: '1990-01-01', format: 'date' })
    @Type(() => Date)
    @IsDate()
    birthdate!: Date;

    @ApiProperty({ example: '123456', pattern: '^\\d{4,8}$' })
    @IsString()
    @Matches(/^\d{4,8}$/)
    otpCode!: string;
  }
  ```

### Backend — AuthService.sendOtp + register (research R1, R10, R12)

- [X] T039 [US1] Open `<repo>\backend\src\modules\auth\auth.service.ts`. Below `issueSession`, add this method:
  ```ts
  async sendOtp(phone: string): Promise<void> {
    try {
      await this.twilio.sendOtp(phone);
      this.events.emit({ event: 'otp.send', outcome: 'success', extra: { phone } });
    } catch (err) {
      this.events.emit({ event: 'otp.send', outcome: 'provider_failure', extra: { phone } });
      throw err; // ConfigService startup errors propagate; provider errors map to 503 by HttpExceptionFilter (Phase 0).
    }
  }
  ```
  Add this import at the top of the file if not present:
  ```ts
  import * as bcrypt from 'bcrypt';
  import { ConflictException, UnauthorizedException } from '@nestjs/common';
  ```

- [X] T040 [US1] In the same file, add the `register` method below `sendOtp`:
  ```ts
  async register(dto: {
    fullName: string;
    phone: string;
    password: string;
    birthdate: Date;
    otpCode: string;
  }) {
    const verified = await this.twilio.checkOtp(dto.phone, dto.otpCode);
    if (!verified) {
      this.events.emit({ event: 'otp.verify', outcome: 'mismatch', extra: { phone: dto.phone } });
      throw new UnauthorizedException({
        code: 'AUTH_OTP_INVALID',
        message: 'OTP code does not match or has expired.',
      });
    }
    this.events.emit({ event: 'otp.verify', outcome: 'success', extra: { phone: dto.phone } });

    const passwordHash = await bcrypt.hash(dto.password, 12); // research R2

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
      // Prisma P2002 = unique constraint violation
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
  ```
  Expected outcome: `npm run build` from `<repo>\backend` succeeds. The method signature is consumed by AuthController in T041.

### Backend — AuthController endpoints (contracts/auth.openapi.yaml /auth/send-otp + /auth/register)

- [X] T041 [US1] Open `<repo>\backend\src\modules\auth\auth.controller.ts`. Replace the file with this exact content (later tasks add more handlers):
  ```ts
  import { Body, Controller, HttpCode, Post } from '@nestjs/common';
  import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
  import { Throttle } from '@nestjs/throttler';
  import { AuthService } from './auth.service';
  import { SendOtpDto } from './dto/send-otp.dto';
  import { RegisterDto } from './dto/register.dto';
  import { Public } from '../../common/decorators/public.decorator';

  @ApiTags('Auth')
  @Controller('auth')
  export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Public()
    @Throttle({ default: { limit: 3, ttl: 60_000 } }) // FR-016 — overrides the global 10/15min default tier
    @Post('send-otp')
    @HttpCode(204)
    @ApiOperation({ summary: 'Request a phone-verification code.' })
    @ApiResponse({ status: 204, description: 'Code dispatched to the verification provider.' })
    async sendOtp(@Body() dto: SendOtpDto): Promise<void> {
      await this.auth.sendOtp(dto.phone);
    }

    @Public()
    @Post('register')
    @HttpCode(201)
    @ApiOperation({ summary: 'Create a customer account after phone-OTP verification.' })
    @ApiResponse({ status: 201, description: 'Account created and signed in.' })
    @ApiResponse({ status: 401, description: 'OTP code does not match or has expired.' })
    @ApiResponse({ status: 409, description: 'Phone already in use.' })
    async register(@Body() dto: RegisterDto) {
      return this.auth.register(dto);
    }

    // Phase 4 (T061): @Post('sign-in')
    // Phase 5 (T071): @Post('refresh')
    // Phase 5 (T073): @Get('me')
    // Phase 7 (T101): @Post('sign-out')
  }
  ```

- [X] T042 [US1] Smoke-test the backend register flow with curl. From `<repo>\backend` run `npm run start:dev`. In another terminal run:
  ```powershell
  # Send OTP — replace +20... with a real number you control
  curl -i -X POST http://localhost:3000/api/v1/auth/send-otp `
    -H "Content-Type: application/json" `
    -d '{"phone":"+20XXXXXXXXXX"}'

  # Register — substitute the code from your SMS
  curl -i -X POST http://localhost:3000/api/v1/auth/register `
    -H "Content-Type: application/json" `
    -d '{"fullName":"Test User","phone":"+20XXXXXXXXXX","password":"password","birthdate":"1990-01-01","otpCode":"<code from SMS>"}'
  ```
  Expected outcome: send-OTP returns 204; register returns 201 with `{ user, accessToken, refreshToken }`. Backend logs show `otp.send outcome=success` then `otp.verify outcome=success`. **The fourth send-OTP within 60s** returns 429.

### Mobile — services/auth.ts methods for US1

- [X] T043 [US1] Open `<repo>\mobile\services\auth.ts`. Add these two functions (keep existing imports):
  ```ts
  export async function sendOtp(phone: string): Promise<void> {
    await api.post('/auth/send-otp', { phone });
  }

  export async function register(input: {
    fullName: string;
    phone: string;
    password: string;
    birthdate: string; // ISO date YYYY-MM-DD
    otpCode: string;
  }): Promise<SessionResponse> {
    const { data } = await api.post<SessionResponse>('/auth/register', input);
    return data;
  }
  ```
  Expected outcome: `npx tsc --noEmit` from `<repo>\mobile` reports zero errors.

### Mobile — auth screens (consult `nafas-design-system` skill before composing)

- [X] T044 [US1] Create `<repo>\mobile\app\(auth)\welcome.tsx`. **Before writing any visual styles, invoke the `nafas-design-system` skill via `/nafas-design-system` to read the welcome-screen mockup and confirm token usage (colours, type scale, button radius, spacing).** Then write a screen with: the brand wordmark, the tagline (key `welcome.tagline`), a primary "Create account" button that routes to `/(auth)/register`, a secondary "Sign in" button to `/(auth)/sign-in`, and a small language toggle that calls `setLocale('ar')` or `setLocale('en')`. All visible text MUST come from `t(...)` (no string literals). All colours MUST use the design-system tokens — no hex literals. `flexDirection` MUST come from layout primitives that read `isRTL`, not be hardcoded.

  Acceptance: the welcome screen renders correctly in both English (LTR) and Arabic (RTL) on a real device. SC-011 spot-check passes.

- [X] T045 [US1] Create `<repo>\mobile\app\(auth)\register.tsx`. Form fields: full name, phone (with `+20` country prefix shown), password (min 8), birthdate (date picker). On submit, call `sendOtp(phone)`; on success, navigate to `/(auth)/verify-otp?phone={phone}&fullName={fullName}&password={password}&birthdate={birthdate}` (pass the form state forward). Show a loading spinner while the request is in flight. On error, map `errorCodeOf(err)` to the matching `errors.*` i18n key and show it inline. All text via `t(...)`; all colours via design-system tokens; reference the `nafas-design-system` skill's form mockup before composition.

- [X] T046 [US1] Create `<repo>\mobile\app\(auth)\verify-otp.tsx`. Read `phone, fullName, password, birthdate` from the route params. Render a 6-digit code input, a 60-second resend timer (button disabled until timer expires; tapping resend calls `sendOtp(phone)` again and resets the timer), and a Verify button. On Verify, call `register({...})`; on success, call `auth.setSession(response)` from `useAuth()` then navigate to `/(tabs)`. On error map the error code via the i18n dictionary. The subtitle uses `t('verifyOtp.subtitle', { phone })`. All text + colours via tokens; reference design-system OTP mockup.

- [X] T047 [US1] Create the (tabs) and (chef) placeholder route groups so post-register navigation doesn't crash:
  - `<repo>\mobile\app\(tabs)\_layout.tsx`:
    ```tsx
    import { Tabs } from 'expo-router';
    export default function TabsLayout() {
      return <Tabs />;
    }
    ```
  - `<repo>\mobile\app\(tabs)\index.tsx`:
    ```tsx
    import { View, Text } from 'react-native';
    export default function HomePlaceholder() {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Customer home (placeholder)</Text>
        </View>
      );
    }
    ```
  - `<repo>\mobile\app\(chef)\_layout.tsx` (same minimal `<Tabs />`).
  - `<repo>\mobile\app\(chef)\index.tsx` (same minimal placeholder text).

**Checkpoint**: User Story 1 fully functional. A new customer can register via phone-OTP on a real device end-to-end (quickstart.md Step 3). SC-001, SC-006, SC-007, SC-014 verifiable.

---

## Phase 4: User Story 2 - A returning customer signs in (Priority: P1)

**Goal**: A registered customer signs in with phone+password and lands on home. Delivers SC-002, SC-008, SC-012, SC-015 (sign-in side).

**Independent Test**: quickstart.md Step 4 — sign in with the credentials registered in Step 3 from a fresh app session.

### Backend

- [X] T048 [P] [US2] Create `<repo>\backend\src\modules\auth\dto\sign-in.dto.ts` with this exact content:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, Matches } from 'class-validator';

  export class SignInDto {
    @ApiProperty({ example: '+201234567890' })
    @IsString()
    @Matches(/^\+[1-9]\d{7,14}$/)
    phone!: string;

    @ApiProperty()
    @IsString()
    password!: string;
  }
  ```

- [X] T049 [US2] In `<repo>\backend\src\modules\auth\auth.service.ts`, inject `UsersService` (constructor parameter — see updated constructor below) and add a `signIn` method. The constructor MUST become:
  ```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: AuthEventLogger,
    @Inject(TWILIO_VERIFY_CLIENT) private readonly twilio: TwilioVerifyClient,
    private readonly users: UsersService,
  ) {}
  ```
  Add the import: `import { UsersService } from '../users/users.service';`. In `auth.module.ts`, add `UsersModule` to the `imports` array (already exported in T027). Update `<repo>\backend\src\modules\users\users.module.ts` to also export `UsersService` (already exported in T027 — verify). Then add this method:
  ```ts
  async signIn(phone: string, password: string) {
    const user = await this.users.findByPhone(phone);
    if (!user) {
      this.events.emit({ event: 'auth.sign_in', outcome: 'unknown_phone', extra: { phone } });
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Phone or password is incorrect.',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      this.events.emit({ event: 'auth.sign_in', outcome: 'password_failure', actorId: user.id });
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Phone or password is incorrect.',
      });
    }
    const tokens = await this.issueSession(user.id, user.role);
    this.events.emit({ event: 'auth.sign_in', outcome: 'success', actorId: user.id });
    return { user: this.serializeUser(user), ...tokens };
  }
  ```
  **Why two `findByPhone` paths return the same external error**: FR-017. The internal log discriminates `unknown_phone` vs `password_failure`, but the response is identical (SC-012). Note: `findByPhone` uses `prisma.extended.user`, so a soft-deleted account returns `null` here, yielding the `unknown_phone` log line and the same generic external error (SC-008).

- [X] T050 [US2] In `<repo>\backend\src\modules\auth\auth.controller.ts`, add the sign-in handler below `register`:
  ```ts
  @Public()
  @Post('sign-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with phone and password.' })
  @ApiResponse({ status: 200, description: 'Sign-in succeeded.' })
  @ApiResponse({ status: 401, description: 'Credentials invalid (generic).' })
  async signIn(@Body() dto: SignInDto) {
    return this.auth.signIn(dto.phone, dto.password);
  }
  ```
  Add the import: `import { SignInDto } from './dto/sign-in.dto';`.

- [X] T051 [US2] Smoke-test the sign-in endpoint:
  ```powershell
  curl -i -X POST http://localhost:3000/api/v1/auth/sign-in `
    -H "Content-Type: application/json" `
    -d '{"phone":"+20XXXXXXXXXX","password":"password"}'
  ```
  Expected: 200 with a session pair. With a wrong password: 401 `AUTH_INVALID_CREDENTIALS`. With an unknown phone: same 401, same message (SC-012). Eleventh attempt within 15 min: 429 `AUTH_RATE_LIMITED` (SC-015).

### Mobile

- [X] T052 [US2] In `<repo>\mobile\services\auth.ts`, add:
  ```ts
  export async function signIn(phone: string, password: string): Promise<SessionResponse> {
    const { data } = await api.post<SessionResponse>('/auth/sign-in', { phone, password });
    return data;
  }
  ```

- [X] T053 [US2] Create `<repo>\mobile\app\(auth)\sign-in.tsx`. Form fields: phone, password. On submit call `signIn(phone, password)`; on success call `auth.setSession(response)` and navigate to `/(tabs)`. On error map `errorCodeOf(err)` to the matching `errors.*` key. All text via `t(...)`; consult `nafas-design-system` skill mockup.

**Checkpoint**: User Story 2 fully functional. Both register and sign-in flows complete on real devices.

---

## Phase 5: User Story 3 - Session is silently kept alive (Priority: P2)

**Goal**: Customer's session survives app cold-starts and silent refreshes; rotated/replayed credentials are rejected. Delivers SC-003, SC-004, SC-005, SC-013.

**Independent Test**: quickstart.md Step 5 (silent refresh) and Step 6 (replay rejection).

### Backend

- [X] T054 [P] [US3] Create `<repo>\backend\src\modules\auth\dto\refresh.dto.ts` with this exact content:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsJWT, IsString } from 'class-validator';

  export class RefreshDto {
    @ApiProperty()
    @IsString()
    @IsJWT()
    refreshToken!: string;
  }
  ```

- [X] T055 [US3] In `<repo>\backend\src\modules\auth\auth.service.ts` add the `refresh` and `getMe` methods (and add the `Inject` import for `JwtService` if not present):
  ```ts
  async refresh(currentPayload: { sub: string; role: Role; jti: string; exp: number }) {
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

    this.events.emit({ event: 'auth.refresh', outcome: 'success', actorId: currentPayload.sub });
    return tokens;
  }

  async getMe(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { user: this.serializeUser(user) };
  }
  ```

- [X] T056 [US3] In `<repo>\backend\src\modules\auth\auth.controller.ts` add the refresh and me handlers below `signIn`:
  ```ts
  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh credential and mint a new session pair.' })
  async refresh(@CurrentUser() payload: CurrentUserPayload & { jti: string; exp: number }) {
    return this.auth.refresh({
      sub: payload.sub,
      role: payload.role as Role,
      jti: payload.jti,
      exp: (payload as unknown as { exp: number }).exp,
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the currently authenticated customer.' })
  async getMe(@CurrentUser() payload: CurrentUserPayload) {
    return this.auth.getMe(payload.sub);
  }
  ```
  Add these imports at the top:
  ```ts
  import { Get, UseGuards } from '@nestjs/common';
  import { AuthGuard } from '@nestjs/passport';
  import { CurrentUser } from '../../common/decorators/current-user.decorator';
  import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
  import { Role } from '@prisma/client';
  ```
  **Important**: The `@Public()` decorator on `refresh` opts out of `JwtAuthGuard` (which would reject the request because there is no Bearer header). The `@UseGuards(AuthGuard('jwt-refresh'))` then runs `RefreshStrategy` (T021) against the `refreshToken` field in the body.

  **Apply rate-limiting on `/auth/refresh`**: it inherits the global `default` tier (10/15min/IP) from the `ThrottlerModule.forRoot` config in T028 — no `@Throttle` decorator needed on the handler.

- [X] T057 [US3] Smoke-test refresh + replay (quickstart.md Step 6):
  ```powershell
  # Sign in to get a session
  $session = (curl -X POST http://localhost:3000/api/v1/auth/sign-in `
    -H "Content-Type: application/json" `
    -d '{"phone":"+20XXXXXXXXXX","password":"password"}') | ConvertFrom-Json
  $rt = $session.refreshToken

  # First refresh succeeds, returns new pair
  $r1 = (curl -X POST http://localhost:3000/api/v1/auth/refresh `
    -H "Content-Type: application/json" `
    -d "{`"refreshToken`":`"$rt`"}") | ConvertFrom-Json

  # Replaying the original refresh token MUST fail with AUTH_REFRESH_REUSED
  curl -i -X POST http://localhost:3000/api/v1/auth/refresh `
    -H "Content-Type: application/json" `
    -d "{`"refreshToken`":`"$rt`"}"
  ```
  Expected: first refresh returns 200 with a new pair; replay returns 401 with `code: AUTH_REFRESH_REUSED`. Backend log shows one `auth.refresh outcome=success` and one `auth.refresh outcome=rotated_replay`.

  Also verify: a malformed body or missing `refreshToken` returns 401 with `code: AUTH_REFRESH_INVALID` (not 400 — body validation runs inside `JwtRefreshGuard`). And: soft-delete a signed-in user via `UPDATE users SET deleted_at = NOW() WHERE id = '<uuid>'`, then refresh with their stored credential → 401 `AUTH_REFRESH_INVALID`, log line `auth.refresh outcome=soft_deleted_account` (FR-008/SC-008 parity).

### Mobile — single-flight refresh interceptor + silent restore

- [X] T058 [US3] In `<repo>\mobile\services\auth.ts` add:
  ```ts
  export async function refresh(refreshToken: string): Promise<SessionResponse> {
    const { data } = await api.post<SessionResponse>('/auth/refresh', { refreshToken });
    return data;
  }

  export async function getMe(): Promise<{ user: AuthUser }> {
    const { data } = await api.get<{ user: AuthUser }>('/auth/me');
    return data;
  }
  ```

- [X] T059 [US3] In `<repo>\mobile\services\api.ts`, append the **single-flight refresh response interceptor** (research R8). Add at the bottom of the file:
  ```ts
  // ---- Single-flight refresh (research R8, delivers SC-005) ----

  type RefreshHook = () => Promise<{ accessToken: string; refreshToken: string }>;

  let refreshHook: RefreshHook | null = null;
  let onRefreshFailure: () => void = () => {};
  /** Called once at startup from AuthContext (T060). */
  export function _setRefreshHook(hook: RefreshHook, onFail: () => void) {
    refreshHook = hook;
    onRefreshFailure = onFail;
  }

  let inflight: Promise<{ accessToken: string }> | null = null;

  api.interceptors.response.use(
    (resp) => resp,
    async (error) => {
      const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
      const status = (error.response?.status as number | undefined) ?? 0;

      // Only handle 401 once, and never on the refresh request itself.
      const isRefreshRequest = original.url === '/auth/refresh';
      if (status !== 401 || original._retried || isRefreshRequest || !refreshHook) {
        throw error;
      }

      original._retried = true;
      try {
        if (!inflight) {
          inflight = (async () => {
            const next = await refreshHook!();
            return { accessToken: next.accessToken };
          })().finally(() => {
            // Allow the next 401 burst (after a future expiry) to start a new refresh.
            // Reset only AFTER all queued retries observe the new credential.
            setTimeout(() => { inflight = null; }, 0);
          });
        }
        await inflight;
        return api(original); // retry with the new credential (request interceptor reads accessTokenGetter)
      } catch (refreshErr) {
        onRefreshFailure();
        throw error;
      }
    },
  );
  ```

- [X] T060 [US3] Open `<repo>\mobile\context\AuthContext.tsx`. Replace the silent-restore stub (the `useEffect` that just sets `setIsLoading(false)`) with a call to `getMe()` plus wire the refresh hook. Also update the imports and add a refresh helper:
  ```tsx
  import { _setRefreshHook } from '../services/api';
  import { refresh, getMe } from '../services/auth';
  ```
  Replace the stub `useEffect` with:
  ```tsx
  useEffect(() => {
    _setRefreshHook(
      async () => {
        const stored = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!stored) throw new Error('NO_REFRESH_TOKEN');
        const next = await refresh(stored);
        accessRef.current = next.accessToken;
        await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken);
        // user remains the same; getMe will be re-fetched on next demand if needed
        return { accessToken: next.accessToken, refreshToken: next.refreshToken };
      },
      () => {
        accessRef.current = null;
        SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
        setUser(null);
      },
    );

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!stored) {
          setIsLoading(false);
          return;
        }
        // Use the refresh credential to mint a fresh access credential, then load the user.
        const session = await refresh(stored);
        accessRef.current = session.accessToken;
        await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
        const me = await getMe();
        setUser(me.user);
      } catch {
        accessRef.current = null;
        await SecureStore.deleteItemAsync(REFRESH_KEY);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);
  ```

- [X] T061 [US3] Make `<repo>\mobile\app\_layout.tsx` route based on auth state. Replace the existing `RootLayout` body with this exact content:
  ```tsx
  import React from 'react';
  import { Slot, useRouter, useSegments } from 'expo-router';
  import { LanguageProvider, useLanguage } from '../context/LanguageContext';
  import { AuthProvider, useAuth } from '../context/AuthContext';
  import { ActivityIndicator, View } from 'react-native';

  function RouteGuard({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    React.useEffect(() => {
      if (isLoading) return;
      const inAuth = segments[0] === '(auth)';
      if (!user && !inAuth) {
        router.replace('/(auth)/welcome');
      } else if (user && inAuth) {
        router.replace(user.role === 'CHEF' ? '/(chef)' : '/(tabs)');
      }
    }, [isLoading, user, segments]);

    if (isLoading) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      );
    }
    return <>{children}</>;
  }

  function ProvidersInner({ children }: { children: React.ReactNode }) {
    const { ready } = useLanguage();
    if (!ready) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      );
    }
    return <RouteGuard>{children}</RouteGuard>;
  }

  export default function RootLayout() {
    return (
      <LanguageProvider>
        <AuthProvider>
          <ProvidersInner>
            <Slot />
          </ProvidersInner>
        </AuthProvider>
      </LanguageProvider>
    );
  }
  ```

- [X] T062 [US3] Verify silent restore on a real device. Sign in (US2), force-quit the app, reopen. Expected: app boots → splash → directly into the (tabs) home screen, no welcome screen, no password prompt. Backend logs show one `auth.refresh outcome=success` line per cold start with a stored refresh credential.

**Checkpoint**: Sessions persist silently, refresh rotates, replays rejected.

---

## Phase 6: User Story 4 - Customer maintains their profile (Priority: P2)

**Goal**: PATCH name/email; phone change requires fresh OTP on the new number; FCM push token registers per device. Delivers SC-009 + FR-014.

**Independent Test**: quickstart.md Step 9.

### Backend — DTOs

- [X] T063 [P] [US4] Create `<repo>\backend\src\modules\users\dto\update-profile.dto.ts`:
  ```ts
  import { ApiPropertyOptional } from '@nestjs/swagger';
  import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

  export class UpdateProfileDto {
    @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
    @IsOptional()
    @IsString()
    @Length(2, 80)
    fullName?: string;

    @ApiPropertyOptional({ format: 'email' })
    @IsOptional()
    @IsEmail()
    email?: string;
  }
  ```

- [X] T064 [P] [US4] Create `<repo>\backend\src\modules\users\dto\change-phone-start.dto.ts`:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, Matches } from 'class-validator';

  export class ChangePhoneStartDto {
    @ApiProperty({ example: '+201234567899' })
    @IsString()
    @Matches(/^\+[1-9]\d{7,14}$/)
    newPhone!: string;
  }
  ```

- [X] T065 [P] [US4] Create `<repo>\backend\src\modules\users\dto\change-phone-verify.dto.ts`:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, Matches } from 'class-validator';

  export class ChangePhoneVerifyDto {
    @ApiProperty({ example: '+201234567899' })
    @IsString()
    @Matches(/^\+[1-9]\d{7,14}$/)
    newPhone!: string;

    @ApiProperty({ example: '123456' })
    @IsString()
    @Matches(/^\d{4,8}$/)
    otpCode!: string;
  }
  ```

- [X] T066 [P] [US4] Create `<repo>\backend\src\modules\users\dto\fcm-token.dto.ts`:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsString, Length } from 'class-validator';

  export class FcmTokenDto {
    @ApiProperty()
    @IsString()
    @Length(1, 4096)
    fcmToken!: string;
  }
  ```

### Backend — service methods

- [X] T067 [US4] Open `<repo>\backend\src\modules\users\users.service.ts`. Add the four methods below:
  ```ts
  import { ConflictException, UnauthorizedException } from '@nestjs/common';

  // Inside the class:

  async updateProfile(userId: string, dto: { fullName?: string; email?: string }) {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { fullName: dto.fullName, email: dto.email },
      });
      return { user: this.serializeUser(updated) };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002' && e.meta?.target?.includes('email')) {
        throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'Email already in use.' });
      }
      throw err;
    }
  }

  async startPhoneChange(userId: string, newPhone: string): Promise<void> {
    // Pre-check uniqueness BEFORE incurring SMS cost
    const existing = await this.prisma.extended.user.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== userId) {
      throw new ConflictException({ code: 'PHONE_IN_USE', message: 'Phone is already in use.' });
    }
    await this.twilio.sendOtp(newPhone);
    this.events.emit({ event: 'otp.send', outcome: 'success', actorId: userId, extra: { context: 'change-phone' } });
  }

  async verifyPhoneChange(userId: string, dto: { newPhone: string; otpCode: string }) {
    const verified = await this.twilio.checkOtp(dto.newPhone, dto.otpCode);
    if (!verified) {
      this.events.emit({ event: 'otp.verify', outcome: 'mismatch', actorId: userId, extra: { context: 'change-phone' } });
      throw new UnauthorizedException({ code: 'AUTH_OTP_INVALID', message: 'OTP code does not match or has expired.' });
    }
    this.events.emit({ event: 'otp.verify', outcome: 'success', actorId: userId, extra: { context: 'change-phone' } });
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { phone: dto.newPhone, phoneVerified: true },
      });
      return { user: this.serializeUser(updated) };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002' && e.meta?.target?.includes('phone')) {
        // Race: another account claimed this phone between start and verify
        throw new ConflictException({ code: 'PHONE_IN_USE', message: 'Phone is already in use.' });
      }
      throw err;
    }
  }

  async registerFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    });
  }

  private serializeUser(u: { id: string; phone: string; email: string | null; fullName: string; role: import('@prisma/client').Role; phoneVerified: boolean }) {
    return {
      id: u.id,
      phone: u.phone,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      phoneVerified: u.phoneVerified,
    };
  }
  ```

### Backend — controller handlers

- [X] T068 [US4] Open `<repo>\backend\src\modules\users\users.controller.ts`. Replace the file with this exact content:
  ```ts
  import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
  import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
  import { UsersService } from './users.service';
  import { UpdateProfileDto } from './dto/update-profile.dto';
  import { ChangePhoneStartDto } from './dto/change-phone-start.dto';
  import { ChangePhoneVerifyDto } from './dto/change-phone-verify.dto';
  import { FcmTokenDto } from './dto/fcm-token.dto';
  import { CurrentUser } from '../../common/decorators/current-user.decorator';
  import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
  import { Throttle } from '@nestjs/throttler';

  @ApiTags('Users')
  @Controller('users')
  export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Patch('me')
    @ApiOperation({ summary: 'Update full name and/or email.' })
    async updateProfile(@CurrentUser() me: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
      return this.users.updateProfile(me.sub, dto);
    }

    @Throttle({ default: { limit: 3, ttl: 60_000 } }) // FR-016 — overrides the global 10/15min default tier (this endpoint dispatches an SMS)
    @Post('me/change-phone/start')
    @HttpCode(204)
    @ApiOperation({ summary: 'Send an OTP to a new phone number.' })
    async startChangePhone(@CurrentUser() me: CurrentUserPayload, @Body() dto: ChangePhoneStartDto) {
      await this.users.startPhoneChange(me.sub, dto.newPhone);
    }

    @Post('me/change-phone/verify')
    @HttpCode(200)
    @ApiOperation({ summary: 'Confirm the phone change by submitting the OTP.' })
    async verifyChangePhone(@CurrentUser() me: CurrentUserPayload, @Body() dto: ChangePhoneVerifyDto) {
      return this.users.verifyPhoneChange(me.sub, dto);
    }

    @Post('me/fcm-token')
    @HttpCode(204)
    @ApiOperation({ summary: 'Register or replace the device push-notification token.' })
    async registerFcmToken(@CurrentUser() me: CurrentUserPayload, @Body() dto: FcmTokenDto) {
      await this.users.registerFcmToken(me.sub, dto.fcmToken);
    }
  }
  ```

- [X] T069 [US4] Smoke-test profile flows (you need a valid access token from a register/sign-in run; capture it as `$at`):
  ```powershell
  # Update name
  curl -i -X PATCH http://localhost:3000/api/v1/users/me `
    -H "Content-Type: application/json" -H "Authorization: Bearer $at" `
    -d '{"fullName":"New Name"}'

  # Start phone change (sends OTP to a NEW number you control)
  curl -i -X POST http://localhost:3000/api/v1/users/me/change-phone/start `
    -H "Content-Type: application/json" -H "Authorization: Bearer $at" `
    -d '{"newPhone":"+20YYYYYYYYYY"}'

  # Verify phone change (submit the code)
  curl -i -X POST http://localhost:3000/api/v1/users/me/change-phone/verify `
    -H "Content-Type: application/json" -H "Authorization: Bearer $at" `
    -d '{"newPhone":"+20YYYYYYYYYY","otpCode":"<code>"}'
  ```
  Expected: name update returns 200 with the new `User`; start returns 204 and an SMS arrives; verify returns 200. Querying the DB between start and verify shows the old phone still on `User.phone`.

### Mobile — services/users.ts and FCM registration on auth

- [X] T070 [US4] Create `<repo>\mobile\services\users.ts` with this exact content:
  ```ts
  import { api } from './api';
  import type { AuthUser } from '../context/AuthContext';

  export async function updateProfile(input: { fullName?: string; email?: string }): Promise<{ user: AuthUser }> {
    const { data } = await api.patch<{ user: AuthUser }>('/users/me', input);
    return data;
  }

  export async function startChangePhone(newPhone: string): Promise<void> {
    await api.post('/users/me/change-phone/start', { newPhone });
  }

  export async function verifyChangePhone(input: { newPhone: string; otpCode: string }): Promise<{ user: AuthUser }> {
    const { data } = await api.post<{ user: AuthUser }>('/users/me/change-phone/verify', input);
    return data;
  }

  export async function registerFcmToken(fcmToken: string): Promise<void> {
    await api.post('/users/me/fcm-token', { fcmToken });
  }
  ```

- [X] T071 [US4] Wire push-token registration after auth resolves. In `<repo>\mobile\context\AuthContext.tsx`, **only when `user` becomes non-null for the first time after a session is established**, call `Notifications.requestPermissionsAsync` and on grant call `Notifications.getExpoPushTokenAsync` then `registerFcmToken(token.data)`. If permission is denied, do nothing — the app continues without FCM (edge case "customer denies push-notification permission"). Use a `useEffect` keyed on `user?.id`. **Note**: `expo-notifications` is already in the Phase 0 dependency list per plan.md "Primary Dependencies"; verify with `npm ls expo-notifications` from `<repo>\mobile`.

  Sketch:
  ```tsx
  import * as Notifications from 'expo-notifications';
  import { registerFcmToken } from '../services/users';

  // Inside AuthProvider:
  useEffect(() => {
    if (!user) return;
    (async () => {
      const perm = await Notifications.getPermissionsAsync();
      let status = perm.status;
      if (status !== 'granted') {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status === 'granted') {
        try {
          const token = await Notifications.getExpoPushTokenAsync();
          await registerFcmToken(token.data);
        } catch {
          // ignore — registration is best-effort
        }
      }
    })();
  }, [user?.id]);
  ```

**Checkpoint**: Profile maintenance + FCM registration complete on real devices.

---

## Phase 7: User Story 5 - Sign out revokes the refresh credential immediately (Priority: P3)

**Goal**: Sign-out blacklists the customer's current refresh credential and clears local state. Replays after sign-out are refused. Delivers FR-009.

**Independent Test**: quickstart.md Step 4 + an explicit replay attempt after sign-out.

- [X] T072 [P] [US5] Create `<repo>\backend\src\modules\auth\dto\sign-out.dto.ts`:
  ```ts
  import { ApiProperty } from '@nestjs/swagger';
  import { IsJWT, IsString } from 'class-validator';

  export class SignOutDto {
    @ApiProperty()
    @IsString()
    @IsJWT()
    refreshToken!: string;
  }
  ```

- [X] T073 [US5] In `<repo>\backend\src\modules\auth\auth.service.ts` add:
  ```ts
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
    this.events.emit({ event: 'auth.sign_out', outcome: 'success', actorId: payload.sub });
  }
  ```

- [X] T074 [US5] In `<repo>\backend\src\modules\auth\auth.controller.ts` add the sign-out handler:
  ```ts
  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('sign-out')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the customer\'s current refresh credential.' })
  async signOut(@CurrentUser() payload: CurrentUserPayload & { jti: string; exp: number }) {
    await this.auth.signOut({
      sub: payload.sub,
      jti: payload.jti,
      exp: (payload as unknown as { exp: number }).exp,
    });
  }
  ```

- [X] T075 [US5] Smoke-test sign-out + replay refusal:
  ```powershell
  # $rt is the current refresh token from a sign-in
  curl -i -X POST http://localhost:3000/api/v1/auth/sign-out `
    -H "Content-Type: application/json" `
    -d "{`"refreshToken`":`"$rt`"}"

  # Replay should now fail with AUTH_REFRESH_REUSED (the same code that
  # would also be returned for a rotated-replay — see analysis A5).
  curl -i -X POST http://localhost:3000/api/v1/auth/refresh `
    -H "Content-Type: application/json" `
    -d "{`"refreshToken`":`"$rt`"}"
  ```
  Expected: sign-out returns 204; refresh returns 401 with `code: AUTH_REFRESH_REUSED` (the platform does not distinguish "rotated" from "revoked" externally — both surface via the rotation/replay path because both write the same row to `InvalidatedToken`). Backend log shows `auth.sign_out outcome=success` then `auth.refresh outcome=rotated_replay`.

  Also verify idempotency: re-running the sign-out command with the same `$rt` returns 204 again (the `P2002` unique-violation is swallowed) and emits a second `auth.sign_out outcome=success` line.

- [X] T076 [US5] In `<repo>\mobile\services\auth.ts` add:
  ```ts
  export async function signOut(refreshToken: string): Promise<void> {
    await api.post('/auth/sign-out', { refreshToken });
  }
  ```

- [X] T077 [US5] Add a placeholder profile screen with sign-out. Replace `<repo>\mobile\app\(tabs)\index.tsx` with this content (or add a new `profile.tsx`; for Phase 1 a single signed-in screen suffices):
  ```tsx
  import React from 'react';
  import { View, Text, Pressable } from 'react-native';
  import { useAuth } from '../../context/AuthContext';
  import { useLanguage } from '../../context/LanguageContext';
  import * as SecureStore from 'expo-secure-store';
  import { signOut as signOutApi } from '../../services/auth';

  export default function HomePlaceholder() {
    const { user, clearSession } = useAuth();
    const { t } = useLanguage();

    const onSignOut = async () => {
      try {
        const stored = await SecureStore.getItemAsync('nafas.refreshToken');
        if (stored) {
          await signOutApi(stored).catch(() => {}); // best-effort server revocation
        }
      } finally {
        await clearSession();
      }
    };

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, marginBottom: 24 }}>
          {user ? `Hello, ${user.fullName}` : 'Loading...'}
        </Text>
        <Pressable onPress={onSignOut} accessibilityRole="button">
          <Text style={{ fontSize: 16 }}>{t('profile.signOut')}</Text>
        </Pressable>
      </View>
    );
  }
  ```
  **Note**: Visual styling is intentionally minimal — the proper customer profile lands in Phase 10. This is an interim sign-out affordance only.

**Checkpoint**: Sign-out revokes immediately; replay refused.

---

## Phase 8: User Story 6 - Bilingual + RTL polish (Priority: P3)

**Goal**: Verify all four auth screens render correctly in both English and Arabic with proper RTL layout, and that the language toggle persists across restarts.

**Independent Test**: quickstart.md Step 2 + Step 3 with device locale set to each language; manual override survives restart.

- [X] T078 [US6] Audit each Phase 1 screen for hardcoded strings and directional literals. Run from `<repo>\mobile`:
  ```powershell
  # Find any user-visible string literal that should be t(...)
  Select-String -Path "app\(auth)\*.tsx","app\(tabs)\*.tsx","app\(chef)\*.tsx" -Pattern '<Text[^>]*>[^{<][^<]*<' -CaseSensitive
  # Find any flexDirection: "row" hardcode that should derive from isRTL
  Select-String -Path "app\(auth)\*.tsx","app\(tabs)\*.tsx" -Pattern 'flexDirection:\s*["'']row' -CaseSensitive
  ```
  Expected: zero matches in either grep. Any match is a bug — replace the literal with `t(...)` from the `LanguageContext` and the `flexDirection` with a `useLanguage().isRTL ? 'row-reverse' : 'row'` (or rely on a design-system layout primitive that does this).

- [X] T079 [US6] Verify the language-toggle persists. On the device:
  1. From the welcome screen, tap the language toggle (currently English → Arabic). The app reloads (R9) and reappears in Arabic with RTL layout.
  2. Force-quit the app and reopen. The app comes up in Arabic again.
  3. Tap the language toggle (Arabic → English). The app reloads and reappears in English LTR.
  4. Force-quit and reopen. The app stays in English.
  Expected: SC-011 passes.

- [X] T080 [US6] Cross-check that every key in `<repo>\mobile\constants\i18n\en.ts` exists in `ar.ts` (and vice versa). The TypeScript type `I18nDict` enforces this at compile time — `npx tsc --noEmit` from `<repo>\mobile` MUST report zero errors. If a key is missing, add the translation in the corresponding file.

**Checkpoint**: Bilingual + RTL parity verified end-to-end.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Swagger surface, end-to-end quickstart pass, FR-019 sample, soft-deleted account check, observability spot-check.

- [X] T081 [P] Verify Swagger documents every Phase 1 endpoint. Boot the backend (`npm run start:dev` from `<repo>\backend`) and open http://localhost:3000/api/v1/docs. Confirm the **Auth** tag lists `send-otp`, `register`, `sign-in`, `refresh`, `sign-out`, `me` and the **Users** tag lists `me`, `me/change-phone/start`, `me/change-phone/verify`, `me/fcm-token`. Each endpoint shows the request body schema with the validation hints from its DTO. The bearer-auth lock icon appears on every authenticated endpoint.

- [X] T082 Run quickstart.md Step 7 (rate-limit verification) to verify FR-016 and FR-016a end-to-end. Confirm the fourth `/auth/send-otp` returns 429 and the eleventh `/auth/sign-in` returns 429.

- [X] T083 Run quickstart.md Step 8 (soft-deleted account refusal). Manually mark a test user as soft-deleted in the DB; attempt sign-in; verify the response is the generic `AUTH_INVALID_CREDENTIALS`; verify the backend log shows `auth.sign_in outcome=unknown_phone`. Restore the row.

- [X] T084 Run quickstart.md Step 11 (FR-019 / SC-010 deferred verification). Send three different body-accepting endpoints with one extra junk field each; confirm each returns 400 with the unexpected-field validation error. This closes Phase 0's deferred SC-006.

- [X] T085 Run quickstart.md Step 5 single-flight verification. With `JWT_ACCESS_TTL=10` (a 10-second access-credential lifetime), sign in, wait 11 seconds, then fire five parallel `GET /auth/me` requests from a script. Backend log MUST show exactly one `auth.refresh outcome=success` for that burst (SC-005). Restore `JWT_ACCESS_TTL` to its production value when done.

- [X] T086 Run quickstart.md closing checklist (`specs/002-phase-1-auth/quickstart.md` final section). Tick every box. The phase is "done" when all eleven boxes are ticked on a real device.

- [X] T087 [P] Update `<repo>\CLAUDE.md` to reflect Phase 1 conventions if anything new emerged (the `update-agent-context.sh` script was already run by `/speckit-plan`; this task only adds anything not auto-detected). For Phase 1 specifically: make sure the file mentions (a) that **all `User` reads go through `prismaService.extended.user.*`** (already in the Phase 0 conventions section); (b) that the global throttler ships **a single default tier of 10 requests / 15 min per IP**, and the two SMS-dispatching endpoints (`/auth/send-otp`, `/users/me/change-phone/start`) override it per-route to `3 / 60 s`; (c) that the global `HttpExceptionNormalizerFilter` (T014a) is the canonical place to emit `auth.password_validation` and `auth.rate_limit` events because they happen before any controller code runs.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS every user story. T029 is the explicit sanity-check before unlocking US-prefixed tasks.
- **US1 (Phase 3)**: Depends on Phase 2.
- **US2 (Phase 4)**: Depends on Phase 2 + T040 (`AuthService.serializeUser` helper).
- **US3 (Phase 5)**: Depends on Phase 2 + a working sign-in (US2) so the silent-restore test has an account to restore.
- **US4 (Phase 6)**: Depends on Phase 2; can technically start in parallel with US3 if a second implementer is available, but the quickstart Step 9 needs a valid access token from US2.
- **US5 (Phase 7)**: Depends on US3 (refresh strategy must exist for sign-out's `@UseGuards(AuthGuard('jwt-refresh'))`).
- **US6 (Phase 8)**: Depends on US1 (the four auth screens must exist) but the i18n dictionary scaffolding lands in Phase 2.
- **Polish (Phase 9)**: Depends on US1–US5 being complete.

### Within Each User Story

- DTOs first (no dependencies on incomplete tasks → marked [P]).
- Service methods next.
- Controller handlers next.
- Smoke test (curl) before mobile work.
- Mobile services next.
- Mobile screens last.

### Parallel Opportunities

- **Setup**: T002 + T003 (independent backend + mobile installs).
- **Foundational**: T007–T010 (all in different files, no dependencies); T014a + T017 + T020 + T021 + T030 + T031 (different files; T014a only depends on T013/T014 which produce the `AuthEventLogger` it consumes).
- **Within US1**: T037 + T038 (different DTO files); T044 + T045 + T046 (three independent mobile screens — but T046 depends on T044/T045 only for navigation — they can be drafted in parallel and integrated in any order).
- **Within US4**: T063 + T064 + T065 + T066 (four independent DTO files).
- **Within US5**: T072 (DTO) is independent of T077 (mobile placeholder).

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001–T006).
2. Complete Phase 2: Foundational (T007–T036).
3. Complete Phase 3: US1 — Register (T037–T047).
4. Complete Phase 4: US2 — Sign in (T048–T053).
5. **STOP and VALIDATE**: A new customer can register and a returning customer can sign in. This is the smallest deployable Phase 1 increment.

### Incremental Delivery

- After MVP: add US3 (silent refresh) — every customer's experience improves invisibly.
- Then US4 (profile + FCM) — customers can fix typos and start receiving push notifications.
- Then US5 (sign-out revocation) — completes the auth lifecycle.
- Then US6 (bilingual polish) — verify and tighten any drift.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- Every `User` read uses `prismaService.extended.user.*` — never `prismaService.user.*`. The CI gate (Phase 0) does not block this directly (the gate only blocks `delete()`), so it is the implementer's discipline that preserves SC-008.
- Every refresh-credential write uses `prismaService.invalidatedToken.*` — direct, because `InvalidatedToken` is a hard-delete entity (no `deletedAt`).
- `bcrypt.hash(password, 12)` is the only acceptable hashing call; never use `bcrypt.hashSync` (blocks the event loop).
- Never log `password`, `passwordHash`, or `otpCode`. The structured-log helper (T013) explicitly does not accept those fields; if you find yourself wanting to log them, stop.
- Stop at any checkpoint to validate independently. The MVP scope (US1 + US2) is genuinely shippable on its own.
- Avoid: same-file conflicts between [P] tasks, cross-story dependencies that break independence, raw SQL of any kind in Phase 1.
