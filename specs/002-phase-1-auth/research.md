# Phase 1 Research: Authentication, Users, and Phone Verification

This document resolves every technical decision implied by `spec.md` and
`plan.md` before implementation begins. Each entry follows the
Decision / Rationale / Alternatives format used in Phase 0.

---

## R1 — Phone-verification provider

**Decision**: Use **Twilio Verify** as the platform's phone-verification
provider. The platform never generates, stores, or transmits OTP codes
itself — it calls `verify.services(SID).verifications.create({ to, channel: 'sms' })`
to send and `verify.services(SID).verificationChecks.create({ to, code })`
to check. The platform persists only the *outcome* of a check (the
`phoneVerified` boolean on `User`); the code itself never touches the
platform's data store.

**Rationale**:

- Implementation-plan decision D1 selects Twilio Verify; this research
  confirms the choice survives the spec's vendor-agnostic posture (the
  spec never names Twilio).
- Twilio Verify enforces single-use codes, sane expiry windows, retry
  limits, and SMS routing for Egypt out of the box, so the platform does
  not have to re-implement them. FR-002 requires that code delivery go
  through a third-party provider rather than be platform-generated; this
  is the canonical match.
- The check API returns a clear `status: "approved" | "pending" | ...`
  enum so the platform's mapping to FR-003 (registration refused on a
  missing or stale code) is one line.

**Alternatives considered**:

- *AWS SNS direct SMS*: Rejected — would force the platform to generate,
  store, and expire codes itself, violating FR-002.
- *Firebase Phone Auth*: Rejected — couples authentication to Firebase's
  SDK on the device, and ties session issuance to Firebase tokens
  rather than the platform's own RS256 JWTs.
- *In-house SMS provider integration (Vonage, Infobip)*: Rejected — same
  code-management responsibility as AWS SNS, plus an additional vendor
  relationship for marginal benefit at v1 volumes.

**Cost note**: Open Item A2 in `docs/IMPLEMENTATION_PLAN.md` records
~$0.05/SMS to Egypt; ≈$50/mo at 1000 registrations/month. Acceptable for
v1; revisit at scale.

---

## R2 — Password hashing function and cost factor

**Decision**: Hash customer passwords with **bcrypt at cost factor 12**
via the `bcrypt` Node module. Hash on the backend immediately after DTO
validation; never log, transmit, or echo the plaintext.

**Rationale**:

- Constitution Technology Stack snapshot: "bcrypt (rounds: 12)". This
  research confirms 12 rounds remains an appropriate work factor for the
  expected backend hardware (≈250 ms hash on a modern Linux container) —
  fast enough to keep sign-in latency well under the SC-002 budget,
  slow enough to make offline cracking expensive.
- bcrypt is salted by default and exposes a single tunable knob (cost),
  matching FR-006's "current, salted, work-factor-tunable" requirement.
- The `bcrypt` Node module wraps the OpenBSD reference implementation;
  no platform-specific edge cases on Linux containers.

**Alternatives considered**:

- *argon2id*: Stronger primitive, but adopting it would require a
  constitution amendment (the canonical stack names bcrypt). Park as a
  candidate for a future amendment if a security review prefers it.
- *scrypt*: Same constitution-amendment cost; no clear win over bcrypt
  at the platform's expected load.
- *pbkdf2*: Rejected — no salt-by-default semantics in older Node
  versions, slower per work unit than bcrypt.

---

## R3 — JWT signing algorithm and key custody

**Decision**: Sign both access and refresh JWTs with **RS256**. Keys are
generated once per environment (`openssl genrsa -out private.pem 2048`
plus `openssl rsa -in private.pem -pubout -out public.pem`),
base64-encoded, and stored as `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` in the
per-environment `.env` (never committed). Backend signs with the private
key; backend verifies with the public key. The same keypair signs both
access and refresh credentials — one keypair, simpler rotation path.

**Rationale**:

- RS256 is the constitution's named algorithm; this research confirms it
  remains the right choice (asymmetric keys mean the verifier-side
  guard never holds the signing key, which simplifies any future
  micro-service split documented as a Constitution Principle III
  motivation).
- Base64-encoding around the env boundary preserves the PEM newlines that
  `.env` files mangle. The decoder lives in `AuthModule` startup.
- 2048-bit RSA is adequate at v1 volumes; 4096 doubles signing time for
  no real-world security gain at this scope.

**Alternatives considered**:

- *HS256 with a shared secret*: Rejected — the constitution specifies
  RS256, and a shared HMAC secret would have to live anywhere the JWT
  is verified, undermining a future module-split.
- *EdDSA (Ed25519)*: Modern and faster, but not in the constitution and
  not all `passport-jwt` versions support it cleanly. Same amendment
  cost as bcrypt swaps.
- *Separate keypair for refresh*: Rejected — doubles the rotation
  ceremony for no clear benefit; the refresh credential's `jti` is
  already independently revocable through the blacklist.

---

## R4 — Access and refresh credential lifetimes

**Decision**: Access credential lifetime **15 minutes**; refresh
credential lifetime **30 days**. Both are configurable via env vars
(`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`) so a Phase 12 hardening pass can
tighten without code changes.

**Rationale**:

- 15-minute access matches typical consumer-app practice and keeps the
  blast radius of a leaked access credential bounded. Combined with the
  single-flight refresh interceptor (R8), the customer never feels the
  expiry.
- 30-day refresh aligns with the customer experience the spec describes
  ("a customer signed in last week, closes the app, takes the bus to
  work, opens the app again" — User Story 3). Long enough for typical
  reopening cadence, short enough that an undetected stolen device
  loses its session within a month.
- Both are env-configurable; Phase 12 can shorten if the security audit
  recommends it (FR-016a's "MAY be tightened, not loosened" pattern
  applies in spirit).

**Alternatives considered**:

- *5 min access / 7 day refresh* (banking-app stricter pattern):
  Rejected for v1 — would force more frequent re-signs-in for
  legitimate customers without a corresponding threat model. Available
  via env tweak if Phase 12 demands it.
- *No expiry on refresh*: Rejected — violates FR-007 ("both MUST have a
  finite expiry").

**Spec compatibility**: FR-007 only requires "access < refresh, both
finite, refresh rotates on use", so picking concrete values is a plan
choice, not a spec change.

---

## R5 — Refresh credential representation (signed vs opaque)

**Decision**: Refresh credentials are **signed JWTs** with the same
RS256 keypair as access credentials, distinguished by a `type: "refresh"`
claim and carrying a unique `jti` (random UUID). The platform records
`jti` in the `InvalidatedToken` table on every use (rotation) and on
sign-out (revocation).

**Rationale**:

- Reusing one signing path (one strategy class, one key pair, one
  verification routine) is the simplest model. The blacklist takes care
  of single-use semantics; the JWT shape takes care of expiry, signature,
  and ownership.
- The `jti` is the natural primary key for the blacklist row, matching
  the `InvalidatedToken { jti @id }` schema Phase 0 migrated.
- Distinguishing access vs refresh by claim, not by separate strategies,
  keeps the `JwtAuthGuard` global default a one-strategy guard that
  doesn't have to know about refresh-credential shape.

**Alternatives considered**:

- *Opaque random tokens looked up in a sessions table*: Rejected — would
  add a new entity (constitution amendment territory) and centralise
  session lookups in a hot path. The blacklist-on-rotate approach
  achieves the same single-use guarantee with no schema growth.
- *Refresh JWT signed by a separate keypair*: Rejected — see R3.

---

## R6 — Refresh credential storage on the device

**Decision**: Mobile holds the refresh credential in **Expo SecureStore**
(iOS Keychain / Android Keystore). The access credential lives **only in
React state** inside `AuthContext` and is never written to any persistent
storage. AsyncStorage is reserved for non-sensitive preferences (language
override, last-seen tutorial flag).

**Rationale**:

- Implementation-plan D4d names SecureStore explicitly. SecureStore
  encrypts at rest with the OS-managed keychain, dramatically raising
  the bar against a casual device-level credential lift compared to
  AsyncStorage's plaintext-on-disk.
- Keeping the access credential in memory only means a force-quit clears
  it; the next app open silently mints a new one from the refresh
  credential, restoring the session per User Story 3 acceptance scenario 1.
- The `LanguageContext` and any user preferences continue to use
  AsyncStorage — they are not security-sensitive and benefit from
  AsyncStorage's simplicity.

**Alternatives considered**:

- *AsyncStorage for refresh*: Rejected — plaintext on the device.
- *Cookie-style HTTP-only*: Not applicable to a native app.
- *No persistent refresh (only access in memory)*: Rejected — would
  force the customer to re-sign-in on every app cold start, breaking
  User Story 3.

---

## R7 — Rate-limit storage and the multi-instance question

**Decision**: Use `@nestjs/throttler` with its **default in-memory
storage** in v1, configured with **a single default tier** of `10
requests / 15 min per IP`. Routes that need a tighter cap (`/auth/send-otp`
per FR-016, and `/users/me/change-phone/start` because it also dispatches
SMS) override that single tier on a per-route basis with
`@Throttle({ default: { limit: 3, ttl: 60_000 } })`. Routes that need no
override (register, sign-in, refresh, sign-out, profile updates) inherit
the default tier as-is.

**Rationale**:

- The constitution's Security gates section specifies "10 req / 15 min
  per IP via `@nestjs/throttler`" globally on `/auth/*`. The spec
  narrows this for `send-otp` (FR-016) and matches it elsewhere
  (FR-016a). Both rules satisfy the constitution.
- **Single-tier with per-route override** avoids the trap that
  multi-tier throttler configs cause in `@nestjs/throttler` v5+: when
  multiple named tiers are configured globally, ALL of them apply to
  every route by default, and `@Throttle({tier:...})` only OVERRIDES one
  tier without disabling the others. Sticking to a single named tier
  means each route is governed by exactly one cap — the route's own
  override or the global default — and never the intersection of two.
- In-memory storage is correct for v1's single-backend-instance
  deployment (Phase 13 ships one container behind nginx). Phase 12's
  load test (k6 at 100 concurrent users) verifies the limit kicks in
  predictably from a single source.
- Phase 13 may horizontally scale; if so, the throttler will need a
  shared store (Redis was rejected as a stack addition in
  implementation-plan D3, so a Postgres-backed throttler store would
  be the consistent choice). **Open item recorded**: revisit at the
  point of horizontal scale-out.

**Alternatives considered**:

- *Two named tiers (`auth-strict` 3/min + `auth-default` 10/15min)
  configured globally, override `auth-strict` per route*: Rejected — see
  the "single tier" rationale above. With this configuration the
  tighter cap silently still applies to register/sign-in/refresh
  alongside the default cap, over-throttling legitimate customers on
  shared NATs and breaking the quickstart Step 7 assertion that the
  *eleventh* sign-in trips 429 (the *fourth* would trip first).
- *Redis-backed throttler*: Rejected — would re-open the D3 decision to
  add Redis to the stack, which the project deliberately avoided.
- *Postgres-backed throttler now*: Rejected — single-instance v1
  doesn't need it; adding it now is premature complexity per
  Constitution Principle VII (scope discipline) in spirit.

---

## R8 — Single-flight refresh on the mobile client

**Decision**: `mobile/services/api.ts` exports an Axios instance with a
**request interceptor** that attaches the current access credential and
a **response interceptor** that, on a `401 Unauthorized`, queues the
failing request, fires exactly one `POST /auth/refresh`, and on success
retries every queued request with the new access credential. While a
refresh exchange is in flight, additional 401s join the same queue
rather than firing concurrent refreshes. On refresh failure (any 4xx
from `/auth/refresh`), the interceptor calls `AuthContext.signOut()` and
routes the customer to `(auth)/welcome`.

**Implementation pattern**:

- One module-level `Promise<RefreshResult> | null` held in a closure.
- Response interceptor: `if (status === 401 && !isRefreshRequest)`,
  await the in-flight promise (or start one if `null`), then retry
  with new credential.
- Single-flight guarantees SC-005: N parallel 401s → exactly one
  refresh exchange.

**Rationale**:

- This pattern is the de facto Axios-with-rotating-tokens recipe and is
  well-tested across the React Native ecosystem.
- Server side, FR-008 already protects against the parallel-refresh
  thundering herd by rejecting reused refresh credentials. The client's
  single-flight is a UX nicety and a server-load reducer, not a security
  control.

**Alternatives considered**:

- *Refresh proactively before the access credential expires*: Considered
  for v2. Adds clock-management complexity on the client (requires
  parsing JWT expiry) for no immediate benefit; the reactive-on-401 path
  is simpler and equally invisible to the user.
- *Background refresh in a worker*: Out of scope for Expo's runtime
  model in v1.

---

## R9 — Bilingual + RTL infrastructure

**Decision**: Implement `mobile/context/LanguageContext.tsx` as a React
Context that:

1. On mount, reads the customer's manual override from AsyncStorage
   (`@nafas/lang`); if absent, falls back to `expo-localization`'s
   detected device locale; if neither produces `en` or `ar`, defaults
   to `en`.
2. Calls `I18nManager.forceRTL(locale === 'ar')` and reloads the app
   bundle (`Updates.reloadAsync()`) on every locale change so RTL
   primitives reorient consistently.
3. Exposes `{ locale, isRTL, setLocale, t }` where `t(key, vars?)`
   pulls from `mobile/constants/i18n/en.ts` or `ar.ts` keyed dictionary.
4. Persists `setLocale` calls to AsyncStorage so the manual override
   survives restarts (User Story 6 acceptance scenario 2).

All four Phase 1 auth screens consume `LanguageContext` and reference
the `nafas-design-system` skill's welcome / form / OTP mockups for
visual composition. No screen contains hardcoded strings or
`flexDirection: "row"` literals; layout flips read `isRTL` through
the design-system layout primitives.

**Rationale**:

- `expo-localization` is already in the Phase 0 dependency manifest;
  Phase 1 begins consuming it.
- `I18nManager.forceRTL` + bundle reload is the only reliable way to
  make every native primitive (TextInput, ScrollView, default padding
  shortcuts) flip direction; doing this once per locale change is the
  Expo-recommended pattern.
- AsyncStorage is non-sensitive — language override stored in
  plaintext is acceptable and saves the SecureStore round-trip cost on
  every app open.

**Alternatives considered**:

- *Per-screen `isRTL` flags without `forceRTL`*: Rejected — produces
  half-flipped layouts (text mirrors but native scrollbars don't).
- *Server-side localisation*: Rejected for Phase 1 — error messages
  shown to the customer are localised on the client by mapping
  server-returned error *codes* to bilingual strings; this keeps the
  server responses language-neutral and the client able to switch
  language without a round-trip.

---

## R10 — Structured logging for auth events (FR-020)

**Decision**: Use NestJS's built-in `Logger` with a JSON formatter and
emit one structured line per significant auth event named in FR-020.
Implement a tiny helper, `auth-event.logger.ts`, that takes
`{ event, outcome, actorId?, sourceIp, correlationId, extra? }` and
calls `logger.log(JSON.stringify(payload))`. A correlation ID middleware
(`correlation-id.middleware.ts`) reads `x-request-id` from the inbound
request (or generates a UUID if absent), attaches it to a
`AsyncLocalStorage` request-scope, and the helper reads from that scope
so callers don't have to pass it explicitly.

**Event set** (matches FR-020):

| Event | Outcomes | Notes |
|---|---|---|
| `otp.send` | `success`, `provider_failure` | `provider_failure` fires when Twilio's `verifications.create` throws (T039 catches and re-emits before re-throwing). |
| `otp.verify` | `success`, `mismatch` | `TwilioVerifyService.checkOtp` (T018) collapses Twilio errors into `false` returns, so a transient provider failure surfaces as `mismatch` for verify; observable distinction lives on `otp.send` only. |
| `auth.sign_in` | `success`, `password_failure`, `unknown_phone` | A soft-deleted account surfaces as `unknown_phone` because the `User` lookup goes through the extended Prisma client's default soft-delete filter; the soft-delete distinction persists on `auth.refresh` only (where a bare-client lookup can detect it). The rate-limit trip is logged separately under `auth.rate_limit`. |
| `auth.refresh` | `success`, `rotated_replay`, `soft_deleted_account` | `rotated_replay` covers BOTH FR-008 (used-then-presented-again) and FR-009 (signed-out-then-presented) because both produce the same row in `InvalidatedToken`; distinguishing them would require a schema change which FR-021 forbids in Phase 1. |
| `auth.sign_out` | `success` | Idempotent — replays of an already-revoked credential do not emit a second `success`. |
| `auth.password_validation` | `too_short` | Emitted by the global `HttpExceptionFilter` (T014a) when the `ValidationPipe` rejection's field error names `password` and `Length`/`MinLength`. |
| `auth.rate_limit` | `tripped` | Emitted by the global `HttpExceptionFilter` (T014a) when it catches `ThrottlerException`. Covers all routes (FR-016 + FR-016a). |

**Rationale**:

- FR-020 mandates structured logs; JSON-formatted `Logger` calls satisfy
  this with zero new dependencies.
- AsyncLocalStorage for the correlation ID matches the pattern Phase 0
  already established for the admin-context escape hatch (R2 in Phase 0
  research) — same primitive, same propagation guarantees.
- FR-021 is satisfied by *not* writing to the database; the helper only
  emits log lines.

**Alternatives considered**:

- *Pino directly via `nestjs-pino`*: Considered. Adds one dependency for
  a marginally faster JSON formatter. Acceptable swap if the in-process
  logger ever shows up in profiling; not necessary in v1.
- *Add an `AuthAuditLog` Prisma model*: Rejected — FR-021 explicitly
  forbids this in Phase 1 without a constitution amendment.

---

## R11 — OTP code validity window

**Decision**: Use Twilio Verify's **default 10-minute validity window**.
The platform does not configure a tighter window for Phase 1.

**Rationale**:

- Twilio enforces single-use semantics regardless of window, and the
  10-minute default is a reasonable trade-off between "customer types
  the code in two minutes" and "customer's phone is on a slow
  network and the SMS arrives 90 seconds late". Tightening to 5 minutes
  would give a noticeable bump in user-visible failures with no real
  security gain (codes are short-lived in any case and rate-limited).
- The provider controls the window; the platform stays vendor-agnostic
  per FR-002. If a future security audit prefers a tighter window, it
  is a Twilio Service configuration change, not a code change.

**Alternatives considered**:

- *5-minute window*: Rejected for v1 (more user-visible failures).
- *Platform-managed window with custom expiry*: Rejected — FR-002
  forbids platform-generated codes.

---

## R12 — Generic sign-in error to prevent phone enumeration (FR-017)

**Decision**: `AuthService.signIn(phone, password)` distinguishes "phone
not registered" from "wrong password" only in its **internal logging**
(via R10). The HTTP response is a single error: HTTP `401 Unauthorized`
with a stable error code (`AUTH_INVALID_CREDENTIALS`) and a generic
localisable message ("Phone or password is incorrect"). No
discriminator field hints at which side failed.

**Rationale**:

- FR-017 requires this; the test (SC-012) is "wrong password and
  unknown phone return the same externally visible message in 100% of
  cases".
- Internal logging still distinguishes the two outcomes (R10's
  `auth.sign_in` outcomes `password_failure` vs `unknown_phone`) so
  support can debug a real customer's "I can't sign in" ticket without
  exposing the difference to the network.

**Alternatives considered**:

- *Different HTTP status codes for the two cases*: Rejected — leaks
  the same enumeration signal as a different message.
- *Same message but different error codes*: Rejected — clients can
  read codes too; FR-017 calls for indistinguishability "externally
  visible".
