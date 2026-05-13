# nafas Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-04

## Active Technologies
- TypeScript 5.x across all three workspaces (unchanged — 002-phase-1-auth)
- PostgreSQL 15 via Supabase (per-contributor projects, Phase 0 — 002-phase-1-auth)

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
- 002-phase-1-auth: Added TypeScript 5.x across all three workspaces (unchanged

- 001-phase-0-foundation: Scaffolded backend (NestJS), mobile (Expo), admin (Next.js)
- 001-phase-0-foundation: Added canonical Prisma schema with 17 tables, soft-delete extension, CI gate, health endpoint, scheduled cleanup job, default placeholders

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
<!-- MANUAL ADDITIONS END -->
