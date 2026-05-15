# Implementation Plan: Categories, Chef Application & Verification

**Branch**: `004-phase-3-chefs` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-phase-3-chefs/spec.md`

## Summary

Phase 3 turns the platform from "identities + delivery targets" into an
actual two-sided marketplace. It ships the supply-side substrate every
later phase depends on: a chef-application path for customers, an admin
verification workflow that performs the server-authoritative
customer → chef role flip (Constitution Principle II), a public
chef-discovery surface (list + filters + profile), chef-owned profile
management (open/closed toggle, edits, logo + banner uploads), an
admin-only revocation path that performs the reverse chef → customer
flip, and a curated food-category catalogue seeded with eight Egyptian
cuisine types.

Concretely it delivers:

1. **Five new backend modules** — `chefs`, `categories`, `storage`,
   `notifications`, `admin` — each obeying Constitution Principle III
   (no cross-module Prisma reads). `chefs.service` does its own data
   access; `categories.service` does its own; `notifications.service`
   is the single chokepoint for `Notification` row creation + FCM
   dispatch; `admin.service` orchestrates the verification /
   rejection / revocation transactions by calling
   `chefs.service.transitionApplication(...)` and
   `notifications.service.create(...)` through their injected
   interfaces. The `users.service` shipped in Phase 1 is the only
   module that mutates `User.role` (R6).
2. **Two schema additions only** (one migration) — `Chef.rejectedAt
   DateTime?` (cooldown source-of-truth for FR-006 / FR-012b) and one
   new enum value `NotificationType.chef_revoked` (FR-012a notification
   payload). Everything else in the Phase 3 contract is materialised
   on the canonical schema migrated by Phase 0. No new tables (R1).
3. **A pure-Prisma geographic-radius discovery query** — bounding-box
   pre-filter on `latitude` / `longitude` in the `where` clause, exact
   Haversine sort + cap computed in service-layer JS over the bounded
   candidate set (R2). This **closes the raw-SQL exception** that
   `docs/IMPLEMENTATION_PLAN.md` task 3.9 reserved for Phase 3 — we
   ship Constitution-IV-clean instead, no `$queryRaw` carve-out needed.
   The 50 km hard cap (spec FR-016) keeps the bounded set ≤ a few
   hundred chefs even at v1+ scale.
4. **An atomic verification + revocation transaction** — both flows
   run inside one `prisma.$transaction` that touches `Chef`, `User`,
   and `Notification` together (R3). FCM dispatch is best-effort and
   happens outside the transaction; an FCM failure logs but never
   rolls back (FR-009, FR-012a, SC-004).
5. **A 24-hour cooldown gate on `/chef/apply`** — the apply service
   reads the user's prior `Chef` row (single `findFirst({ where: {
   userId } })` — bare client, *not* extended, because rejected and
   revoked rows live with `deletedAt` set or `rejectedAt` set and the
   gate has to see them) and refuses with
   `409 APPLICATION_COOLDOWN_IN_EFFECT { earliestResubmitAt }` if
   either timestamp is within 24 h of now (R4).
6. **A new mobile component `KitchenLocationPicker`** — a thin wrapper
   around the Phase 2 `AddressPickerMap` that re-uses the same
   draggable map + reverse-geocoding pre-fill UX shipped in Phase 2,
   exposed through `mobile/components/KitchenLocationPicker.tsx`. No
   new map dep; no new API key procurement (R5).
7. **Sixteen new mobile screens / surfaces** (counting both real
   screens and placeholder tab pages) —
   `app/(auth)/chef-apply.tsx` (apply form, multi-step: location step
   → details step), `app/(auth)/pending-verification.tsx` (the FR-031
   holding screen), the customer tab-bar layout +
   five placeholder tabs `app/(tabs)/(_layout|index|explore|favorites|orders|profile)`
   (only `explore.tsx` ships real content in Phase 3 — the others are
   placeholders per spec Assumption), the chef tab-bar layout +
   five placeholder tabs and one real chef screen
   `app/(chef)/(_layout|dashboard|orders|menu|stats|schedule|profile)`
   (only `profile.tsx` ships real content in Phase 3), and the public
   chef profile detail at `app/chef/[id].tsx`. Every screen consumes
   `t(key)` and the Phase 2 `useColors()` hook (Constitution
   Principles I + V).
8. **A new admin web surface** — NextAuth Credentials provider gated
   on `role === 'admin'`, an admin layout shell with sidebar, and
   two pages: `/dashboard/chef-applications` (verify / reject) and
   `/dashboard/categories` (CRUD + drag-reorder via
   `@dnd-kit/sortable`). The verified-chefs list with the **revoke**
   button is the only Phase 11 admin surface Phase 3 needs to
   pre-empt — we ship it now as `/dashboard/chefs` (read-only list +
   revoke action only; full edit lands in Phase 11.5). Revocation
   without a UI would force ops to curl the endpoint, which is an
   unnecessary friction for an emergency capability.
9. **One Phase 1-style structured-log surface for chef / category
   events** — sibling `common/logging/chef-event.logger.ts` and
   `category-event.logger.ts` mirroring the Phase 1
   `auth-event.logger.ts` / Phase 2 `address-event.logger.ts` line
   shape. Validation rejections and 404s are emitted from the
   existing global `HttpExceptionNormalizerFilter` (extended in this
   phase) for the same reason Phases 1 and 2 do it there — the
   underlying triggers fire before any controller runs. The filter
   is also extended to scrub `latitude` / `longitude` / `coordinates`
   for `/chefs/*` and `/chef/*` paths (FR-039) — one chokepoint, two
   responsibilities, consistent with the Phase 2 stance.
10. **Pre-seeded categories** — the eight Egyptian cuisine types
    from the spec (Koshary, Mahshi, Molokheya, Hawawshi, Sweets,
    Feteer, Fattah, Other) are seeded into `categories` via
    `prisma/seed.ts` (the file Phase 0 wired but didn't populate).
    Each row carries `name: { en, ar }`, `icon` (Feather glyph
    name), and `displayOrder`. The seed is idempotent on `id` (we
    pre-generate UUIDs in the seed module so re-running is a
    no-op).
11. **Default chef placeholder assets** — Phase 0.6 uploaded
    `default-logo.png` and `default-banner.png` to the
    `chef-logos` / `chef-banners` Supabase buckets and captured the
    public URLs in backend config. Phase 3 reads those config
    constants when creating any Chef row (FR-023, SC-011). No new
    asset upload needed.

No schema rewrite of existing fields. No new top-level folders. The
admin module is the only one that ships before its expanded Phase 11
surface lands; it is structured so that Phase 11 extends it
additively rather than refactoring it.

## Technical Context

**Language/Version**: TypeScript 5.x across all three workspaces
(unchanged from Phases 0 – 2).

**Primary Dependencies** (new in Phase 3, layered on Phase 2):

- Backend:
  - `@nestjs/platform-express` is already pulled in transitively by
    `@nestjs/common`; we use its `FileInterceptor` for multipart
    uploads. **New explicit dep**: none — Multer ships with the
    platform adapter; no extra install.
  - **No new server-side image-processing library in Phase 3.** The
    spec accepts JPEG / PNG / WebP up to 5 MB and the validation is a
    mime-type + byte-length check (R8). No thumbnail generation, no
    resizing, no metadata stripping in v1 — those are Phase 12
    hardening candidates.
  - `@supabase/supabase-js` already pulled in by Phase 0 for storage
    bucket setup; the new `StorageModule` wraps it.
  - `firebase-admin` — **new in Phase 3** — wraps FCM push dispatch
    inside `notifications.service`. Phase 0 / Phase 1 deferred the
    install; Phase 3 is the first phase that has a notification
    event to dispatch (chef_verified, chef_rejected, chef_revoked).
- Mobile:
  - **No new map / location deps.** `react-native-maps` and
    `expo-location` shipped in Phase 2; Phase 3 reuses both verbatim
    via the new `KitchenLocationPicker` wrapper (R5).
  - **No new image-picker dep needed for Phase 3.** The implementation
    plan task 0.3 included `expo-image-picker` in the Phase 0 install
    set; logo / banner uploads consume it as-is.
- Admin:
  - `@dnd-kit/core` + `@dnd-kit/sortable` for the categories
    drag-reorder UI (implementation plan task 3.21 / 0.4 — already
    installed in Phase 0).
  - `next-auth` for the Credentials provider that gates admin web on
    `role === 'admin'`. Already installed in Phase 0.

**Storage**: PostgreSQL 15 via Supabase. Two writable tables in Phase 3:

- `chefs` — created on apply, mutated on verify / reject / revoke /
  chef-self-edit / image upload. One new nullable column
  `rejected_at` migrated in this phase (the only schema mutation).
- `categories` — seeded on first deploy, mutated by admin
  curation; no schema changes.

Plus reads (never writes) against:

- `users` for role transitions — `users.service` is the only module
  that calls `prisma.user.update({ role })`, called from
  `admin.service` inside the verification / revocation transaction
  via injected service. The `User.role` enum was migrated in Phase 0
  and carries values `admin | customer | chef | driver` (the last is
  reserved for v2 per Constitution VII).
- `menus` for the FR-014 category-filter check — `chefs.service`
  asks `menus.service.hasMenuInCategory(chefId, categoryId)` rather
  than reading `prisma.menu` directly (Constitution Principle III).
  The `menus` module ships a tiny shell in Phase 3 with that one
  read method, identical to the Phase 2 `orders` shell pattern. The
  full module lands in Phase 4.
- Supabase Storage buckets `chef-logos` and `chef-banners` —
  uploads via `StorageModule.upload(bucket, path, buffer, mimeType)`
  → `publicUrl`.

**Testing**:

- Backend: Jest + `@nestjs/testing` + Supertest. Phase 1 / Phase 2
  fixtures (signed-in customer, signed-in admin) are reused.
  Integration coverage targets every acceptance scenario and every
  in-process success criterion (SC-002, SC-004, SC-006, SC-007,
  SC-008, SC-010, SC-011, SC-012, SC-013, SC-014, SC-015, SC-018,
  SC-019, SC-020). A dedicated
  `test/concurrency-verify.e2e-spec.ts` exercises the FR-012
  "no-longer-pending" race: two admin sessions race-verify the same
  application, exactly one succeeds, the other gets
  `409 APPLICATION_NOT_PENDING`. The Haversine pre-filter is
  covered by a `test/discovery.e2e-spec.ts` with eight seeded chefs
  at varying distances + categories + open / closed states.
- Mobile: Manual on-device verification per `quickstart.md`. No
  automated mobile tests in this phase; the chef-apply map flow,
  the bilingual + RTL parity, and the role-switch nav transition
  are UX concerns automated mobile tests cannot meaningfully cover
  at this maturity.
- Admin: Manual verification per `quickstart.md` Step 5 — the admin
  applications queue, verify / reject actions, categories drag-
  reorder. NextAuth's session machinery is exercised by the admin
  Cypress smoke wired in Phase 0 (no new admin automated tests
  beyond manual quickstart in Phase 3).

**Target Platform**:

- Backend: unchanged — Linux container (`node:20-slim`),
  `docker-compose.dev.yml` bring-up.
- Mobile: unchanged — iOS 15+ / Android API 24+ via Expo SDK 54.
  Phase 3 reuses the Phase 2 dev-client build (the native
  `react-native-maps` module is already linked).
- Admin: Next.js 14 dev server (`npm run dev` from `admin/`).
  Phase 3 is the first phase that ships real admin surface area
  (Phase 0 scaffolded an empty Next app).

**Project Type**: Same monorepo with three sibling workspaces. Phase 3
fills the largest single batch of empty folders so far:
`modules/{chefs,categories,storage,notifications,admin,menus}` on the
backend, the customer + chef tab-bar route groups on mobile, and the
admin dashboard route group.

**Performance Goals**:

- Chef-apply flow end-to-end on a real device in under 3 minutes
  (SC-001) — the budget is conservative; the gating step is the
  customer thinking through the bio, not the map drag.
- Admin verify / reject action in under 60 seconds from queue-open
  (SC-003) — the gating step is the admin reading the bio.
- Discovery list (open chefs, no filters, default page) renders on
  the customer device under 1 second from request issue under
  normal network — the FR-013 / FR-016 query is a single Prisma
  `findMany` bounded by 30 rows after the in-JS Haversine sort.
- Category list reads are cached at the **edge of the service**
  (60-second in-process TTL via a simple `Map` — R7) because the
  list is read on every customer device on every Home / Explore
  open and changes only on admin curation, which is rare. The
  cache is busted on every admin mutation through the same service
  (no inter-service messaging needed).

**Constraints**:

- No new entities (Constitution Principle IV — schema is canonical).
  The one column addition (`Chef.rejectedAt`) and one enum value
  addition (`NotificationType.chef_revoked`) ship via a single
  Prisma migration named `0003_chef_rejection_state` (the next
  sequence after Phase 1 / Phase 2 migrations).
- No raw SQL (Constitution Principle IV). The pure-Prisma
  bounding-box + JS Haversine approach (R2) **closes** the
  raw-SQL exception that `IMPLEMENTATION_PLAN.md` task 3.9 had
  reserved for Phase 3 — Phase 3 ships zero new `$queryRaw` calls.
  The only `$queryRaw` in the codebase remains the Phase 0 health
  probe.
- No client-trusted role decisions (Constitution Principle II). The
  `RolesGuard` Phase 1 shipped (`backend/src/common/guards/roles.guard.ts`)
  is wired on every admin / chef route. A request whose JWT `role`
  claim differs from the role stored at issue time is implicitly
  refused — the JWT is signed RS256, so claim tampering is
  impossible without the private key.
- Role transitions (customer → chef on FR-009, chef → customer on
  FR-012a revocation) happen exclusively in `users.service` and
  are called from `admin.service` inside a `prisma.$transaction`
  that also writes the Chef state change and the Notification row
  (R3). No other module mutates `User.role` in Phase 3.
- No lat/lng in any observability surface (FR-039). The
  `HttpExceptionNormalizerFilter` extension (already added in
  Phase 2 for `/addresses/*`) is broadened to also scrub for
  `/chefs/*`, `/chef/*`, `/admin/chefs/*` paths; the FR-038
  chef-event and category-event loggers exclude lat/lng by
  construction.
- The 24-hour cooldown gate uses **timestamps stored on the
  server** (the `Chef.rejectedAt` column for rejections, the
  `Chef.deletedAt` column for revocations). Client-supplied
  timestamps are never trusted (Constitution Principle II).
- The admin web surfaces ship in English only (spec FR-036). No
  Arabic translations of admin chrome land in this phase; this
  is a deliberate v1 scope decision recorded in
  `spec.md` Assumptions.
- The mobile customer + chef tab bars ship as placeholders for
  the tab content (spec Assumption). Phases 4 – 9 fill them in.
  Phase 3 is responsible for the FR-030 role-driven navigation
  switch + the route-group skeletons, not the content.
- Image upload validation is **mime-type + byte-length** only in
  v1 (R8). No magic-number sniffing, no EXIF stripping, no
  re-encoding. Phase 12 hardening sweep will revisit.
- Constitution Principle VII: no driver-role code, no
  Visa/Instapay code, no real-time push beyond FCM, no LLM
  features ship under cover of Phase 3.

**Scale/Scope**:

- Five new full backend modules + two new module shells (`menus`,
  needed for FR-014; `users` already shipped, extended with one
  new method `setRole(userId, nextRole)` callable only from
  `admin.service`). Approximately 18 new authenticated REST
  endpoints across all modules; see `contracts/` for the canonical
  list.
- One Prisma migration, additive only. One seed file populating 8
  category rows.
- Sixteen new mobile screens / surfaces (counting placeholder tab
  pages and both route-group layouts). Two of them ship real content
  in Phase 3 (`(tabs)/explore.tsx` and `(chef)/profile.tsx`); the rest
  are placeholders for Phases 4 – 9. One new mobile component
  (`KitchenLocationPicker`). Six
  new mobile service modules (`chefs.ts`, `categories.ts`,
  `chefApply.ts`, `chefProfile.ts`, plus `notifications.ts` as the
  typed placeholder Phase 8 will fill in). The mobile i18n surface
  adds ~80 new translation entries × two locales = ~160 new lines
  across `mobile/constants/i18n/{en,ar}.ts`.
- Three new admin pages (chef-applications, categories, chefs). One
  new admin lib (`adminApi.ts`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

### Initial Gate (pre-research)

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | Every Phase 3 customer-facing mobile surface (chef-apply, holding screen, discovery list, chef profile, chef profile editor, kitchen toggle, image upload dialog, every validation message, the chef + customer tab bars, the in-app render of the verification / rejection / revocation notifications) consumes `t(key)` and `isRTL`. The notification rows write `title` and `body` as `{ en, ar }` JSON (Constitution Principle I's no-round-trip rule). SC-016 / SC-017 verify 100% string localisation and end-to-end RTL on a real device. The admin web surfaces ship English-only per spec FR-036 — a deliberate v1 scope decision recorded as an Assumption, and *not* a regression on Principle I (which scopes to customer-facing surfaces). |
| II | Server-Authoritative Trust Boundary | PASS | The `customer → chef → customer` role transitions are the canonical case Principle II exists for. Every transition runs inside a `prisma.$transaction` initiated by `admin.service` (admin-role-guarded) — the client never carries a role claim that flips a row, the JWT role is signed and re-verified on every request, and the `RolesGuard` Phase 1 shipped is wired on every Phase 3 admin endpoint. The 24-hour cooldown clock is server-side (timestamps on `Chef.rejectedAt` / `Chef.deletedAt`); the client cannot fast-forward by sending an earlier timestamp. The category bulk-reorder is `prisma.$transaction` over per-row updates so a partial reorder cannot be observed (FR-027 / SC-014). The minimum-order-price the chef enters and the chef-public-name the chef enters are both stored verbatim — no server-side computation gates them; the only server-side guards are validation rules (positive value; non-empty). |
| III | Modular Monolith with Strict Module Boundaries | PASS | Five new full modules + two shells. `chefs.service` never reads `Menu` directly — it asks `menus.service.hasMenuInCategory(chefId, categoryId)`. `admin.service` never reads `prisma.user` directly — it asks `users.service.setRole(userId, nextRole)`. `notifications.service` is the single chokepoint for `Notification` writes; `chefs.service` and `admin.service` both call it through the injected interface. `storage.service` is the single chokepoint for Supabase Storage uploads / deletes. No domain logic lives in `common/`. The `HttpExceptionNormalizerFilter` extension is infrastructure, not domain. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | Two schema additions ship via one Prisma migration (`Chef.rejectedAt` column + `NotificationType.chef_revoked` enum value). No raw SQL is introduced — the geographic-radius discovery query uses a pure-Prisma bounding-box pre-filter (R2). Reads on `Chef` go through `prismaService.extended.chef.*` (which filters `deletedAt: null`) **except** the cooldown gate on `/chef/apply` (which uses the bare client to *see* rejected and revoked rows that the extension would hide). All deletes are soft-deletes via `prismaService.chef.softDelete(...)` and the Phase 0 grep gate continues to block hard deletes. The `Order.delete` exception listed in `docs/IMPLEMENTATION_PLAN.md` 12.8 is irrelevant — Phase 3 doesn't touch Order. |
| V | Design-System-First UI | PASS | All Phase 3 mobile screens reference the `nafas-design-system` skill before composition. The Phase 2 `useColors()` hook is the only place hex literals live; every Phase 3 component consumes tokens via `useColors()`. The map-picker shell on the chef-apply screen reuses the Phase 2 `AddressPickerMap` styling. The discovery card, the chef profile, and the chef profile editor follow the documented design-system mockups for chef cards / profile headers. The category chip on the discovery surface uses the design-system chip primitive. The admin web surfaces use the design-system Tailwind theme tokens (the admin layout shell that Phase 0 scaffolded already binds them). |
| VI | Auditable, Reversible Order Lifecycle | PASS | No order-state code ships in Phase 3. The application-state machine on `Chef` (pending → verified, pending → rejected, verified → revoked, rejected → re-applied) is a separate machine governed by Principle II + the new clarifications in `spec.md`. It mirrors the order-state-machine pattern (atomic transitions, notification on each transition, ownership-checked actor) without sharing implementation. |
| VII | Scope Discipline & Documented Non-Goals | PASS | Phase 3 explicitly excludes (per spec Assumptions): chef-name global uniqueness (deferred), permanent ban after N rejections (deferred), admin-side bilingual UI (admin is internal), per-chef bio max below industry-standard limit (planning-layer default), and chef-coordinate snapshotting on orders (Phase 6+ concern, requires constitution amendment if introduced). The chef tab bar tabs ship as placeholders; Phases 4 – 9 fill them in. The chef public profile reads `rating` / `totalReviews` columns but Phase 7 writes them — Phase 3 reads zeros until Phase 7 lands; no Phase 3 code computes ratings. |

**Initial gate verdict**: PASS — proceed to Phase 0 research.

### Post-Design Gate (after Phase 1 artifacts)

Re-evaluated after `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md` were produced.

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | `quickstart.md` Step 7 exercises end-to-end English / Arabic parity across every customer-facing mobile surface. `research.md` R5 fixes the `KitchenLocationPicker` bilingual + RTL behaviour by inheriting from Phase 2's `AddressPickerMap`. The OpenAPI contracts return server-side error *codes* (e.g., `APPLICATION_NOT_PENDING`); messages are rendered client-side per the precedent from Phases 1 / 2. The Notification body / title shapes are `{ ar, en }` JSON; `contracts/admin-chef.openapi.yaml` declares them. |
| II | Server-Authoritative Trust Boundary | PASS | `data-model.md` documents the `prisma.$transaction` boundary for verify / reject / revoke. The cooldown gate is named in the contracts as a server-side timestamp comparison; no `earliestResubmitAt` is accepted in the request body. The admin web's NextAuth Credentials provider gates on `role === 'admin'` as soon as the backend `/auth/sign-in` response lands; the JWT is re-validated on every backend call (`JwtAuthGuard` is global, not bypassed by admin web). The OpenAPI error shape strips lat/lng like Phase 2 did. |
| III | Modular Monolith with Strict Module Boundaries | PASS | `data-model.md` shows `chefs.service` → `menus.service.hasMenuInCategory` and `admin.service` → `users.service.setRole` + `notifications.service.create` + `chefs.service.transitionApplication`. Each call is through the injected service interface; no module reads another's Prisma client directly. The `menus.service` ships only the one method in Phase 3 — the shell is the canonical home for Menu data going forward, identical to the Phase 2 `orders` shell pattern. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | The single migration `0003_chef_rejection_state` is the only schema mutation. The discovery query in `chefs.service.findManyForDiscovery(...)` is shown in `data-model.md` as a pure-Prisma bounding-box `findMany` followed by an in-JS Haversine sort + cap — no `$queryRaw`. The cooldown gate's exact query shape (`prisma.chef.findFirst({ where: { userId } })`) is documented; the bare client is used deliberately because the extension would hide rejected (`rejectedAt != NULL`) and revoked (`deletedAt != NULL`) rows that the gate needs to see. |
| V | Design-System-First UI | PASS | `quickstart.md` Step 3 walks through the chef-apply screen referencing the design-system "apply / onboarding" mockups; Step 4 walks the discovery surface against the chef-card mockup; Step 6 walks the chef profile editor against the chef-self-edit mockup. The new mobile screens consume `useColors()` exclusively; no hex literals introduced. |
| VI | Auditable, Reversible Order Lifecycle | PASS | Non-applicable; no order-state code in this phase. |
| VII | Scope Discipline & Documented Non-Goals | PASS | The OpenAPI contracts intentionally omit any chef-name-uniqueness validator, any "ban this user" verb, any localised admin surfaces, and any Visa/Instapay / driver-role wiring. The schema slots for those remain unwired. The `Chef.ratings` / `Chef.totalReviews` columns are returned in the public profile read but Phase 3 never computes / writes them; Phase 7 (reviews) ships that write path. |

**Post-design gate verdict**: PASS — no Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/004-phase-3-chefs/
├── spec.md                                # Feature specification (with 5 clarifications)
├── plan.md                                # This file
├── research.md                            # Phase 0 output: technical decisions (R1 – R8)
├── data-model.md                          # Phase 1 output: Chef + Category + Notification + User usage map
├── quickstart.md                          # Phase 1 output: end-to-end Phase 3 verification path
├── contracts/
│   ├── chefs.openapi.yaml                 # public discovery + chef-self CRUD + image uploads
│   ├── categories.openapi.yaml            # public list + admin CRUD + reorder
│   └── admin-chef.openapi.yaml            # admin verify / reject / revoke + applications queue
├── checklists/
│   └── requirements.md                    # Authored during /speckit-specify (validation pass 2)
└── tasks.md                               # Phase 2 output (NOT this command)
```

### Source Code (repository root, additions for Phase 3)

```text
nafas/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                                  # +Chef.rejectedAt,
│   │   │                                                  # +NotificationType.chef_revoked
│   │   ├── seed.ts                                        # +8 seeded categories
│   │   └── migrations/
│   │       └── 0003_chef_rejection_state/                 # NEW (one migration only)
│   │           └── migration.sql
│   ├── src/
│   │   ├── app.module.ts                                  # +ChefsModule, +CategoriesModule,
│   │   │                                                  # +StorageModule, +NotificationsModule,
│   │   │                                                  # +AdminModule, +MenusModule (shell)
│   │   ├── modules/
│   │   │   ├── health/                                    # (Phase 0)
│   │   │   ├── auth/                                      # (Phase 1)
│   │   │   ├── users/                                     # (Phase 1, +setRole(userId, role))
│   │   │   ├── twilio/                                    # (Phase 1)
│   │   │   ├── email/                                     # (Phase 1)
│   │   │   ├── settings/                                  # (Phase 1)
│   │   │   ├── addresses/                                 # (Phase 2)
│   │   │   ├── orders/                                    # (Phase 2 shell, untouched here)
│   │   │   ├── chefs/                                     # NEW
│   │   │   │   ├── chefs.module.ts
│   │   │   │   ├── chefs.controller.ts                    # GET /chefs (discovery)
│   │   │   │   │                                          # GET /chefs/:id (public profile)
│   │   │   │   │                                          # GET /chefs/:id/reviews
│   │   │   │   │                                          # POST /chef/apply
│   │   │   │   │                                          # PATCH /chef/profile
│   │   │   │   │                                          # PATCH /chef/availability
│   │   │   │   │                                          # POST /chef/logo
│   │   │   │   │                                          # POST /chef/banner
│   │   │   │   ├── chefs.service.ts                       # apply, transitionApplication,
│   │   │   │   │                                          # findManyForDiscovery, findPublicProfile,
│   │   │   │   │                                          # findOwnedOrThrow, toggleOpen, updateProfile,
│   │   │   │   │                                          # replaceLogo, replaceBanner
│   │   │   │   ├── chef-application.service.ts            # cooldown gate + state-machine helper;
│   │   │   │   │                                          # encapsulates the application FSM so
│   │   │   │   │                                          # admin.service consumes one method
│   │   │   │   ├── haversine.ts                           # pure JS distance helper (R2)
│   │   │   │   └── dto/
│   │   │   │       ├── apply-chef.dto.ts
│   │   │   │       ├── update-chef-profile.dto.ts
│   │   │   │       ├── update-availability.dto.ts
│   │   │   │       ├── discovery-query.dto.ts             # category, q, lat, lng, radius, cursor
│   │   │   │       ├── chef.response.dto.ts
│   │   │   │       └── chef-public-profile.response.dto.ts
│   │   │   ├── categories/                                # NEW
│   │   │   │   ├── categories.module.ts
│   │   │   │   ├── categories.controller.ts               # GET /categories
│   │   │   │   │                                          # POST /admin/categories
│   │   │   │   │                                          # PATCH /admin/categories/:id
│   │   │   │   │                                          # DELETE /admin/categories/:id
│   │   │   │   │                                          # PATCH /admin/categories/reorder
│   │   │   │   ├── categories.service.ts                  # listActive (60s in-process cache),
│   │   │   │   │                                          # create, update, softDelete, reorder
│   │   │   │   │                                          # (one $transaction)
│   │   │   │   └── dto/
│   │   │   │       ├── create-category.dto.ts
│   │   │   │       ├── update-category.dto.ts
│   │   │   │       └── reorder-categories.dto.ts
│   │   │   ├── storage/                                   # NEW
│   │   │   │   ├── storage.module.ts
│   │   │   │   └── storage.service.ts                     # upload(bucket, path, buffer, mimeType)
│   │   │   │                                              # delete(bucket, path)
│   │   │   │                                              # uses @supabase/supabase-js service key
│   │   │   ├── notifications/                             # NEW
│   │   │   │   ├── notifications.module.ts
│   │   │   │   ├── notifications.service.ts               # create(userId, type, titleJson, bodyJson, data?)
│   │   │   │   │                                          # writes Notification + dispatches FCM via
│   │   │   │   │                                          # FcmService (best-effort; logs on failure,
│   │   │   │   │                                          # never throws)
│   │   │   │   └── fcm.service.ts                         # thin wrapper around firebase-admin
│   │   │   ├── admin/                                     # NEW
│   │   │   │   ├── admin.module.ts
│   │   │   │   ├── admin-chefs.controller.ts              # GET /admin/chefs/pending
│   │   │   │   │                                          # GET /admin/chefs
│   │   │   │   │                                          # PATCH /admin/chefs/:id/verify
│   │   │   │   │                                          # PATCH /admin/chefs/:id/reject
│   │   │   │   │                                          # DELETE /admin/chefs/:id (revoke)
│   │   │   │   ├── admin.service.ts                       # verifyApplication, rejectApplication,
│   │   │   │   │                                          # revokeChef (all wrap prisma.$transaction
│   │   │   │   │                                          # + best-effort FCM via NotificationsService)
│   │   │   │   └── dto/
│   │   │   │       ├── reject-application.dto.ts          # { reason: string (1..1000) }
│   │   │   │       └── revoke-chef.dto.ts                 # { reason: string (1..1000) }
│   │   │   └── menus/                                     # NEW (shell only)
│   │   │       ├── menus.module.ts
│   │   │       └── menus.service.ts                       # hasMenuInCategory(chefId, categoryId)
│   │   │                                                  # categoriesForChef(chefId)
│   │   │                                                  # (Phase 4 expands this module)
│   │   ├── common/
│   │   │   ├── prisma/                                    # (Phase 0)
│   │   │   ├── admin-context/                             # (Phase 0)
│   │   │   ├── jobs/                                      # (Phase 0)
│   │   │   ├── decorators/                                # (Phase 1)
│   │   │   ├── guards/                                    # (Phase 1)
│   │   │   ├── logging/                                   # (Phase 1, +siblings)
│   │   │   │   ├── correlation-id.middleware.ts           # (Phase 1)
│   │   │   │   ├── correlation-id.context.ts              # (Phase 1)
│   │   │   │   ├── auth-event.logger.ts                   # (Phase 1)
│   │   │   │   ├── address-event.logger.ts                # (Phase 2)
│   │   │   │   ├── chef-event.logger.ts                   # NEW (FR-038)
│   │   │   │   └── category-event.logger.ts               # NEW (FR-038)
│   │   │   └── errors/
│   │   │       ├── auth-error.codes.ts                    # (Phase 1, +chef-namespace codes)
│   │   │       └── http-exception.filter.ts               # broaden coord-redaction to
│   │   │                                                  # /chefs/*, /chef/*, /admin/chefs/*;
│   │   │                                                  # emit FR-038 chef.* / category.*
│   │   │                                                  # events for validation_rejected /
│   │   │                                                  # not_found / role_refused outcomes
│   │   └── ...
│   ├── test/
│   │   ├── chefs.e2e-spec.ts                              # NEW (apply, cooldown, discovery,
│   │   │                                                  # profile, image upload)
│   │   ├── admin-chefs.e2e-spec.ts                        # NEW (verify, reject, revoke, race
│   │   │                                                  # condition on FR-012)
│   │   ├── categories.e2e-spec.ts                         # NEW (public read, admin CRUD,
│   │   │                                                  # atomic reorder per SC-014)
│   │   ├── discovery.e2e-spec.ts                          # NEW (8 seeded chefs, every filter
│   │   │                                                  # combination + Haversine)
│   │   ├── http-redaction.e2e-spec.ts                     # EXTEND (chef coord paths)
│   │   └── concurrency-verify.e2e-spec.ts                 # NEW (two admins race-verify)
│   ├── package.json                                       # +firebase-admin
│   └── ...
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx                                    # +role-driven RouteGuard:
│   │   │                                                  # admin → not-on-mobile;
│   │   │                                                  # chef → /(chef);
│   │   │                                                  # customer-with-pending-application
│   │   │                                                  # → /(auth)/pending-verification;
│   │   │                                                  # customer → /(tabs)
│   │   ├── (auth)/
│   │   │   ├── welcome.tsx                                # (Phase 1)
│   │   │   ├── sign-in.tsx                                # (Phase 1)
│   │   │   ├── register.tsx                               # (Phase 1)
│   │   │   ├── verify-otp.tsx                             # (Phase 1)
│   │   │   ├── chef-apply.tsx                             # NEW (multi-step: location → details)
│   │   │   └── pending-verification.tsx                   # NEW (FR-031 holding screen)
│   │   ├── (tabs)/                                        # NEW route group (customer tab bar)
│   │   │   ├── _layout.tsx                                # NEW (Tabs: home, explore,
│   │   │   │                                              # favorites, orders, profile)
│   │   │   ├── index.tsx                                  # NEW (Home placeholder; Phase 4 fills in)
│   │   │   ├── explore.tsx                                # NEW (chef discovery list + filters
│   │   │   │                                              # — first real customer-facing screen)
│   │   │   ├── favorites.tsx                              # NEW (placeholder; Phase 7 fills in)
│   │   │   ├── orders.tsx                                 # NEW (placeholder; Phase 6 fills in)
│   │   │   └── profile/
│   │   │       ├── index.tsx                              # NEW (placeholder + "become a chef"
│   │   │       │                                          # entry point; Phase 10 fills in)
│   │   │       └── addresses.tsx                          # (Phase 2, unchanged)
│   │   ├── (chef)/                                        # NEW route group (chef tab bar)
│   │   │   ├── _layout.tsx                                # NEW (Tabs: dashboard, orders, menu,
│   │   │   │                                              # stats, schedule, profile)
│   │   │   ├── dashboard.tsx                              # NEW (placeholder; Phase 9 fills in)
│   │   │   ├── orders.tsx                                 # NEW (placeholder; Phase 6 fills in)
│   │   │   ├── menu.tsx                                   # NEW (placeholder; Phase 4 fills in)
│   │   │   ├── stats.tsx                                  # NEW (placeholder; Phase 9 fills in)
│   │   │   ├── schedule.tsx                               # NEW (placeholder; Phase 6 fills in)
│   │   │   └── profile.tsx                                # NEW — first real chef-side screen
│   │   │                                                  # (kitchen toggle, edit name / bio /
│   │   │                                                  # min order price / coords, replace
│   │   │                                                  # logo + banner, sign out)
│   │   └── chef/
│   │       └── [id].tsx                                   # NEW (public chef profile)
│   ├── components/
│   │   ├── AddressPickerMap.tsx                           # (Phase 2)
│   │   └── KitchenLocationPicker.tsx                      # NEW — thin wrapper over the Phase 2
│   │                                                      # AddressPickerMap; same UX
│   ├── hooks/
│   │   └── useColors.ts                                   # (Phase 2)
│   ├── context/
│   │   └── AuthContext.tsx                                # EXTEND — expose pendingApplication
│   │                                                      # state + role from getMe()
│   ├── services/
│   │   ├── addresses.ts                                   # (Phase 2)
│   │   ├── chefs.ts                                       # NEW (discovery list, public profile)
│   │   ├── chefApply.ts                                   # NEW (POST /chef/apply; handles
│   │   │                                                   # cooldown 409 error mapping)
│   │   ├── chefProfile.ts                                 # NEW (PATCH /chef/profile,
│   │   │                                                   # availability, logo, banner)
│   │   ├── categories.ts                                  # NEW (GET /categories)
│   │   └── notifications.ts                               # NEW (typed shape used by Phase 3
│   │                                                       # verification / rejection / revocation
│   │                                                       # notifications; Phase 8 fills the
│   │                                                       # notification-centre surface)
│   ├── constants/
│   │   └── i18n/
│   │       ├── en.ts                                      # +~80 keys
│   │       └── ar.ts                                      # +~80 keys
│   ├── app.config.ts                                      # (Phase 2 keys still apply;
│   │                                                      # no new env vars)
│   ├── package.json                                       # No new deps
│   └── ...
├── admin/
│   ├── app/
│   │   ├── layout.tsx                                     # EXTEND — admin shell
│   │   ├── (auth)/
│   │   │   └── sign-in/
│   │   │       └── page.tsx                               # NEW — NextAuth Credentials sign-in
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                                 # NEW — sidebar + header layout
│   │   │   ├── page.tsx                                   # NEW — landing (Phase 11 fills KPIs)
│   │   │   ├── chef-applications/
│   │   │   │   └── page.tsx                               # NEW — pending queue + verify /
│   │   │   │                                              # reject confirmation dialogs
│   │   │   ├── categories/
│   │   │   │   └── page.tsx                               # NEW — CRUD + dnd reorder
│   │   │   └── chefs/
│   │   │       └── page.tsx                               # NEW (Phase-3 slice) — verified
│   │   │                                                  # chefs list + REVOKE action;
│   │   │                                                  # Phase 11.5 extends with menus
│   │   │                                                  # view + force-close
│   ├── lib/
│   │   ├── auth.ts                                        # NEW — NextAuth Credentials config
│   │   │                                                  # (admin-only; rejects non-admin)
│   │   └── adminApi.ts                                    # NEW — Axios instance with bearer
│   ├── components/
│   │   ├── Sidebar.tsx                                    # NEW
│   │   ├── ConfirmDialog.tsx                              # NEW (verify / reject / revoke)
│   │   └── SortableCategoryList.tsx                       # NEW (dnd-kit list)
│   ├── package.json                                       # No new deps (NextAuth + dnd-kit
│   │                                                      # already installed in Phase 0.4)
│   └── ...
└── ...
```

**Structure Decision**: Same monorepo and three-workspace layout the
Foundation phase chose. Phase 3 fills the largest single batch of
previously empty folders — five new backend modules plus two shells,
twelve new mobile screens / surfaces, and the first real admin web
pages — without adding any new top-level folder.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be
> justified**

No violations. The Constitution Check both pre-research and post-design
returned PASS for all seven principles.

The one design decision that *would* have been a Constitution
Principle IV violation — the IMPLEMENTATION_PLAN-reserved
`$queryRaw` Haversine query (task 3.9) — is **closed** by the
pure-Prisma bounding-box + JS Haversine approach researched in R2.
Phase 3 ships zero new raw-SQL exceptions. The Haversine
"narrow-exception" entry that `docs/IMPLEMENTATION_PLAN.md` task 3.9
held open is no longer needed; the implementation plan should be
updated in a follow-up commit to retract it.
