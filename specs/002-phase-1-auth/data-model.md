# Phase 1 Data Model: Authentication, Users, and Phone Verification

Phase 1 introduces **no new entities** — it materialises behaviour for two
entities the constitution already defines and the Foundation phase
already migrated:

- `User` — populated for the first time in this phase (Phase 0 created
  the table; Phase 1 creates the rows).
- `InvalidatedToken` — written to for the first time in this phase
  (Phase 0 migrated the table and stood up the daily cleanup cron; Phase
  1 starts producing real rows on every refresh exchange and every
  sign-out).

This document is the human-readable usage map for those two entities in
Phase 1. The canonical schema lives at `backend/prisma/schema.prisma`;
no field definitions in this document override that schema.

---

## Conventions inherited from Phase 0

- **ID columns**: `User.id` is `@db.Uuid @default(dbgenerated("gen_random_uuid()"))`.
  `InvalidatedToken` is keyed by `jti` (a UUID generated at refresh-credential
  issue time).
- **Timestamps**: `User` carries `createdAt`, `updatedAt`, and the
  Foundation soft-delete marker `deletedAt`. `InvalidatedToken` carries
  `createdAt` only (no soft-delete; rows are pruned by the daily cleanup
  job once `expiresAt < now()`).
- **Reads on `User`**: All Phase 1 reads go through
  `prismaService.extended.user.*`. The Phase 0 Client Extension default-
  filters `deletedAt: null`, so a soft-deleted account is invisible to
  sign-in, refresh, and `/auth/me` lookups by construction (delivers
  SC-008).
- **Writes on `InvalidatedToken`**: Hard-delete entity (no `deletedAt`),
  so writes use the bare client `prismaService.invalidatedToken.create({ data })`.
  CI grep gate is unaffected (the gate only blocks `prisma.<model>.delete(`
  on soft-delete entities).

---

## User

### Fields used in Phase 1

| Field | Type | Phase 1 usage |
|---|---|---|
| `id` | UUID | Subject of every JWT issued; embedded in access and refresh credentials as `sub`. |
| `phone` | String, unique | Primary identity (FR-001). Indexed lookup target for sign-in (`findUnique({ where: { phone } })`). On phone-change (FR-013), this is the field updated, but only after OTP verification on the *new* number. |
| `email` | String?, unique | Editable by the customer via `PATCH /users/me`. Optional. |
| `fullName` | String | Set at registration (FR-004); editable. |
| `birthdate` | Date? | Set at registration (FR-004); not editable in Phase 1 (out of scope). |
| `passwordHash` | String | Set at registration (bcrypt cost 12, R2). Re-hashed on a future password-change flow (out of Phase 1 scope). |
| `role` | enum `Role` | Defaulted to `CUSTOMER` at registration (FR-004). Read by `RolesGuard` on every guarded request. |
| `phoneVerified` | Boolean | Set to `true` when registration's OTP check returns `approved` (FR-003). Set back to `true` after a phone-change OTP completes (FR-013). |
| `fcmToken` | String? | Upserted by `POST /users/me/fcm-token` (FR-014). At most one per customer. |
| `isTest` | Boolean | Defaulted to `false` at registration. Toggled out-of-band (no Phase 1 endpoint). |
| `createdAt` | DateTime | Auto. |
| `updatedAt` | DateTime | Auto. |
| `deletedAt` | DateTime? | Soft-delete marker. Phase 1 never writes this; it is observed on read so that a soft-deleted account is invisible to sign-in (SC-008) and to refresh (FR-008 effectively) — the next refresh exchange MUST be refused, satisfying the spec's edge case "customer is soft-deleted while signed in". |

### Validation rules (DTO-level)

| Rule | Source | Where validated |
|---|---|---|
| `phone` matches E.164 (`+` followed by 8–15 digits) | FR-001 + Twilio Verify input format | `class-validator` `@Matches` on every DTO that accepts `phone`. |
| `password` length ≥ 8 | FR-006a (clarification Q1) | `@MinLength(8)` on `RegisterDto.password`. No character-class rules. |
| `fullName` length 2–80, trimmed | reasonable default | `@Length(2, 80)` + `@Transform(trim)` on `RegisterDto` and `UpdateProfileDto`. |
| `email` is a valid email when present | FR-012 | `@IsOptional()` + `@IsEmail()` on `UpdateProfileDto.email`. |
| `birthdate` is a past ISO date | reasonable default for a customer-age field | `@IsDate()` + a `@MaxDate(now)` custom decorator on `RegisterDto.birthdate`. |
| `otpCode` matches `^\d{4,8}$` | Twilio default code length | `@Matches` on every DTO that submits a code (`RegisterDto`, the phone-change confirm DTO). |
| `fcmToken` length 1–4096 | provider sanity | `@Length(1, 4096)` on `FcmTokenDto.fcmToken`. |

### Lifecycle in Phase 1

```text
[no row] --register (FR-003,004)--> User { phoneVerified=true, role=CUSTOMER, deletedAt=null }
       --PATCH /users/me (FR-012)--> User (fullName/email updated)
       --PATCH /users/me phone-change start (FR-013)--> [no DB write yet] + Twilio sendOtp(newPhone)
       --PATCH /users/me phone-change verify (FR-013)--> User (phone updated, phoneVerified stays true)
       --soft-delete (out of Phase 1 scope)--> User { deletedAt=now } (next refresh refused)
```

### Concurrency / uniqueness invariants

- `phone` is `@unique` at the database layer. A second registration with
  the same number races to the unique-violation path and is mapped to
  the FR-005 conflict error (HTTP `409 PHONE_IN_USE`).
- A phone-change attempt to a number already attached to another verified
  account hits the same uniqueness constraint and is mapped to the
  FR-013 conflict error (HTTP `409 PHONE_IN_USE`).
- `email` is `@unique` at the database layer. The platform maps a
  unique-violation on email to a clear `409 EMAIL_IN_USE` error.

---

## InvalidatedToken

### Fields

| Field | Type | Phase 1 usage |
|---|---|---|
| `jti` | String, primary key | The refresh credential's `jti` claim — a UUID generated at issue time (R5). Inserted on every refresh exchange and every sign-out. |
| `userId` | UUID, FK to `User` | The customer who held the refresh credential. Indexed for support queries ("show me the recent revocations for this customer"). |
| `expiresAt` | DateTime | The original `exp` of the refresh credential. The daily cleanup cron (Phase 0) prunes rows where `expiresAt < now()`, keeping the table bounded. |
| `createdAt` | DateTime | Auto. |

### Lifecycle

```text
                      [client holds refresh credential T0]
T0 used at /auth/refresh
  --> InvalidatedToken { jti: T0.jti, userId, expiresAt: T0.exp }
  --> issue T1 (new access + new refresh)

T0 presented again at /auth/refresh
  --> jti found in InvalidatedToken
  --> 401 AUTH_REFRESH_REUSED      (SC-004 / FR-008)

T1 used at /auth/sign-out
  --> InvalidatedToken { jti: T1.jti, userId, expiresAt: T1.exp }

T1 presented after sign-out
  --> jti found in InvalidatedToken
  --> 401 AUTH_REFRESH_REUSED       (FR-009; same code as the rotated-replay
                                     case because the platform does not
                                     distinguish them externally — FR-021
                                     forbids new entities in Phase 1, so
                                     `InvalidatedToken` carries no
                                     `revokedReason` column.)

[some day]: cleanup cron deletes rows where expiresAt < now()
  --> log line "InvalidatedToken cleanup: removed N expired rows"
```

### Concurrency invariants

- The blacklist insert at refresh time and the issue of the new
  credential pair MUST happen atomically. Implementation uses
  `prismaService.$transaction` so a server crash mid-rotation either
  invalidates the old credential and issues the new one, or does
  neither. Partial states (old invalidated, new never returned to the
  client) cause the next request from the client to fall through to
  re-sign-in — acceptable degraded behaviour, not a data-corruption
  failure.
- The blacklist row is keyed by the refresh credential's `jti` (not its
  full token bytes), so the platform never persists token material. A
  database leak does not leak refresh tokens.

---

## Phase 1's relationship to the schema

- **No new tables.** The constitution defines 16 business entities + the
  `InvalidatedToken` table; Phase 0 migrated all 17. Phase 1 ships zero
  Prisma migrations.
- **No new columns.** Every field Phase 1 reads or writes already exists
  on `User` or `InvalidatedToken`.
- **No new indexes.** The existing `@unique` on `User.phone` and `@unique`
  on `User.email`, plus `@@index([userId])` on `InvalidatedToken`,
  cover Phase 1's hot paths.
- **No new enums.** `Role` already lists `CUSTOMER`, `CHEF`, `ADMIN`,
  `DRIVER`. Phase 1 only ever sets `Role.CUSTOMER` at registration; the
  other values are populated by other phases or seed scripts.

This zero-schema-change posture is itself a constitutional check
(Principle IV — schema is canonical) and an explicit FR (FR-021 — no
audit-log entity in Phase 1).
