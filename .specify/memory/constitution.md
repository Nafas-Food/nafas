<!--
SYNC IMPACT REPORT
==================
Version change: (initial population) → 1.0.0
Bump rationale: First ratified constitution for the Nafas project. All sections
populated from scratch; no previous principles to deprecate, so initial MAJOR.

Modified principles:
  - (none — initial set)

Added principles:
  - I. Bilingual & RTL by Default (NON-NEGOTIABLE)
  - II. Server-Authoritative Trust Boundary (NON-NEGOTIABLE)
  - III. Modular Monolith with Strict Module Boundaries
  - IV. Schema-First, Soft-Delete-Always Data Layer
  - V. Design-System-First UI
  - VI. Auditable, Reversible Order Lifecycle
  - VII. Scope Discipline & Documented Non-Goals

Added sections:
  - Technology Stack & Architecture (canonical stack snapshot)
  - Development Workflow & Quality Gates

Removed sections:
  - (none)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check gate aligns with
    principles by reference; no edits required (template references constitution
    generically).
  - ✅ .specify/templates/spec-template.md — No constitution-driven mandatory
    sections changed; no edits required.
  - ✅ .specify/templates/tasks-template.md — Task categories cover the
    principle-driven concerns (DTO/validation, soft-delete, design-system, RTL,
    fee calculation server-side). No edits required.
  - ⚠ .specify/templates/agent-file-template.md — Generic; no edits required
    but agent-specific guidance files (CLAUDE.md, etc.) should be regenerated
    via `/speckit-plan` runs to absorb the new principle list.

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Confirmed as today (2026-05-03) for v1.0.0 ratification;
    update if stakeholders adopt an earlier formal date.
-->

# Nafas Constitution

Nafas (نفَس) is a two-sided marketplace for authentic Egyptian home-cooked
food: customers order from verified homemaker chefs through a mobile app, and
chefs manage their kitchens through the same app. An admin web dashboard
oversees the platform. This constitution is the single source of truth for
all technical decisions, scope boundaries, and architectural constraints.
Every contributor — human or AI — MUST align with this document before
writing code.

## Core Principles

### I. Bilingual & RTL by Default (NON-NEGOTIABLE)

Every customer-facing surface MUST support English and Arabic with full
right-to-left layout parity. No string may be hardcoded in either language;
all UI text MUST resolve through the localization layer (`t(key)` on mobile;
equivalent on admin web). Layout primitives MUST derive direction from the
current locale (`isRTL`) — `flexDirection: "row"`, padding shortcuts, and
icon mirroring may not be hardcoded. Notification payloads MUST carry both
locales as `{ ar, en }` JSON so the client can render in the user's
preferred language without a round-trip.

**Rationale**: The product's core promise is authenticity for an Egyptian
audience. Arabic-first users are not a translation tier — they are the
primary market. Drift between the two locales (truncated translations,
mirrored-but-broken icons, LTR-only modals) directly degrades the brand.

### II. Server-Authoritative Trust Boundary (NON-NEGOTIABLE)

All money, inventory, status, and authorization decisions MUST be computed
on the backend and never trusted from a client. Specifically:
- Cart totals, item discounts, delivery fees, service fees, and order totals
  are computed server-side in `OrdersService`. Client-supplied totals are
  ignored.
- Stock decrement, status transitions, and chef verification flips happen
  inside database transactions on the backend.
- Role checks happen in NestJS guards (`JwtAuthGuard` + `RolesGuard`); a
  client claiming a role grants no access.
- File uploads route through `StorageModule`; clients never receive direct
  Supabase write credentials.

**Rationale**: A marketplace handling real money and inventory cannot trust
mobile or web clients. Centralizing every value-bearing computation in one
service prevents tampering, simplifies audit, and keeps the schema and the
visible totals always consistent.

### III. Modular Monolith with Strict Module Boundaries

The backend ships as a single NestJS deployable, but modules MUST
communicate only through their published service interfaces. A module MUST
NOT import another module's Prisma repository, internal DTOs, or private
helpers. Cross-module data access goes through the owning module's injected
service. Adding a new domain concept requires adding a new module — no
domain logic in `common/` or `app.module.ts`.

**Rationale**: Module boundaries that are merely conventional rot under
deadline pressure. Enforcing service-only communication preserves the
option to extract a module to its own service later (payments, search,
analytics) without a rewrite, and prevents the "everything imports
everything" pattern that kills monolith maintainability.

### IV. Schema-First, Soft-Delete-Always Data Layer

The Prisma schema is the canonical data model — all changes flow through
Prisma migrations; no out-of-band SQL alterations. Application code MUST
NOT use raw SQL; the Prisma client is the only query interface. Deletion of
any major entity (User, Chef, Menu, Item, Order, Address, Review,
Transaction, Category) MUST be a soft delete (`update({ deletedAt })`). All
read paths MUST filter `deletedAt IS NULL` either via explicit `where` or
Prisma middleware. The `is_test` flag on User MUST exclude rows from any
analytics aggregation.

**Rationale**: A marketplace accumulates legal, financial, and dispute
history that cannot be retroactively reconstructed. Soft delete preserves
the audit trail for refunds, regulatory questions, and chef payouts. Raw
SQL bypasses both the type system and the soft-delete contract.

### V. Design-System-First UI

All mobile and admin UI work MUST consult the `nafas-design-system` skill
before composing screens. Colors come from `useColors()` (or the admin
Tailwind theme bound to the same tokens) — no hex literals in components.
Typography uses Inter at the documented scale. Spacing, radius, shadow,
and component shapes (buttons, cards, chips, status pills, inputs) MUST
match the design-system previews. New components are added to the system
before being reused; one-off divergences require an explicit decision
recorded in the relevant feature spec.

**Rationale**: Two clients (customer + chef) plus an admin dashboard, built
in parallel by multiple agents, will diverge visually within days unless
anchored to a single token source. The design system already encodes the
brand; bypassing it produces unbranded screens that have to be rebuilt.

### VI. Auditable, Reversible Order Lifecycle

Order state MUST advance only through the documented status machine
(`PENDING → CONFIRMED → PREPARING → READY → ON_THE_WAY → DELIVERED`, with
`CANCELLED` reachable from the first three). Invalid transitions return
`409 INVALID_TRANSITION`. Every transition MUST: (a) be performed by the
authorized actor (chef for chef-side transitions, customer only for
PENDING cancel), (b) write a `Notification` row, (c) dispatch an FCM push
when the recipient has an `fcmToken`, and (d) for `DELIVERED`, flip the
linked `Transaction` to `COMPLETED` for COD orders. `OrderItem` rows MUST
snapshot both `price` (effective) and `priceBeforeDiscount` at order
creation so historical orders survive item edits.

**Rationale**: Order state is the atom of trust between customer and chef.
Permitting illegal jumps, silent transitions without notifications, or
mutable price history makes disputes unresolvable.

### VII. Scope Discipline & Documented Non-Goals

The v1 non-goals are binding: no Visa/Instapay gateway integration, no
driver role logic, no real-time WebSockets (polling only), no
customer-facing web app, no in-app chat, no multi-country expansion, no
LLM features, no dark mode toggle. Schema slots that exist for future use
(Driver role, Visa/Instapay payment methods, Transaction.cardAmount) MUST
remain unwired in v1. Adding behavior beyond v1 scope requires a
constitution amendment, not a code review approval.

**Rationale**: The schema deliberately reserves space for v2 features so
migrations stay clean, but adding even "small" code paths for those
features now multiplies test surface, partially-working UI, and security
review burden. Saying no in v1 is how v1 ships.

## Technology Stack & Architecture

The following stack is canonical. Substitutions require a constitution
amendment.

**Backend**: Node.js 20 LTS, NestJS (modular monolith), Prisma ORM,
PostgreSQL 15 (Supabase-managed), JWT auth (RS256, access + refresh),
bcrypt (rounds: 12), `class-validator` + `class-transformer` for DTOs,
Swagger/OpenAPI via `@nestjs/swagger`, Firebase Cloud Messaging via
`firebase-admin`, Supabase Storage for files, Supabase Vault for secrets,
REST/JSON API style.

**Mobile**: React Native + Expo SDK 52, Expo Router v6 (file-based),
TypeScript, Inter font (expo-google-fonts), `@expo/vector-icons` (Feather
set), `expo-haptics`, `expo-notifications` + FCM, React Context per
domain, AsyncStorage for session and language preference, Axios with
token-attach + refresh interceptors.

**Admin Web**: Next.js 14 App Router, TypeScript, Tailwind CSS,
NextAuth.js (JWT strategy, admin-only), shared `adminApi` Axios instance.

**Infrastructure**: Hostinger VPS, Docker + Docker Compose, Nginx (TLS
termination + routing), Let's Encrypt via Certbot, GitHub Actions →
SSH deploy, Docker restart policies as process supervisor, per-service
`.env` (never committed). Production routing: `api.nafas.app → backend:3000`,
`admin.nafas.app → admin:4000`.

**Repository layout**: `backend/` (NestJS), `mobile/` (Expo), `admin/`
(Next.js), `nginx/`, `.github/workflows/`, top-level `docker-compose.yml`
and `docker-compose.dev.yml`. Backend modules live under
`backend/src/modules/<module>/` per the boundary table; mobile route groups
are `(auth)`, `(tabs)` (customer), `(chef)`.

**Schema, API contract, order flow, status machine, notification matrix,
storage buckets, fee formulas, and environment variables**: the detailed
technical specification supplied at constitution drafting (Prisma schema,
endpoint table, fee calculation, storage bucket inventory, env var lists)
is incorporated by reference and lives alongside this constitution as
project documentation. Amendments to that specification follow the same
governance as this constitution.

## Development Workflow & Quality Gates

**Branching & commits**: Feature branches named `feature/<module-name>`.
Conventional Commits required (`feat:`, `fix:`, `chore:`, `docs:`,
`refactor:`, `test:`). PRs MUST pass CI lint + build before merge. No
commented-out code in merged PRs.

**Backend code review checklist**:
- Every endpoint has `@ApiOperation` and `@ApiResponse` decorators.
- Every request body and response has a typed DTO; no raw `any`.
- Controllers are thin routers; business logic lives in services.
- Queries filter `deletedAt: null` (or rely on Prisma middleware).
- No `console.log` — NestJS `Logger` only.
- Cross-module access goes through the owning service.

**Mobile code review checklist**:
- All strings use `t(key)`.
- All colors use `useColors()` (or the design-system token equivalent).
- Layout uses `isRTL` rather than hardcoded `row`/`row-reverse`.
- Network calls live in `services/` — no Axios in components.
- Cart UI reads from server (`GET /cart`); no local-only cart state.
- UI follows the `nafas-design-system` skill (consult preview HTML and
  SKILL.md before composing new screens).

**Admin code review checklist**:
- Server Components for data fetching; Client Components only when
  interactivity demands it.
- Tailwind classes resolve to design-system tokens, not arbitrary values.

**Security gates** (apply to every PR touching auth, cart, orders,
transactions, uploads, or admin endpoints):
- Rate limiting on `/auth/*` (10 req / 15 min per IP via
  `@nestjs/throttler`).
- Global `ValidationPipe` with `whitelist: true,
  forbidNonWhitelisted: true`.
- Helmet enabled on all routes; CORS restricted to known origins.
- Server-side fee recomputation verified.
- Soft delete used in place of hard delete.

**Spec Kit workflow alignment**: Features go through `/speckit-specify`
→ `/speckit-clarify` (if needed) → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`. The plan-template Constitution Check MUST be
satisfied for each feature before implementation begins. Violations
require either an amendment or a recorded justification in the plan's
complexity tracking section.

## Governance

This constitution supersedes ad-hoc preferences, README snippets, and
agent memory. When this document and any other guidance conflict, this
document wins.

**Amendment procedure**:
1. Open a PR that edits `.specify/memory/constitution.md` and prepends
   an updated Sync Impact Report HTML comment.
2. The PR description MUST state: what changed, why, the version bump,
   and which dependent templates/docs were verified or updated.
3. Amendments require explicit approval from the project owner.
4. On merge, the new version line and Last Amended date take effect.

**Versioning policy** (semantic):
- **MAJOR**: Removing a principle, redefining a principle in a backward-
  incompatible way, or changing a non-negotiable rule's scope.
- **MINOR**: Adding a new principle or section, or materially expanding
  an existing principle's guidance.
- **PATCH**: Wording clarifications, typo fixes, non-semantic refinements,
  Sync Impact Report updates that do not change behavior.

**Compliance review**:
- Every `/speckit-plan` run MUST evaluate the feature against the seven
  Core Principles in its Constitution Check section.
- Every PR review verifies the relevant code review checklist above.
- Quarterly (or on major release boundaries), maintainers SHOULD audit
  the codebase for principle drift — especially soft-delete enforcement,
  RTL parity, and module-boundary leaks — and file follow-up issues.

**Runtime guidance**: Agents and contributors should consult, in order:
(1) this constitution, (2) the active feature's `spec.md` and `plan.md`,
(3) the `nafas-design-system` skill for any UI work, (4) project README
and module-level docs.

**Version**: 1.0.0 | **Ratified**: 2026-05-03 | **Last Amended**: 2026-05-03
