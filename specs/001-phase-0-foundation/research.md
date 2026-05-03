# Phase 0 Research: Foundation

This document resolves every technical decision implied by `spec.md` and
`plan.md` before implementation begins. Each entry follows the
Decision / Rationale / Alternatives format.

---

## R1 — Soft-delete enforcement at the ORM layer

**Decision**: Use Prisma Client Extensions (`$extends`) to (a)
auto-merge `deletedAt: null` into the `where` clause of `findMany`,
`findFirst`, `findUnique`, `count`, and `aggregate` for every model the
constitution marks as soft-delete-protected, and (b) expose a custom
`prisma.<model>.softDelete(args)` helper that calls `update({ data: {
deletedAt: new Date() } })`.

**Rationale**:
- Prisma's classic middleware API (`$use`) is deprecated; the project's
  long-running infrastructure should not be built on a deprecated entry
  point.
- Extensions are the documented forward path and support both `query`
  hooks (for the default filter) and `model` hooks (for the helper),
  giving us both behaviors in one mechanism.
- Keeping the filter in the ORM layer rather than scattering
  `where: { deletedAt: null }` through every service preserves Constitution
  Principle IV ("All read paths MUST filter `deletedAt IS NULL`").

**Alternatives considered**:
- *Manual `where` everywhere*: Rejected — easy to forget, impossible to
  enforce in code review at scale.
- *Prisma middleware (`$use`)*: Rejected — deprecated.
- *Postgres view that hides soft-deleted rows*: Rejected — would require
  raw SQL, violating Constitution Principle IV.

---

## R2 — Admin-context-only escape hatch (FR-004, US3 scenario 4)

**Decision**: Implement an `AdminContextService` backed by Node's
`AsyncLocalStorage`. The admin `RolesGuard` (or a dedicated
`AdminContextInterceptor`) calls
`adminContext.run({ includeDeleted: true }, () => next())` for every
request that has been authenticated as an admin. The Prisma Client
Extension's query hook checks `adminContext.getStore()?.includeDeleted`
before deciding whether to inject `deletedAt: null` into the `where`
clause. A caller in a non-admin handler that tries to opt back into
deleted rows simply has no admin context active, so the filter is
applied as normal — there is no in-band knob a customer- or chef-facing
handler can flip.

**Rationale**:
- AsyncLocalStorage propagates implicitly through async control flow,
  including Prisma's internal awaits, so the scope correctly bounds the
  request.
- Tying the opt-in to the admin role guard means the privilege travels
  with the role, not with a developer's discretion. This satisfies the
  US3 acceptance scenario "the platform MUST refuse the call at runtime
  in customer- or chef-facing read paths."
- No DTO changes are required for application code; the escape hatch is
  invisible from the perspective of repositories that simply call
  `prisma.user.findMany({})`.

**Alternatives considered**:
- *Explicit `includeDeleted: true` flag on every query*: Rejected — there
  is no way to refuse the flag inside non-admin handlers without a
  pre-query inspector that re-implements role checks. Prone to leak.
- *A separate Prisma client instance for admin handlers*: Rejected —
  requires every admin module to inject the right client and creates two
  connection pools; doubles the operational surface for a single feature.

---

## R3 — CI gate for hard-delete prevention (FR-005, SC-005)

**Decision**: Ship `backend/scripts/ci-no-hard-delete.sh`, a portable
shell script that grep-scans `backend/src/` for the regular expression
`prisma\.[a-zA-Z]+\.delete\s*\(` and `prisma\.[a-zA-Z]+\.deleteMany\s*\(`
on the soft-delete-protected model names enumerated in the constitution.
Any match exits non-zero. The `backend.yml` workflow runs the script
after install but before tests.

**Rationale**:
- Grep is portable, has zero installation cost in CI, and is easy to
  audit. Anyone reading the script understands exactly what it forbids.
- Failing fast at CI rather than relying on a custom ESLint rule keeps
  the gate independent of the JS toolchain and avoids the maintenance
  cost of a custom AST plugin.
- The list of forbidden models is derived from the constitution (User,
  Chef, Menu, Item, Order, Address, Review, Transaction, Category) so it
  changes only when the constitution itself changes.

**Alternatives considered**:
- *Custom ESLint rule*: Rejected for v1 — higher implementation cost and
  maintenance burden; deferred to a later phase if the grep pattern proves
  insufficient.
- *Database trigger forbidding `DELETE`*: Rejected — couples enforcement
  to the database layer rather than to the application code, and Supabase
  manages the database role; adding triggers conflicts with the
  schema-only-via-migrations principle.

---

## R4 — Health endpoint pattern (FR-006, FR-007, SC-007)

**Decision**: Use `@nestjs/terminus` with a custom `PrismaHealthIndicator`
that runs `prisma.$queryRaw\`SELECT 1\`` wrapped in a
`Promise.race(healthQuery, timeoutAfter(2000ms))` so that an unreachable
database returns a degraded payload within two seconds rather than
hanging on the connection timeout. The endpoint is mounted at
`/api/v1/health` and is decorated as `@Public()`. Response shape:
`{ status: "ok" | "degraded", checks: { db: "ok" | "down" }, version }`.

**Rationale**:
- Terminus is the NestJS-canonical health module — well-tested, supports
  multiple indicators, returns the expected JSON shape for monitors.
- The custom indicator is required because the built-in Prisma indicator
  (a) is in `@nestjs/terminus`'s newer surface and (b) lacks the explicit
  short-circuit timeout that FR-007 demands.
- The version field reads from `package.json` at module construction; no
  dynamic file I/O per request.
- `prisma.$queryRaw\`SELECT 1\`` is *not* a violation of "no raw SQL"
  in the application data layer — it is a liveness probe with no business
  semantics, and it is isolated to a single common health indicator. This
  is the same justification the Prisma docs use for the canonical health
  check pattern, and it does not introduce a domain query or a write.

**Alternatives considered**:
- *Plain controller hitting `prisma.user.count()`*: Rejected — couples
  health to a specific business table and would mask a healthy DB if the
  User table happens to be locked.
- *Connection-pool stat check only*: Rejected — does not exercise an
  actual round-trip to the database.

---

## R5 — Daily cleanup of `InvalidatedToken` (FR-017)

**Decision**: Use `@nestjs/schedule` with `@Cron(CronExpression.EVERY_DAY_AT_3AM)`
on a `InvalidatedTokenCleanupJob` provider. The job runs
`prisma.invalidatedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })`
and emits `Logger.log("InvalidatedToken cleanup: deleted N rows")` on
each run.

**Rationale**:
- In-process scheduling means no external cron container, no Supabase
  `pg_cron` dependency, no extra credentials surface.
- 03:00 UTC is off-peak for the Egyptian customer base while still
  predictable for ops to grep for.
- `deleteMany` on `InvalidatedToken` is *not* covered by the soft-delete
  rule — `InvalidatedToken` is intentionally a hard-delete table (its
  rows are pure operational data with no business or audit value
  past expiry). The CI grep gate's allowlist permits `prisma.invalidatedToken.deleteMany`.
- The log line satisfies the spec's "verifiable execution" requirement
  without inventing a custom audit table.

**Alternatives considered**:
- *Supabase `pg_cron`*: Rejected — adds a database-side scheduling
  surface and per-environment configuration; conflicts with the
  application-layer-only access control principle.
- *External Kubernetes CronJob*: Rejected — Phase 0 is single-container
  and Phase 13 is single-VPS Docker Compose; adding orchestration is
  scope creep.

---

## R6 — Decimal handling (FR-014)

**Decision**: Configure Prisma to deliver `Decimal` columns as `string`
(via the `Prisma.Decimal` runtime), and standardize on `decimal.js` for
arithmetic in any service that touches money. No service may pass a
`Decimal` value through `Number()` or arithmetic operators.

**Rationale**:
- JavaScript's `Number` is binary float; cent-level math drifts.
- `decimal.js` is industry-standard, well-tested, and tiny.
- Returning Decimal as string keeps API responses lossless (JSON has no
  decimal type) and makes lint-able patterns easy: any line containing
  `Number(decimalField)` is a code-review red flag.
- Phase 0 sets the convention so Phase 6 (orders) inherits it; no fee
  math executes in Phase 0 itself.

**Alternatives considered**:
- *Native JS `Number`*: Rejected — known precision loss.
- *`bignumber.js`*: Equivalent capability; `decimal.js` chosen for
  marginally simpler rounding semantics.

---

## R7 — Workspace tooling (Open Item A1)

**Decision**: Independent installs per workspace for v1. `backend/`,
`mobile/`, and `admin/` each have their own `package.json` and
`node_modules`. No root `package.json` workspaces section, no `pnpm-workspace.yaml`.

**Rationale**:
- The three frameworks (NestJS, Expo, Next.js) have different toolchain
  expectations. Sharing a workspace tool surfaces cross-version peer
  dependency conflicts (especially React Native vs. React Web) that
  cost more time than they save at this stage.
- No shared TypeScript types are required between workspaces in v1; the
  mobile and admin clients consume the backend's REST API via hand-rolled
  service files per the constitution coding standards.
- Leaves the door open to introduce `pnpm` workspaces in a later phase if
  shared types or generated clients become valuable (Open Item A3).

**Alternatives considered**:
- *`npm` workspaces*: Rejected for now — see above.
- *`pnpm` workspaces*: Rejected for now — same reasoning, plus an
  additional toolchain to install.

---

## R8 — Per-workspace CI via path filters (FR-012, SC-004)

**Decision**: Three GitHub Actions workflows (`backend.yml`,
`mobile.yml`, `admin.yml`), each with a `paths:` trigger that fires only
when files inside that workspace change. Each workflow runs lint +
type-check + build and reports its own status check. A no-op PR (one
that doesn't touch any workspace) intentionally runs no quality gates,
which still satisfies the spec because the spec scopes "automatic
quality gates" to PRs that *modify* a workspace's source.

**Rationale**:
- `paths:` filters keep PR feedback fast and avoid wasting CI minutes on
  unrelated changes.
- Each workflow can use the framework's recommended cache action
  (`actions/setup-node` cache for backend/admin, Expo's recommended
  caching for mobile) without a one-size-fits-all monolithic workflow.
- US1 acceptance scenario 3 explicitly says "for that workspace"; the
  spec's "no-op PR" edge case talks about per-workspace gate liveness,
  which is preserved because each workspace gate fires whenever its own
  source changes (the gates do not bit-rot).

**Alternatives considered**:
- *One monolithic workflow*: Rejected — runs every gate on every PR;
  violates the five-minute SC-004 budget for PRs that touch only one
  workspace.

---

## R9 — Default chef logo + banner placeholder (FR-011)

**Decision**: At repo-setup time, generate two PNGs from the
`nafas-design-system` skill's brand tokens — a 512×512 logo (Nafas
wordmark on a brand-gradient circular background) and a 1600×600 banner
(brand gradient with subtle pattern + Nafas wordmark). Upload them to
`chef-logos/default-logo.png` and `chef-banners/default-banner.png` in
the appropriate Supabase Storage buckets. Capture the resulting public
URLs as constants in a future `backend/src/common/constants/storage.ts`
file (Phase 3 will reference them when creating new Chef rows).

**Rationale**:
- Brand-aligned generated artwork satisfies FR-011 for Phase 0 without
  blocking on the design team.
- Storing them at canonical URLs means designer-approved replacements
  later are a Supabase Storage upload, not a code change. This matches
  the spec clarification.
- Generating from the design system (rather than from arbitrary external
  assets) keeps the placeholder under the same design tokens the rest of
  the product uses.

**Alternatives considered**:
- *Wait for designer art*: Rejected — would block Phase 0 acceptance on
  an external dependency (Open Item A5).
- *Use a generic stock placeholder*: Rejected — first-launch screenshots
  could include unbranded imagery, hurting the product's brand promise.

---

## R10 — Per-contributor Supabase project (FR-009, SC-001)

**Decision**: The README walks each new contributor through:
1. Create a free Supabase project at `supabase.com`.
2. Disable RLS on the project (one-click in Supabase dashboard).
3. Copy `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` into
   `backend/.env` (template ships as `backend/.env.example`).
4. Generate a 2048-bit RSA keypair (one-line `openssl` command in the
   README) for `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (referenced by
   Phase 1 but read at boot — defaulted to a development-only generated
   pair if not yet set, with a startup warning).
5. Run `cd backend && npx prisma migrate dev` to apply the schema.
6. Run `docker compose -f docker-compose.dev.yml up backend`.
7. `curl http://localhost:3000/api/v1/health` → `{ status: "ok", ...}`.

**Rationale**:
- Each contributor owns their data; no shared dev secret to leak.
- Free-tier Supabase is sufficient for a single developer's data volume.
- The end-to-end script fits comfortably under the five-minute SC-001
  budget on a machine with Node 20 + Docker pre-installed (~3 min for
  Supabase project creation + key copy + migrate + up).

**Alternatives considered**:
- *Local Postgres via Docker*: Rejected — would mean two database
  surfaces to maintain (local vs. Supabase) and would lose the
  Supabase-specific behaviors (Storage, RLS configuration) that later
  phases rely on.
- *Shared dev Supabase project*: Rejected — leaks the service key into
  every contributor's `.env`; hostile to the spec's "no shared secret"
  clarification.

---

## R11 — Schema-drift detection (FR-013)

**Decision**: Use `npx prisma migrate status` as the canonical drift
check. CI runs this command after `prisma generate`; non-zero exit means
either pending migrations exist or the database is out of sync. The
command is documented in the README under "Verifying schema state."

**Rationale**:
- First-party Prisma tooling — no extra dependency.
- Works against any Postgres instance (Supabase or otherwise).
- Re-runnable safely: a contributor running it on a freshly migrated DB
  sees "Database schema is up to date" rather than re-applying.

**Alternatives considered**:
- *`prisma db pull` + diff*: Rejected — destructive to the canonical
  `schema.prisma` if a contributor commits the pulled schema by mistake.

---

## Open Items not resolved by this phase

These items appear in `docs/IMPLEMENTATION_PLAN.md` Open Items list and
remain open after Phase 0:

- **A2** — Twilio Verify SMS cost. Not Phase 0 scope.
- **A3** — Generated TypeScript clients from Swagger. Deferred per R7.
- **A4** — `$queryRaw` exception register. The first justified
  exception will be the Haversine query in Phase 3.9; recorded then.
- **A5** — Designer-approved chef placeholder art. Tracked separately;
  Phase 0 ships brand-aligned generated placeholders per R9.
