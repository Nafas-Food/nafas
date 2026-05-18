# nafas Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-15

## Active Technologies
- TypeScript 5.x across all three workspaces (unchanged — 002-phase-1-auth)
- PostgreSQL 15 via Supabase (per-contributor projects, Phase 0 — 002-phase-1-auth)
- `firebase-admin` for FCM push delivery (new in 004-phase-3-chefs)

- TypeScript 5.x across all three workspaces (001-phase-0-foundation)
- Backend: Node.js 20 LTS, NestJS 10, Prisma 5, `@nestjs/swagger`, `@nestjs/throttler`, `@nestjs/schedule`, `@nestjs/terminus`, `helmet`, `class-validator`, `class-transformer`, `decimal.js`
- Mobile (scaffold only): Expo SDK 54, Expo Router v6, TypeScript
- Admin (scaffold only): Next.js 14 App Router, TypeScript, Tailwind CSS
- PostgreSQL 15 via Supabase (one project per contributor)
- Supabase Storage with public-read buckets

## Project Structure

```text
backend/
  prisma/
    schema.prisma          # Canonical 18-table schema
    migrations/            # Forward-versioned migrations
  src/
    main.ts                # NestJS bootstrap
    app.module.ts          # Root module
    modules/
      health/              # HealthModule (US1)
    common/
      prisma/              # PrismaService + soft-delete extension
      admin-context/       # AsyncLocalStorage escape hatch
      jobs/                # Scheduled cleanup jobs
  scripts/
    ci-no-hard-delete.sh   # CI grep gate
  assets/
    defaults/              # Default chef logo + banner placeholders
mobile/                    # Expo SDK 54 scaffold
admin/                     # Next.js 14 scaffold
```

## Commands

```bash
# Backend (from backend/)
npm run build       # TypeScript compilation
npm run lint        # ESLint
npm test            # Jest
npx prisma generate # Regenerate Prisma Client
npx prisma migrate status  # Schema-drift check

# Mobile (from mobile/)
npx tsc --noEmit    # Type-check only

# Admin (from admin/)
npx tsc --noEmit    # Type-check only
npm run build       # Next.js build
```

## Code Style

TypeScript 5.x across all three workspaces: Follow standard conventions. All monetary math uses `decimal.js`; never call `Number()` on a Decimal field.

## Recent Changes
- 004-phase-3-chefs: Chef application + admin verification/rejection/revocation, public chef discovery (pure-Prisma bounding-box + JS Haversine), chef profile self-edit, seeded categories + admin CRUD/reorder, firebase-admin FCM, role-driven mobile tab switch.
- 003-phase-2-addresses: Saved customer addresses + map picker, FR-013 in-flight-order delete safety rail, coordinate-redaction in error responses.
- 002-phase-1-auth: Authentication (RS256 JWT), Twilio Verify OTP, refresh-token rotation + blacklist, single-tier throttler.
- 001-phase-0-foundation: Scaffolded backend (NestJS), mobile (Expo), admin (Next.js), canonical Prisma schema, soft-delete extension, health endpoint.

<!-- MANUAL ADDITIONS START -->
## Phase 0 conventions (do not regress)

- All reads on soft-delete models go through
  `prismaService.extended.<model>` (e.g.,
  `prismaService.extended.user.findMany(...)`,
  `prismaService.extended.user.findUnique({ where: { id } })`). The
  extension transparently filters or post-filters `deletedAt`. The bare
  `prismaService.<model>` client is reserved for the health probe and
  migration tooling only.
- Hard `prisma.<model>.delete(...)` on soft-delete entities is blocked at
  CI by `backend/scripts/ci-no-hard-delete.sh`. Use
  `prisma.<model>.softDelete({ id })` instead — the extension takes the
  where clause directly (not wrapped in another `{ where: ... }`).
- The admin-context escape hatch lives in
  `backend/src/common/admin-context/admin-context.service.ts`. A handler
  that legitimately needs deleted rows wraps its call in
  `adminContext.run({ includeDeleted: true }, () => ...)`. The wrapper is
  only valid inside admin-only handlers (Phase 11 will wire the role
  guard); Phase 0 ships the mechanism, not the gating.
- Every monetary field is `Decimal(10,2)` and is delivered as a JS
  string. Do all money math with `decimal.js`. Never call
  `Number(amount)`.
- Each contributor uses their own free-tier Supabase project. There is
  no shared dev secret store.

## Phase 1 conventions (do not regress)

- The global `@nestjs/throttler` configuration registers **a single
  default tier** named `default` (research R7 — never add a second
  named tier globally; multi-tier configs compound and over-throttle).
  Its baseline is `60 requests / 60 s / IP` — a sane API default that
  authenticated normal-use polling can tolerate. Sensitive endpoints
  tighten it per-route via `@Throttle({ default: {...} })`:
  - **FR-016** (SMS / cost-protected): `/auth/send-otp`,
    `/users/me/change-phone/start` → `limit: 3, ttl: 60_000`.
  - **FR-016a** (credential-stuffing slow-down): `/auth/register`,
    `/auth/sign-in`, `/auth/refresh` → `limit: 10, ttl: 900_000`.
  Per-route overrides reuse the `default` tier name to stay within the
  single-tier rule.
- The global `HttpExceptionNormalizerFilter`
  (`backend/src/common/errors/http-exception.filter.ts`) is the
  canonical place to emit `auth.password_validation` and
  `auth.rate_limit` structured-log events, because the underlying
  triggers (`ValidationPipe` rejection and `ThrottlerException`) happen
  before any controller code runs.
## Phase 2 conventions (do not regress)

- `OrdersService.hasActiveOrderForAddress` is the **canonical** chokepoint
  for checking whether an address is in use by a non-terminal order.
  `AddressesService` (and any future service) MUST call this method
  instead of reading `prisma.order` directly — Constitution Principle III.
- Single-find ownership shape: every `UserAddress` mutation (update,
  delete) re-derives the owner from the JWT `sub` claim via
  `findOwnedOrThrow`. An address owned by a different customer returns
  the same `404 ADDRESS_NOT_FOUND` as a genuinely missing ID (FR-015,
  SC-006).
- The global `HttpExceptionNormalizerFilter` now also scrubs
  `latitude`, `longitude`, and `coordinates` keys from every error
  response payload (FR-021 / SC-012) and emits
  `address.* / {validation_rejected, not_found}` structured-log events
  for `/api/v1/addresses/*` paths (FR-019, C1 fix). The filter is the
  single chokepoint for both responsibilities — do NOT introduce a
  controller-level `AddressEventFilter`.
- Address-mutation structured logs use `AddressEventLogger`
  (`backend/src/common/logging/address-event.logger.ts`), a sibling
  to the Phase 1 `AuthEventLogger`. Both stamp the same envelope keys
  (`event`, `outcome`, `actorId`, `sourceIp`, `correlationId`,
  `timestamp`). A future cleanup phase MAY merge them into one
  namespaced logger.
- `mobile/hooks/useColors.ts` is the **only** place hex literals are
  allowed in the mobile app. All Phase 2 components consume tokens via
  the `useColors()` hook — zero hex literals in components (Constitution
  Principle V).
- Google Maps API keys are stored exclusively in
  `mobile/app.config.ts` (read from `process.env.GOOGLE_MAPS_API_KEY_IOS`
  and `process.env.GOOGLE_MAPS_API_KEY_ANDROID`). Each key is
  platform-restricted in the Cloud Console. `mobile/.env` is gitignored.
- Soft-delete on `UserAddress` goes through
  `prismaService.extended.userAddress.softDelete({ id })`. The CI
  grep gate (`backend/scripts/ci-no-hard-delete.sh`) continues to
  enforce this.
## Phase 3 conventions (do not regress)

- The Phase 3 cooldown gate in `ChefApplicationService.assertEligibleToApply`
  is the ONLY Phase 3 code path that reads the bare `prismaService.chef.*`
  client. The deviation is named in research R4 and commented at the call
  site; every other Phase 3 read on a soft-delete entity goes through
  `prismaService.extended.<model>.*`.
- Role transitions (customer → chef on verify, chef → customer on revoke)
  happen exclusively in `users.service.setRole(userId, nextRole, tx?)` and
  are called from `admin.service` inside the same `prisma.$transaction`
  that writes the Chef state change and the Notification row. NO other
  Phase 3 code writes `User.role` (research R6).
- `notifications.service.create({ userId, type, title, body, data?, tx? })`
  is the ONLY way Phase 3 code writes a Notification row. The `tx` parameter
  lets the call participate in a surrounding `prisma.$transaction`.
  Push delivery is best-effort (`dispatchPush(...)`) after the transaction
  commits — failure logs but never throws.
- `storage.service.upload(bucket, path, buffer, mimeType)` is the ONLY way
  Phase 3 code writes to Supabase Storage. Chef logo / banner uploads
  accept JPEG / PNG / WebP, ≤ 5 MB (validated by the service AND by the
  `FileInterceptor({ limits: { fileSize: 5 * 1024 * 1024 } })` on the
  controller).
- The chef-discovery query (`chefs.service.findManyForDiscovery`) uses a
  pure-Prisma bounding-box pre-filter + in-JS Haversine sort (research R2).
  Phase 3 ships ZERO new `$queryRaw` exceptions. The Haversine-via-raw-SQL
  exception that `docs/IMPLEMENTATION_PLAN.md` task 3.9 had reserved is
  retracted by Phase 3.
- Default radius 15 km, hard cap 50 km on the chef-discovery surface
  (spec FR-016 clarification Q2). The cap is enforced server-side
  (`Math.min(query.radiusKm ?? 15, 50)`); the client cannot widen past 50.
- 24-hour cooldown after a rejection or revocation before a fresh
  `POST /chef/apply` is accepted. Cooldown source-of-truth is
  `Chef.rejectedAt` (after rejection) or `Chef.deletedAt` (after
  revocation). Computing `earliestResubmitAt` server-side is non-negotiable
  (Constitution Principle II).
- The `HttpExceptionNormalizerFilter` now scrubs `latitude` / `longitude` /
  `coordinates` from error responses on `/api/v1/chefs/*`, `/api/v1/chef/*`,
  `/api/v1/admin/chefs/*` in addition to the Phase 2 address paths.
  `ChefEventLogger` / `CategoryEventLogger` siblings to the Phase 1 / Phase 2
  loggers emit the FR-038 events.
- The admin web dashboard surfaces ship English-only (spec FR-036) — a
  deliberate v1 scope decision. Free-text admin input that is later shown
  to a customer (rejection / revocation reasons) is stored verbatim and
  rendered to the customer as-is; the platform does not translate
  admin-typed text.
- The `mobile/services/api.ts` request interceptor MUST swap
  `Content-Type` to `'multipart/form-data'` whenever `cfg.data instanceof
  FormData`. The axios instance defaults to
  `Content-Type: application/json` for JSON endpoints, but on RN the
  underlying XHR layer only attaches the multipart boundary when the
  outgoing Content-Type is left as `'multipart/form-data'` (no boundary).
  Without this swap, chef logo / banner uploads (and any future multipart
  POST) produce a body Nest's `FileInterceptor` cannot parse — the route
  handler never runs (silent on the backend) and the client surfaces a
  generic "Network error".
<!-- MANUAL ADDITIONS END -->
