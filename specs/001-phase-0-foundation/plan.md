# Implementation Plan: Foundation

**Branch**: `001-phase-0-foundation` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-phase-0-foundation/spec.md`

## Summary

Phase 0 stands up the monorepo and the runnable substrate that every later phase
inherits. Concretely it delivers: (1) three sibling workspaces (`backend/`,
`mobile/`, `admin/`) scaffolded but otherwise empty of feature code; (2) a
NestJS app whose only feature module is `HealthModule` exposing
`GET /api/v1/health`; (3) the canonical Prisma schema (all 16 constitutional
entities + the `InvalidatedToken` table) migrated into a Supabase Postgres
database; (4) a `PrismaService` that uses Prisma Client Extensions (`$extends`)
to default-filter `deletedAt: null` on reads and to expose a `softDelete()`
helper; (5) an admin-context-only escape hatch for opting back into deleted
rows, gated by an `AsyncLocalStorage` request scope set by the admin role guard;
(6) a CI grep gate that blocks pull requests containing `prisma.<model>.delete(`
calls on soft-delete entities; (7) global validation, Helmet, throttling, and
Swagger; (8) Decimal columns returned as strings with `decimal.js` ready for
later fee math; (9) an in-process `@nestjs/schedule` daily job to clean up
expired `InvalidatedToken` rows (no-op until Phase 1 starts populating the
table); (10) Supabase Storage buckets created with brand-aligned generated
default chef logo + banner; (11) `docker-compose.dev.yml` for one-command
local boot; (12) per-workspace GitHub Actions (lint + type-check + build)
filtered by changed paths so each workspace's gate runs on its own PRs;
(13) a contributor onboarding path in the README that walks each contributor
through creating their own free Supabase project so no shared dev secret
exists.

## Technical Context

**Language/Version**: TypeScript 5.x across all three workspaces
**Primary Dependencies**:
- Backend: Node.js 20 LTS, NestJS 10, Prisma 5, `@nestjs/swagger`,
  `@nestjs/throttler`, `@nestjs/schedule`, `@nestjs/terminus`, `helmet`,
  `class-validator`, `class-transformer`, `decimal.js`
- Mobile (scaffold only in Phase 0): Expo SDK 54, Expo Router v6, TypeScript
- Admin (scaffold only in Phase 0): Next.js 14 App Router, TypeScript,
  Tailwind CSS

**Storage**: PostgreSQL 15 via Supabase (one project per contributor for
development); Supabase Storage with public-read buckets `chef-logos`,
`chef-banners`, `item-images`, `review-images`. Row-level security disabled
at the database layer (Constitution + FR-016) — application-layer guards
are the only access control.

**Testing**: Jest + `@nestjs/testing` + Supertest for backend integration
tests against a Supabase test project. Mobile and admin testing scaffolds
land but no test code is required for Phase 0 acceptance beyond the CI
type-check and build.

**Target Platform**:
- Backend: Linux container (Node 20-alpine), runs locally via Docker Compose
- Mobile: iOS 15+ / Android API 24+ via Expo (scaffold only)
- Admin: any modern browser (scaffold only)

**Project Type**: Monorepo with three sibling workspaces (web service +
mobile app + admin web). Workspace tooling defaults to independent installs
per Open Item A1 in `docs/IMPLEMENTATION_PLAN.md`.

**Performance Goals**:
- `GET /api/v1/health` returns under one second normal, under five seconds
  when the database is unreachable (FR-006, FR-007, SC-007).
- Per-workspace CI gate finishes within five minutes (FR-012, SC-004).
- Fresh-contributor boot path completes within five minutes wall-clock
  (SC-001).

**Constraints**:
- No raw SQL in Phase 0 (Constitution Principle IV); no exceptions are
  introduced in this phase.
- No hard `delete()` on soft-delete entities; CI gate enforces this
  (FR-005, SC-005).
- No secrets committed; `.env` excluded from version control (FR-009,
  SC-008). README documents per-contributor Supabase setup.
- No client-side direct uploads to Supabase Storage; uploads route through
  `StorageModule` in later phases (FR-010).
- Decimal columns returned as strings; all monetary math uses `decimal.js`,
  never JavaScript `Number` (FR-014).
- Primary entity IDs are opaque UUIDs (`@db.Uuid`), not auto-increments
  (FR-015).

**Scale/Scope**:
- Phase 0 ships approximately 17 Prisma models, one feature module
  (`HealthModule`), one common services layer (PrismaService + admin
  context + scheduled job), three CI workflow files, one Docker Compose
  file. No customer-facing feature surface ships in this phase.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial Gate (pre-research)

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | No UI ships in Phase 0; the chosen mobile/admin scaffolds are configured to host bilingual strings later (Expo + `expo-localization` ready, Next.js i18n-capable). No hardcoded strings introduced. |
| II | Server-Authoritative Trust Boundary | PASS | Phase 0 introduces no client-trusted computations. The only endpoint, `GET /api/v1/health`, is read-only and authority-free. |
| III | Modular Monolith with Strict Module Boundaries | PASS | Phase 0 defines exactly one feature module (`HealthModule`) and one common services layer (`PrismaService` + `AdminContextService` + scheduled job). Common services are infrastructure, not domain logic, consistent with the principle. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS¹ | Schema lives exclusively in `backend/prisma/schema.prisma`; migrations are the sole mutation path. Soft-delete columns present on all entities the constitution names. `PrismaService` uses Client Extensions (the non-deprecated successor to middleware) to default-exclude soft-deleted rows, with a strictly admin-context-only opt-in. CI grep gate blocks hard-delete calls on soft-delete entities. |
| V | Design-System-First UI | PASS | No UI ships in Phase 0. The default chef logo + banner placeholders are derived from the design system (gradient + Nafas wordmark) so that even the placeholder honors the brand tokens. |
| VI | Auditable, Reversible Order Lifecycle | PASS | No order-state code ships in Phase 0. Schema slots for `Order`, `OrderItem`, `Transaction`, and `Notification` exist exactly as the constitution defines them so Phase 6 can implement the lifecycle without schema churn. |
| VII | Scope Discipline & Documented Non-Goals | PASS | All non-goal schema slots (Driver role, Visa/Instapay payment methods, `Transaction.cardAmount`) are present but unwired. No code paths for non-goals are introduced. |

> ¹ Narrow exception: `prisma.$queryRaw\`SELECT 1\`` inside the
> `PrismaHealthIndicator` (T021) is a liveness probe, not a data query.
> Justified in `research.md` R4 — isolated to one common-layer indicator,
> no business semantics, no write. No other `$queryRaw` usage is
> introduced in Phase 0.

**Initial gate verdict**: PASS — proceed to Phase 0 research.

### Post-Design Gate (after Phase 1 artifacts)

Re-evaluated after `data-model.md`, `contracts/`, and `quickstart.md` were
produced.

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | No design artifact introduces hardcoded strings. The default chef logo/banner placeholder generation is documented in `quickstart.md` as language-neutral (wordmark + gradient only). |
| II | Server-Authoritative Trust Boundary | PASS | The `health.openapi.yaml` contract describes a read-only endpoint that returns flat strings. `data-model.md` documents server-only soft-delete enforcement. |
| III | Modular Monolith with Strict Module Boundaries | PASS | Project structure shows `modules/health/` as the only feature module and `common/{prisma,jobs,guards,interceptors}` as the shared infrastructure layer. No cross-module imports are introduced. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS¹ | `data-model.md` catalogs every soft-delete entity and notes the `$extends`-based default filter and the `softDelete()` helper. `research.md` documents the choice of Client Extensions over the deprecated middleware API. The contracts folder contains the canonical Prisma schema as `schema.prisma`. |
| V | Design-System-First UI | PASS | No UI artifacts in this phase. The quickstart describes generating the placeholder PNGs from the design system (`nafas-design-system` skill) before uploading. |
| VI | Auditable, Reversible Order Lifecycle | PASS | `data-model.md` includes the full Order/OrderItem/Transaction/Notification slots with the constitution's enum values. No transition logic ships in this phase but the slots are present. |
| VII | Scope Discipline & Documented Non-Goals | PASS | `data-model.md` explicitly tags v2 schema slots (Driver, Visa/Instapay, `Transaction.cardAmount`) as "reserved, unwired in v1" so future contributors do not mistake them for live features. |

> ¹ Same `$queryRaw` carve-out as the initial gate (see footnote above).
> Phase 0 introduces no other raw-SQL usage.

**Post-design gate verdict**: PASS — no Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/001-phase-0-foundation/
├── spec.md                       # Feature specification (already authored)
├── plan.md                       # This file
├── research.md                   # Phase 0 output: technical decisions
├── data-model.md                 # Phase 1 output: entity catalog
├── quickstart.md                 # Phase 1 output: 5-minute boot path
├── contracts/
│   ├── health.openapi.yaml       # GET /api/v1/health contract
│   └── schema.prisma             # Canonical Prisma schema (snapshot)
├── checklists/
│   └── requirements.md           # Authored during /speckit-specify
└── tasks.md                      # Phase 2 output (NOT this command)
```

### Source Code (repository root)

```text
nafas/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                  # Canonical schema (mirrors
│   │   │                                  # contracts/schema.prisma)
│   │   └── migrations/                    # Generated by `prisma migrate`
│   ├── src/
│   │   ├── main.ts                        # NestJS bootstrap: helmet,
│   │   │                                  # ValidationPipe, throttler,
│   │   │                                  # Swagger at /api/v1/docs
│   │   ├── app.module.ts                  # Wires Health, Schedule,
│   │   │                                  # Throttler, Prisma, Admin context
│   │   ├── modules/
│   │   │   └── health/                    # Only feature module in Phase 0
│   │   │       ├── health.controller.ts
│   │   │       ├── health.module.ts
│   │   │       └── prisma.health.ts       # Custom Terminus indicator
│   │   └── common/
│   │       ├── prisma/
│   │       │   ├── prisma.service.ts      # Client Extensions soft-delete +
│   │       │   │                          # softDelete() helper
│   │       │   └── prisma.module.ts
│   │       ├── admin-context/
│   │       │   ├── admin-context.service.ts  # AsyncLocalStorage scope
│   │       │   ├── admin-context.guard.ts    # Sets scope when admin role
│   │       │   │                             # passes
│   │       │   └── include-deleted.token.ts  # Symbol checked by extension
│   │       └── jobs/
│   │           └── invalidated-token-cleanup.job.ts  # @Cron daily
│   ├── test/
│   │   └── health.e2e-spec.ts            # /api/v1/health smoke test
│   ├── scripts/
│   │   └── ci-no-hard-delete.sh          # Grep gate enforced in CI
│   ├── Dockerfile.dev                    # Used by docker-compose.dev.yml
│   ├── package.json
│   └── tsconfig.json
├── mobile/                               # Expo SDK 54 scaffold (no
│                                          # feature code in Phase 0)
├── admin/                                # Next.js 14 scaffold (no feature
│                                          # code in Phase 0)
├── docs/
│   └── IMPLEMENTATION_PLAN.md            # Authored prior to this phase
├── .github/
│   └── workflows/
│       ├── backend.yml                   # paths: backend/**
│       ├── mobile.yml                    # paths: mobile/**
│       └── admin.yml                     # paths: admin/**
├── docker-compose.dev.yml                # Local boot for backend + Postgres
│                                          # passthrough to Supabase
├── README.md                             # Per-contributor Supabase
│                                          # onboarding + boot command
├── CLAUDE.md                             # Generated by
│                                          # update-agent-context.sh
└── .gitignore                            # Excludes .env, dist/, node_modules
```

**Structure Decision**: Monorepo with three sibling workspaces (`backend/`,
`mobile/`, `admin/`) under the repository root, with shared infrastructure
files (`docker-compose.dev.yml`, `nginx/`, `.github/workflows/`) at the
root. Workspaces install independently — no `npm` or `pnpm` workspace tool
in Phase 0 (Open Item A1 in `docs/IMPLEMENTATION_PLAN.md`). Per-workspace
CI is achieved via GitHub Actions `paths:` filters so each workflow
triggers only when its workspace is touched.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The Constitution Check both pre-research and post-design
returned PASS for all seven principles. The only `$queryRaw` usage is the
justified health-probe carve-out documented in the footnote above; no
other raw-SQL exceptions, extra projects, or deprecated APIs are
introduced in this phase.
