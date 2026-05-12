# Implementation Plan: Authentication, Users, and Phone Verification

**Branch**: `002-phase-1-auth` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-phase-1-auth/spec.md`

## Summary

Phase 1 stands up the **identity substrate** every later phase depends on:
the way a person becomes a recognised customer of Nafas, the way the
platform recognises them on subsequent visits, and the way the platform
keeps that recognition safely alive. Concretely it delivers: (1) three new
backend modules — `AuthModule`, `UsersModule`, and a thin `TwilioModule`
wrapper around Twilio Verify — that expose four **public** routes
(`/auth/send-otp`, `/auth/register`, `/auth/sign-in`, `/auth/refresh`)
and six **authenticated** routes (`/auth/sign-out`, `/auth/me`,
`/users/me`, `/users/me/change-phone/start`, `/users/me/change-phone/verify`,
`/users/me/fcm-token`); (2) RS256 access + refresh
credentials with single-use refresh-token rotation backed by the existing
`InvalidatedToken` table (Phase 0 migrated the table, scheduled the daily
cleanup, and verified its no-op pass; Phase 1 starts populating it);
(3) `JwtAuthGuard` registered as the global default with a `@Public()`
opt-out and a `RolesGuard` + `@Roles()` decorator that future phases will
consume; (4) `bcrypt(12)` password storage and a server-side ≥8-character
length rule per FR-006/FR-006a (no character-class rules); (5) per-IP rate
limiting via `@nestjs/throttler` configured with a **route-level**
`@Throttle({ auth: { limit: 3, ttl: 60_000 } })` override on
`/auth/send-otp` and `/users/me/change-phone/start` (both dispatch SMS),
and a shared `auth` tier of ≤10/15min on all remaining auth endpoints, matching
Constitution
§Security gates and FR-016/FR-016a; (6) a structured-log auth-event surface
(NestJS `Logger` with JSON output + a request correlation ID) for every
significant auth event named in FR-020, with FR-021 deliberately keeping
the auth-event audit out of the data store; (7) on the mobile side, an
`AuthContext` that holds the access credential in memory only and the
refresh credential in Expo SecureStore (per implementation-plan D4d), an
Axios `services/api.ts` with a single-flight refresh interceptor that
queues 401s during a refresh exchange, and a route guard
(`app/_layout.tsx`) that fans signed-in users to either the customer tab
bar or the chef tab bar based on the role surfaced by `/auth/me`; (8) a
`LanguageContext` bound to `expo-localization` + AsyncStorage that
honours the device locale on first run, persists a manual override across
restarts, and flips `I18nManager.forceRTL` for Arabic — all four Phase 1
auth screens (welcome, sign-in, register, verify-OTP) are bilingual and
RTL-correct end-to-end, satisfying Constitution Principle I and FR-018;
(9) Swagger documentation for every Phase 1 endpoint at
`/api/v1/docs` with bearer-auth annotations.

## Technical Context

**Language/Version**: TypeScript 5.x across all three workspaces (unchanged
from Phase 0).

**Primary Dependencies** (new in Phase 1, layered on Phase 0):

- Backend: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`,
  `bcrypt`, `twilio`, `nestjs-pino` (or built-in `Logger` configured with
  a JSON formatter), `uuid` (for refresh-credential `jti`).
- Mobile: `expo-secure-store`, `expo-localization`, `axios`,
  `@react-native-async-storage/async-storage`.

**Storage**: PostgreSQL 15 via Supabase (per-contributor projects, Phase 0
convention). Phase 1 reads/writes only the `User` table (already migrated
in Phase 0) and writes to the `InvalidatedToken` table (also migrated in
Phase 0). No schema changes — FR-021 explicitly forbids introducing a
persisted audit-log entity in Phase 1; if that becomes necessary later, a
constitution amendment is the prerequisite.

**Testing**:

- Backend: Jest + `@nestjs/testing` + Supertest for integration tests
  against a Supabase test project. The Twilio Verify SDK is mocked at the
  module boundary (a `TwilioVerifyClient` interface) so tests neither
  send real SMS nor incur cost. Integration coverage targets every
  acceptance scenario in `spec.md` and every success criterion that can
  be exercised in-process (SC-003 through SC-016).
- Mobile: A first round of unit tests for the Axios single-flight refresh
  interceptor (the most subtle piece of logic in this phase). End-to-end
  on-device verification is exercised via the quickstart (`quickstart.md`)
  rather than scripted automation in v1.

**Target Platform**:

- Backend: Linux container (`node:20-slim`), `docker-compose.dev.yml`
  bring-up unchanged from Phase 0.
- Mobile: iOS 15+ / Android API 24+ via Expo SDK 54. Phase 1 is the first
  phase that ships customer-facing screens.
- Admin: not exercised in Phase 1. Admin sign-in (a separate flow on
  Next.js + NextAuth) lands in Phase 3.

**Project Type**: Same monorepo with three sibling workspaces. Phase 1
fills three previously empty backend module folders (`auth/`, `users/`,
`twilio/`), four new mobile screens under `app/(auth)/`, two new mobile
context modules, and the `services/{api,auth,users}.ts` ground floor.

**Performance Goals**:

- Sign-up flow on a real device under 90 seconds end-to-end (SC-001).
- Sign-in on a real device under 15 seconds end-to-end (SC-002).
- Single-flight refresh: when N parallel requests receive 401, exactly one
  refresh exchange fires (SC-005, verified with N ≥ 5).
- Auth event log lines emit in-process with no additional database write
  (FR-020) so log emission does not contend with the request-path
  transaction.

**Constraints**:

- No new entities (FR-021 + Constitution Principle IV — schema is
  canonical).
- No raw SQL (Constitution Principle IV — Phase 1 introduces no new
  exception; the only `$queryRaw` carve-out remains the Phase 0 health
  probe).
- No client-trusted role claims (Constitution Principle II — JWTs are
  verified server-side; role decisions go through `RolesGuard`).
- No plaintext password ever stored, logged, transmitted, or echoed
  (FR-006).
- The refresh-token blacklist lives in Postgres only — no Redis, no
  external cache (implementation-plan D3, confirmed in Phase 0).
- Refresh credential lives in Expo SecureStore on the device, never in
  AsyncStorage or React state (D4d).
- Rate-limit storage is in-memory in v1 (`@nestjs/throttler` default).
  Multi-instance deployments (Phase 13) will need a shared store; an open
  item is recorded in `research.md` R7.
- All four Phase 1 auth screens MUST consume `t(key)`; no hardcoded
  strings (Constitution Principle I, FR-018).
- No manual RTL layout branching. `I18nManager.forceRTL` is the single
  source of truth for layout direction. Reusable components do not
  accept an `isRTL` prop for layout purposes. All text stylesheets use
  `textAlign: 'left'` (auto-mirrored by the native layer) and logical
  spacing properties (`marginStart`/`marginEnd`, `paddingStart`/
  `paddingEnd`).

**Scale/Scope**:

- Three new backend modules + four new mobile screens + two new mobile
  context modules. Backend surface adds six authenticated endpoints
  (sign-out, me, users/me, change-phone/start, change-phone/verify,
  fcm-token) and four public/unauthenticated endpoints (send-otp,
  register, sign-in, refresh). Two new common-layer pieces (`JwtAuthGuard`
  global default, `RolesGuard`). Twelve i18n strings on average per
  screen × four screens × two locales ≈ 100 localised strings to seed in
  `mobile/constants/i18n/{en,ar}.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial Gate (pre-research)

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | Phase 1 is the first phase to ship customer-facing UI; the plan installs the bilingual + RTL infrastructure (`LanguageContext`, `expo-localization`, AsyncStorage persistence, `I18nManager.forceRTL`) before any of the four auth screens. SC-011 verifies 100% string localisation and end-to-end RTL on a real device. No hardcoded strings or directional literals introduced. |
| II | Server-Authoritative Trust Boundary | PASS | All token issuance, signature verification, role decisions, OTP verification, and rate-limit checks happen on the backend. The mobile app receives credentials and routes off them; it never *decides* a role. `RolesGuard` reads role from the verified JWT subject, never from a client claim. |
| III | Modular Monolith with Strict Module Boundaries | PASS | Three new modules (`auth`, `users`, `twilio`) each with a published service interface. `UsersModule` calls `TwilioModule.sendOtp()` through its injected service for the phone-change OTP step (FR-013) — never reaches into Twilio internals. `AuthModule` consumes `UsersService` for the customer lookup, not `prisma.user` directly. No domain logic in `common/`; the `JwtAuthGuard` and `RolesGuard` live in `common/guards/` (infrastructure, not domain). |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | No schema changes — Phase 0 migrated `User` and `InvalidatedToken` already. Sign-in lookups go through `prismaService.extended.user.findUnique({ where: { phone } })` so soft-deleted accounts disappear from the result (FR for User Story 2 acceptance scenario 3 / SC-008). The refresh-credential blacklist write goes through the bare `prismaService.invalidatedToken.create({ data })` — `InvalidatedToken` is a hard-delete entity (no `deletedAt`), so the bare client is correct. FR-021 forbids new entities; this gate explicitly carries that forward. |
| V | Design-System-First UI | PASS | All four auth screens (welcome, sign-in, register, verify-OTP) reference the `nafas-design-system` skill before composition. Colours via `useColors()`, Inter typography at the documented scale, button/input/chip components matching the design-system previews. The welcome screen specifically targets the welcome mockup in the skill. No hex literals, no one-off shadows. |
| VI | Auditable, Reversible Order Lifecycle | PASS | No order-state code ships in Phase 1. The principle is non-applicable to this phase; schema slots remain untouched. |
| VII | Scope Discipline & Documented Non-Goals | PASS | Phase 1 explicitly excludes (per spec Assumptions): chef sign-up (Phase 3 admin verification), admin sign-up (Phase 13 seeding), driver auth (v1 non-goal), global-sign-out, and real-time soft-delete revocation. Push-token register is the only "v1 reserved capability" touched, and it is the active path the constitution describes — not a non-goal. |

**Initial gate verdict**: PASS — proceed to Phase 0 research.

### Post-Design Gate (after Phase 1 artifacts)

Re-evaluated after `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md` were produced.

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | `quickstart.md` exercises both English and Arabic on a real device; `research.md` R9 fixes the LanguageContext + RTL behaviour. The contract spec (`contracts/auth.openapi.yaml`) returns server-side error codes only — error *messages* shown to the user are localised on the client, so no English-only message can leak from the server. |
| II | Server-Authoritative Trust Boundary | PASS | The OpenAPI contract describes only the verbs and responses; no client-trusted computations leak through. The single-flight refresh decision sits on the client, but the server still rejects every reused refresh credential regardless (R8). |
| III | Modular Monolith with Strict Module Boundaries | PASS | `data-model.md` and the project tree show `modules/{auth,users,twilio}` with no cross-module Prisma reads. `AuthModule` declares its dependency on `UsersService` and `TwilioVerifyService` via constructor injection. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | `data-model.md` confirms zero new entities. Every read against `User` documents the `prismaService.extended` path; `InvalidatedToken` writes use the bare client (hard-delete entity). The Phase 0 CI grep gate continues to enforce the soft-delete contract for any future code. |
| V | Design-System-First UI | PASS | `quickstart.md` lists the four auth screens and the design-system tokens each consumes; `research.md` R9 cross-references the `nafas-design-system` skill mockups. |
| VI | Auditable, Reversible Order Lifecycle | PASS | Non-applicable; no order-state code in this phase. |
| VII | Scope Discipline & Documented Non-Goals | PASS | The OpenAPI contract intentionally omits a global-sign-out path and a chef-sign-up path; the data-model carries `Role.ADMIN` / `Role.CHEF` / `Role.DRIVER` only as enum values without Phase 1 code paths that mint such accounts. |

**Post-design gate verdict**: PASS — no Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/002-phase-1-auth/
├── spec.md                       # Feature specification (with 3 clarifications)
├── plan.md                       # This file
├── research.md                   # Phase 0 output: technical decisions
├── data-model.md                 # Phase 1 output: User + InvalidatedToken usage map
├── quickstart.md                 # Phase 1 output: end-to-end auth verification path
├── contracts/
│   └── auth.openapi.yaml         # /auth/* + /users/me + /users/me/fcm-token
├── checklists/
│   └── requirements.md           # Authored during /speckit-specify
└── tasks.md                      # Phase 2 output (NOT this command)
```

### Source Code (repository root, additions for Phase 1)

```text
nafas/
├── backend/
│   ├── src/
│   │   ├── main.ts                                      # No changes;
│   │   │                                                # global pipe + helmet
│   │   │                                                # + throttler installed
│   │   │                                                # in Phase 0 are reused
│   │   ├── app.module.ts                                # +AuthModule,
│   │   │                                                # +UsersModule, +TwilioModule;
│   │   │                                                # JwtAuthGuard registered as
│   │   │                                                # APP_GUARD provider
│   │   ├── modules/
│   │   │   ├── health/                                  # (Phase 0)
│   │   │   ├── auth/                                    # NEW
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts                   # public: send-otp,
│   │   │   │   │                                        # register, sign-in, refresh;
│   │   │   │   │                                        # auth'd: sign-out, me
│   │   │   │   ├── auth.service.ts                      # register, sign-in,
│   │   │   │   │                                        # refresh, sign-out, me
│   │   │   │   ├── strategies/
│   │   │   │   │   └── jwt.strategy.ts                  # single strategy;
│   │   │   │   │                                        # access vs refresh
│   │   │   │   │                                        # distinguished by
│   │   │   │   │                                        # `type` claim (R5)
│   │   │   │   └── dto/
│   │   │   │       ├── send-otp.dto.ts
│   │   │   │       ├── register.dto.ts
│   │   │   │       ├── sign-in.dto.ts
│   │   │   │       └── refresh.dto.ts
│   │   │   ├── users/                                   # NEW
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.controller.ts                  # PATCH /users/me,
│   │   │   │   │                                        # POST /users/me/change-phone/start,
│   │   │   │   │                                        # POST /users/me/change-phone/verify,
│   │   │   │   │                                        # POST /users/me/fcm-token
│   │   │   │   ├── users.service.ts                     # findByPhone, update,
│   │   │   │   │                                        # changePhone (OTP-gated)
│   │   │   │   └── dto/
│   │   │   │       ├── update-profile.dto.ts
│   │   │   │       ├── change-phone-start.dto.ts
│   │   │   │       ├── change-phone-verify.dto.ts
│   │   │   │       └── fcm-token.dto.ts
│   │   │   └── twilio/                                  # NEW
│   │   │       ├── twilio.module.ts
│   │   │       ├── twilio-verify.service.ts             # sendOtp, checkOtp
│   │   │       └── twilio-verify.client.interface.ts    # mocked in tests
│   │   ├── common/
│   │   │   ├── prisma/                                  # (Phase 0)
│   │   │   ├── admin-context/                           # (Phase 0)
│   │   │   ├── jobs/                                    # (Phase 0)
│   │   │   ├── decorators/                              # NEW
│   │   │   │   ├── public.decorator.ts                  # @Public()
│   │   │   │   ├── roles.decorator.ts                   # @Roles(Role.ADMIN, ...)
│   │   │   │   └── current-user.decorator.ts            # @CurrentUser()
│   │   │   ├── guards/                                  # NEW
│   │   │   │   ├── jwt-auth.guard.ts                    # APP_GUARD; honours @Public()
│   │   │   │   └── roles.guard.ts                       # honours @Roles(...)
│   │   │   └── logging/                                 # NEW
│   │   │       ├── correlation-id.middleware.ts         # x-request-id pass-through
│   │   │       └── auth-event.logger.ts                 # JSON-formatted emit helper
│   │   └── ...
│   ├── test/                                            # +auth.e2e-spec.ts,
│   │                                                    # +users.e2e-spec.ts
│   ├── package.json                                     # +bcrypt, +twilio,
│   │                                                    # +@nestjs/jwt,
│   │                                                    # +@nestjs/passport,
│   │                                                    # +passport, +passport-jwt
│   └── ...
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx                                  # NEW (Phase 1 ships
│   │   │                                                # the route guard)
│   │   ├── (auth)/
│   │   │   ├── welcome.tsx                              # NEW
│   │   │   ├── sign-in.tsx                              # NEW
│   │   │   ├── register.tsx                             # NEW
│   │   │   └── verify-otp.tsx                           # NEW
│   │   ├── (tabs)/                                      # placeholder created
│   │   │                                                # in Phase 1 (empty home)
│   │   └── (chef)/                                      # placeholder created
│   │                                                    # in Phase 1 (empty home)
│   ├── context/                                         # NEW
│   │   ├── AuthContext.tsx                              # access in memory,
│   │   │                                                # refresh in SecureStore
│   │   └── LanguageContext.tsx                          # expo-localization +
│   │                                                    # AsyncStorage + isRTL
│   ├── services/                                        # NEW
│   │   ├── api.ts                                       # Axios instance,
│   │   │                                                # single-flight refresh
│   │   ├── auth.ts                                      # sendOtp, register, signIn,
│   │   │                                                # refreshToken, signOut,
│   │   │                                                # getMe
│   │   └── users.ts                                     # updateProfile,
│   │                                                    # changePhoneStart,
│   │                                                    # changePhoneVerify,
│   │                                                    # registerFcmToken
│   ├── constants/
│   │   └── i18n/
│   │       ├── en.ts                                    # Phase 1 keys (~50)
│   │       └── ar.ts                                    # Phase 1 keys (~50)
│   └── ...
├── admin/                                               # No Phase 1 changes
└── ...
```

**Structure Decision**: Same monorepo and three-workspace layout the
Foundation phase chose. Phase 1 fills three previously-empty backend
module folders, four new mobile auth screens, and the mobile-side
context + services ground floor. No new top-level folders are introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The Constitution Check both pre-research and post-design
returned PASS for all seven principles. Phase 1 introduces no new schema
entities (FR-021), no new raw-SQL exceptions, no new top-level projects,
and no deprecated APIs. The only "new" cross-cutting concern — request
correlation IDs for the structured-log auth-event surface — is implemented
as a Nest middleware in `common/logging/`, consistent with the
infrastructure-not-domain rule that governs `common/` per Constitution
Principle III.
