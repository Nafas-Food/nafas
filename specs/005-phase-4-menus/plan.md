# Implementation Plan: Menus, Items & Customer Discovery Surfaces

**Branch**: `005-phase-4-menus` | **Date**: 2026-05-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-phase-4-menus/spec.md`

## Summary

Phase 4 turns the platform from "verified chefs exist" into "verified
chefs have a real catalogue a customer can browse." It ships the chef-
side menu/item editor, the customer-side Home and Explore surfaces,
the today-available chef-profile read that grafts menu sections onto
the Phase 3 chef-profile header, and — critically — the
server-authoritative `effectivePrice` helper that every later phase
(cart subtotals, order-item snapshots) reuses. Without Phase 4, Phase
3's chef profiles are empty headers; with it, Phase 5 (cart) becomes
unblocked because there's finally something to add to a cart.

Concretely it delivers:

1. **Two backend modules promoted from shell to full**:
   - `menus` — Phase 3 shipped a read-only shell
     (`hasMenuInCategory`, `categoriesForChef`, `chefIdsInCategory`).
     Phase 4 layers the full chef-side menu CRUD + day-of-week
     availability + bulk reorder on top, without removing or
     renaming the Phase 3 shell methods (Phase 3 callers continue
     to consume them through the same injected interface).
   - `items` — a new module owning every `Item` mutation, the
     `effectivePrice(item)` server-authoritative pricing helper
     (FR-016), item-image uploads (with the FR-012b per-chef
     throttle) and removals, item bulk-reorder. Both items and
     menus are chef-scoped (no cross-chef read or write path
     reachable from the chef surface).
2. **A new backend module `home`** — owns the customer Home payload
   (`GET /home`). It composes one greeting projection, the
   open-chefs scroll (via `chefs.service.findManyForDiscovery`
   keyed to `isOpen: true`), the category catalogue (via
   `categories.service.listActive` — Phase 3's in-process-cached
   reader), and the top-rated grid (a new
   `chefs.service.findTopRated` ordered by `(ratings DESC,
   verifiedAt DESC, id ASC)`). The Explore surface stays where
   Phase 3 put it (`chefs.controller GET /chefs` is reused
   verbatim — see also `mobile/app/(tabs)/explore.tsx` from Phase
   3). The Home module is a thin composer; it never reads
   `prisma.chef` or `prisma.menu` directly (Constitution III).
3. **Three composite indexes** (one migration):
    `Chef.ratings`, `Chef.totalReviews` already exist (Phase 0).
    Phase 4 adds NO new columns to `Menu`, `Item`, or
    `MenuAvailability` — the canonical schema migrated in Phase 0
    already covers everything Phase 4 needs (see R1). The single
    migration `0004_item_active_displayorder_indexes` adds three
    composite indexes the today-available read and the bulk-reorder
    read consume frequently (R7).
4. **A pure-Prisma today-available read** — no raw SQL. The
   chef-profile menu-region read filters menus by
   `OR: [{ availableAllDays: true }, { availability: { some: {
   dayOfWeek: todaysCairoWeekday() } } }]` in a single
   `findMany` against `prismaService.extended.menu`, with `include:
   { items: { where: { isActive: true } } }` for items, then
   server-side computes `effectivePrice` per item and applies the
   `(displayOrder, createdAt, id)` deterministic sort. The
   `todaysCairoWeekday()` helper computes the day-of-week against
   `Africa/Cairo` at request-handler entry (R2). One Prisma query
   per chef-profile read (the chef header itself comes from the
   Phase 3 chef-profile read; the menus + items section is one
   additional read).
5. **An atomic bulk-reorder transaction** — `menus.service.reorderMenus`
   and `items.service.reorderItems` both wrap their dense-renumber
   in one `prisma.$transaction` and validate that the submitted
   identifier list is an exact cover of the chef's (or menu's)
   current non-soft-deleted collection (R5). Mirrors the Phase 3
   FR-027 category-reorder pattern verbatim. A partial reorder
   never becomes observable.
6. **An image-upload throttle scoped to the new endpoint** — the
   `@nestjs/throttler` decorator on `POST /chef/items/:id/images`
   tightens to **20 successful uploads / 60 s per chef** while
   keeping Phase 1's default `60 / 60 s / IP` ceiling as a
   backstop (R3). Reuses the single `default` named tier (Phase 1
   R7 single-tier rule). A throttle refusal logs the FR-032
   `item.image_upload / rate_limited` event without consuming
   image storage.
7. **A response shape that surfaces the "unlimited stock" semantic
   unambiguously** — every item read carries `isUnlimitedStock:
   boolean` alongside `quantity: number | null` (with `null` on
   the wire when the chef has the unlimited toggle on — the
   `-1` sentinel is database-internal, never client-visible).
    The chef-side editor preserves the chef's last finite quantity
    in client memory only; the database does not retain a separate
    `lastFiniteQuantity` field in v1 (FR-008 / R4).
8. **A new mobile component `MenuSectionList`** and **`ItemCard`**
   — both consume `useColors()` (Constitution V). Menu sections
   render the design-system collapsible menu pattern;
   ItemCard renders the discount-badge / out-of-stock / image
   carousel pattern documented in `nafas-design-system`.
9. **Sixteen new mobile screens / surfaces filled in** — the
   placeholder tabs that Phase 3 stubbed
   (`app/(tabs)/index.tsx` for Home, `app/(chef)/menu.tsx` for
   the chef-side editor) get real content. The Phase 3
   `app/(tabs)/explore.tsx` discovery list is extended to pull in
   the new `ItemCard` for top-rated previews. The Phase 3
   `app/chef/[id].tsx` public-profile screen is extended to render
   menu sections via `MenuSectionList`. New screens introduced:
   the chef-side **menu create** modal,
   **menu edit** modal, **item create** modal, **item edit** modal,
   **day-of-week picker**, **item images** dialog (upload + per-image
   remove). Search debounce + filter cancellation on Explore are
   implemented per FR-024 inside the existing
   `app/(tabs)/explore.tsx`.
10. **Length-validated bilingual fields** — every
    `Menu.name` / `Item.name` / `Item.description` DTO carries
    `@Length(1, 60)` (60 for the two name fields, 500 for
    description) per the spec clarifications round, with a
    server-side trim transform that strips leading/trailing
    whitespace before the length check. The validator messages
    are stable error codes (`MENU_NAME_TOO_LONG`,
    `ITEM_DESCRIPTION_REQUIRED`, etc.) that the mobile client
    maps to bilingual messages.
11. **One Phase 1-style structured-log surface for menu / item
    events** — sibling `common/logging/menu-event.logger.ts` and
    `item-event.logger.ts` mirroring the Phase 1 / 2 / 3 line
    shape. Validation rejections and 404s are emitted from the
    existing global `HttpExceptionNormalizerFilter` (extended in
    this phase with `/chef/menus/*`, `/chef/items/*` path
    coverage), exactly as Phases 1, 2, 3 did. The filter's
    coordinate-redaction list also widens to those path prefixes
    so chef kitchen coordinates can NEVER leak via a menu / item
    error path (FR-033).
12. **Zero new dependencies** — `firebase-admin` (Phase 3),
    `@supabase/supabase-js` (Phase 0 / 3), `@nestjs/throttler`
    (Phase 1), `expo-image-picker` (Phase 0 / 3),
    `react-native-reanimated` (Phase 0) all already installed.
    No new map dep, no new pricing library
    (`decimal.js` already wired in Phase 0). The
    `effectivePrice` helper imports `decimal.js` exactly like
    the Phase 2 / 3 / 6 monetary code.

No new top-level folders. The Phase 3 admin web surfaces (chef
applications, categories, chefs list with revoke) are unchanged in
Phase 4 — admin oversight of menus and items is a Phase 11+ concern
(spec Assumption). The `Notification` write path is reused only if
a future Phase 4 surface emits one (currently none — chef edits to
their own catalogue don't notify; admin force-mutation of menu/item
isn't in Phase 4 scope).

## Technical Context

**Language/Version**: TypeScript 5.x across all three workspaces
(unchanged from Phases 0 – 3).

**Primary Dependencies** (new in Phase 4, layered on Phase 3):

- Backend:
  - **No new server-side dependency.** `decimal.js` (Phase 0)
    drives every monetary computation; `@nestjs/platform-express`'s
    `FileInterceptor` (Phase 3 already uses it for chef logo /
    banner) is reused for item-image uploads with a swapped
    `limits.fileSize: 3 * 1024 * 1024` (3 MB per FR-012 vs
    Phase 3's 5 MB for chef logo/banner); the `StorageModule`
    Phase 3 shipped writes to the `item-images` Supabase bucket
    that Phase 0.6 already provisioned. The `@nestjs/throttler`
    decorator extends the Phase 1 single `default` tier with a
    per-route override on the image-upload endpoint (R3).
- Mobile:
  - **No new dependency.** `expo-image-picker` shipped in Phase
    0.3; the chef-side item editor reuses it for the multi-image
    selection flow. `react-native-reanimated` is already
    installed and powers the collapsible menu-section animation
    on the customer-facing chef profile.
- Admin:
  - **No admin web surface changes in Phase 4.** Per spec
    Assumption "the admin web dashboard does NOT receive new
    Phase 4 surfaces", admin oversight of menus and items is
    deferred to Phase 11.

**Storage**: PostgreSQL 15 via Supabase. Writable tables in Phase 4:

- `menus` — created / updated / soft-deleted / bulk-reordered by
  chefs. No schema changes; the canonical schema from Phase 0
  already covers `chefId, categoryId, name, displayOrder,
  availableAllDays, deletedAt`.
- `items` — created / updated / soft-deleted / active-toggled /
  bulk-reordered / image-array-appended-and-removed. No schema
  changes. The canonical schema has `price, discountValue,
  discountUnit, quantity, images: String[], displayOrder,
  isActive, deletedAt`.
- `menu_availabilities` — rows added (when a chef ticks a
  day-of-week) and removed (when they untick). The
  `@@unique([menuId, dayOfWeek])` constraint Phase 0 declared
  guarantees idempotency on insert and lets remove be a `delete`
  on the composite key.

Plus reads (never writes) against:

- `chefs` for ownership re-derivation on every menu/item mutation —
  via `chefs.service.findOwnedOrThrow(userId)` (Phase 3 method).
  Phase 4 never reads `prisma.chef` directly (Constitution III).
- `categories` for the FR-003 category-existence guard on menu
  create / update — via `categories.service.findOneActiveOrThrow(id)`
  (a new method on the Phase 3 module, callable through the
  injected interface). Cross-module read; no direct Prisma access.
- Supabase Storage bucket `item-images` — uploads via
  `StorageModule.upload(bucket, path, buffer, mimeType)` → public
  URL; removals via `StorageModule.delete(bucket, path)` when the
  chef removes an individual image (R6 — the storage object IS
  deleted on image removal, mirroring chef logo/banner replacement
  pattern).

**Testing**:

- Backend: Jest + `@nestjs/testing` + Supertest. Phase 1 / 2 / 3
  fixtures (signed-in chef, signed-in customer) are reused.
  Integration coverage targets every acceptance scenario and every
  in-process success criterion (SC-002, SC-003, SC-005, SC-006,
  SC-007, SC-007a, SC-007b, SC-007c, SC-007d, SC-007e, SC-008,
  SC-009, SC-010, SC-013, SC-014, SC-017, SC-018, SC-019). A
  dedicated `test/items-throttle.e2e-spec.ts` saturates the
  per-chef upload throttle and asserts SC-007b. A dedicated
  `test/menus-availability.e2e-spec.ts` exercises every weekday
  rollover combination, including the midnight Cairo boundary via
  a mocked `todaysCairoWeekday()`. A dedicated
  `test/items-effective-price.e2e-spec.ts` asserts the
  pricing-helper output across `fixed`/`percent` units, the
  zero-effective-price case, and the negative-effective-price
  refusal.
- Mobile: Manual on-device verification per `quickstart.md`. No
  automated mobile tests in this phase; the chef editor's
  bilingual + RTL parity and the design-system fidelity are
  manual-only at this maturity (same posture as Phases 1 – 3).
- Admin: No admin web changes in Phase 4 → no admin tests.

**Target Platform**:

- Backend: unchanged — Linux container (`node:20-slim`),
  `docker-compose.dev.yml` bring-up.
- Mobile: unchanged — iOS 15+ / Android API 24+ via Expo SDK 54.
  Phase 4 reuses the Phase 3 dev-client build.
- Admin: unchanged.

**Project Type**: Same monorepo with three sibling workspaces. Phase
4 promotes two backend modules from shell to full (`menus`, new
`items`), adds one composer module (`home`), and fills in the
placeholder mobile tabs Phase 3 stubbed. The admin workspace is
untouched in this phase.

**Performance Goals**:

- Chef menu / item create flow on a real device under SC-001's 60 s
  and SC-004's 90 s budgets — the gating step is the chef typing the
  bilingual name + description; the backend roundtrip is sub-200 ms.
- Chef-profile menu-region read under 800 ms p95 on a real device on
  a typical mobile network. The single `findMany` against
  `prismaService.extended.menu` with `include: { items: { where: {
  isActive: true } } }` is bounded by `menus_chefid_idx`
  (Phase 0) and the new `(menu_id, is_active, deleted_at)` index
  Phase 4 adds for the items include (R7). Item count per chef in
  v1 expected ≤ 100; well below any concerning bound.
- Home surface single round-trip under 1 s p95. Composes the
  Phase 3 discovery `findMany` (capped at the open-chefs page
  size) + the cached category list + a separate top-rated
  `findMany` (capped at 12 rows).
- Explore search debounce: client-side ≥ 200 ms keystroke
  interval before issuing a request (FR-024, SC-012). The Phase
  3 discovery query itself is unchanged.

**Constraints**:

- No new entities (Constitution IV — schema is canonical). The
  one migration `0004_item_active_displayorder_indexes` is
  additive index-only; no column changes, no type changes, no
  nullability changes. The existing
  `items.menu_id` index (Phase 0) is supplemented by
  `(menu_id, is_active, deleted_at)` (for the today-available
  read) and `(menu_id, display_order)` (for the chef-side browse
  + customer-facing sort). The migration also adds
  `(chef_id, display_order)` to `menus` for the chef's own
  reorder-friendly browse read.
- No raw SQL (Constitution IV). The today-available query, the
  bulk-reorder query, the home top-rated query, every Phase 4
  read uses the Prisma client (extended where soft-delete
  filtering applies). Phase 4 ships **zero** new `$queryRaw`
  calls; the only `$queryRaw` in the codebase remains the Phase
  0 health probe.
- No client-trusted prices (Constitution II). The
  `effectivePrice` helper is the only place in the codebase that
  consumes `(price, discountValue, discountUnit)` to produce the
  effective sell price. Every customer-facing item read and
  every chef-facing item read returns BOTH the base price and the
  effective price (as decimal strings — never JS floats); the
  client renders the struck-through original from the base price
  field and the current price from the effective field.
- No client-trusted role decisions (Constitution II). Every chef-
  scoped Phase 4 endpoint is `@Roles('chef')`-gated by the
  Phase 1 `RolesGuard`; every menu/item mutation re-derives the
  chef row from the JWT sub via `chefs.service.findOwnedOrThrow`.
- Bulk-reorder atomicity (FR-002a / FR-009a). Both reorder
  operations wrap the dense-renumber in one
  `prisma.$transaction`; a forced mid-transaction failure leaves
  the collection at its prior order. Mirrors the Phase 3 FR-027
  category-reorder contract.
- No lat/lng in any observability surface from Phase 4 endpoints
  (FR-033). The `HttpExceptionNormalizerFilter` extension —
  already broadened by Phases 2 and 3 — is broadened again to
  match `/chef/menus/*`, `/chef/items/*`, `/chefs/*/menus`,
  `/chefs/*/profile` path prefixes. The FR-032 menu-event and
  item-event loggers exclude lat/lng by construction.
- The today-available filter resolves "today" against
  `Africa/Cairo` at request-handler entry (R2). The transport
  timestamp / client clock is NOT used. The helper is
  unit-tested independently so the rollover at midnight Cairo
  is deterministic.
- Image upload validation is **mime-type + byte-length only**
  (mirrors Phase 3 R8 for chef logo/banner). No magic-number
  sniffing, no EXIF stripping, no re-encoding. Phase 12
  hardening sweep may revisit.
- The per-chef upload throttle (FR-012b / SC-007b) is enforced at
  the controller via `@Throttle({ default: { limit: 20, ttl:
  60_000 } })` keyed by the chef row identifier resolved at
  request entry. Phase 1 R7 single-tier rule is preserved; no
  new named tier is introduced.
- The image array on `items.images` is a Postgres `String[]`
  (Phase 0 schema). Append and remove are non-trivial in pure
  Prisma — Prisma supports `push` for append but not slice-out
  for remove. Phase 4 reads the array, mutates it in TS, writes
  the full new array via `update({ data: { images: { set:
  newArray } } })` (R6). The mutation is atomic at the row
  level so two concurrent removes on the same item are safe
  under last-write-wins (which is the spec's default for v1).
- Constitution VII: no driver-role code, no Visa/Instapay code,
  no real-time push beyond FCM, no LLM features, no admin-side
  menu/item surface ship under cover of Phase 4. The chef
  surface ships in Egyptian Arabic + English only — the
  marketplace is Egypt-only (R2 / spec timezone clarification).

**Scale/Scope**:

- One new full backend module (`items`), one promotion from
  shell to full (`menus`), one new composer module (`home`).
  Approximately 14 new authenticated REST endpoints across all
  three; see `contracts/` for the canonical list.
- One Prisma migration, index-additive only. Zero data
  migrations. Zero schema-column changes.
- Five new mobile screens / surfaces of substance (Home,
  chef-side menu editor, chef-side item editor, chef-profile
  menu-region read, Explore search/filter wiring) plus several
  modals (menu create, menu edit, item create, item edit,
  day-of-week picker, item images dialog). Two new shared
  mobile components (`MenuSectionList`, `ItemCard`). The
  mobile i18n surface adds ~110 new translation entries × two
  locales = ~220 new lines across `mobile/constants/i18n/{en,
  ar}.ts`.
- Zero new admin pages.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

### Initial Gate (pre-research)

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | Every Phase 4 customer-facing mobile surface (Home greeting, open-chefs scroll, category chips, top-rated grid, Explore search input + filters, chef profile menu sections + item cards, discount badges, in-stock / out-of-stock copy, all empty states, all validation messages) consumes `t(key)` and `isRTL`. Every chef-facing surface (menu editor, item editor, day-of-week picker, image upload dialog, image-remove confirm, every validation error) does the same. Bilingual fields on `Menu.name` / `Item.name` / `Item.description` are stored as `{ en, ar }` JSON (FR-030) — the client renders the locale that matches the recipient's current in-app language; if a locale is empty, the surface falls back to the other locale (FR-030 / SC-015 / SC-016). |
| II | Server-Authoritative Trust Boundary | PASS | The `effectivePrice` helper is the single canonical place that converts `(price, discountValue, discountUnit)` to the customer-visible price (FR-016). Every customer-facing item read returns both base and effective price as decimal strings; the client never recomputes. Every menu / item mutation runs through `chefs.service.findOwnedOrThrow(userId)` before any write, preventing cross-chef writes. Bulk-reorder atomicity uses `prisma.$transaction` over the dense-renumber sequence (FR-002a / FR-009a). The image-upload throttle (FR-012b) is enforced at the controller level via Phase 1's `default` throttler tier with a per-route override — the client cannot bypass it by re-issuing requests faster. The 60-character length cap on `Menu.name` / `Item.name` and the 500-character cap on `Item.description` are server-enforced after trim (FR-001 / FR-007 / SC-007c) — refused, not silently truncated. The today-available filter (FR-017) resolves the weekday against the server's `Africa/Cairo` wall clock; the client cannot fast-forward the menu visibility window. |
| III | Modular Monolith with Strict Module Boundaries | PASS | Three Phase 4 modules with disjoint ownership. `menus.service` owns every `Menu` mutation and the Phase 3 read-shell methods (`hasMenuInCategory`, `categoriesForChef`, `chefIdsInCategory`). `items.service` owns every `Item` mutation and exports the `effectivePrice(item)` helper as a pure function the rest of the monolith re-imports (NOT through a method call — the helper is stateless and inexpensive enough that re-importing is fine; treating it as a service method would force a circular dep into the cart and orders modules later). `home.service` is a composer: it calls `chefs.service.findManyForDiscovery`, `categories.service.listActive`, and `chefs.service.findTopRated` through injected interfaces — it never reads `prisma.chef`, `prisma.menu`, or `prisma.category` directly. Item-image upload routes through `storage.service.upload` (Phase 3 chokepoint). The `categories.service` is extended with one new method `findOneActiveOrThrow(id)` for the FR-003 guard, callable from `menus.service`. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | Zero schema-column additions. One migration `0004_item_active_displayorder_indexes` ships three composite indexes: `(menu_id, is_active, deleted_at)` on `items` for the today-available read, `(menu_id, display_order)` on `items` for the chef + customer sort, and `(chef_id, display_order)` on `menus` for the chef's own reorder-friendly browse. Reads on `Menu` and `Item` go through `prismaService.extended.<model>.*` (which filters `deletedAt: null`); deletes go through `prismaService.<model>.softDelete({ id })`. The Phase 0 grep gate continues to block hard deletes. The today-available query uses pure Prisma (no `$queryRaw`); the image-array mutation uses `data: { images: { set: newArray } }` (no raw SQL). |
| V | Design-System-First UI | PASS | Every new mobile screen and shared component consults the `nafas-design-system` skill before composition. `MenuSectionList` follows the design-system collapsible-section mockup; `ItemCard` follows the documented item-card pattern (discount badge variant, out-of-stock variant, image carousel variant). All colors come from the Phase 2 `useColors()` hook — zero hex literals in components. Spacing, radius, shadow, and typography (Inter at the documented scale) are token-bound. The chef editor reuses the design-system input + button + chip primitives. |
| VI | Auditable, Reversible Order Lifecycle | PASS | No order-state code ships in Phase 4. The `effectivePrice` helper that Phase 4 introduces is the canonical price authority that Phase 6's `OrderItem.price` / `OrderItem.priceBeforeDiscount` snapshots will reuse — Phase 4 deliberately ships the helper as the single source of truth for monetary computation on items, so Phase 6 (orders) does not have to re-implement it. |
| VII | Scope Discipline & Documented Non-Goals | PASS | Phase 4 explicitly excludes (per spec Assumptions): admin oversight of menus / items (deferred to Phase 11 candidate), time-windowed promotions on items (would touch the pricing contract — requires constitution amendment if introduced), bulk-buy pricing rules, per-customer pricing, server-side image processing / EXIF stripping (carried over from Phase 3 R8), driver-role surfaces, Visa/Instapay surfaces, real-time menu updates over WebSockets (poll on chef-profile read). The `Item` stock decrement on order placement and restoration on cancellation is **not** in Phase 4 — that's Phase 6's responsibility (Constitution VI's order-lifecycle scope). The chef-rating field on the top-rated grid reads `Chef.ratings` directly; until Phase 7 wires reviews, every chef's rating is 0 and the top-rated sort collapses to the verified-newest-first tiebreaker — the grid renders without an error. |

**Initial gate verdict**: PASS — proceed to Phase 0 research.

### Post-Design Gate (after Phase 1 artifacts)

Re-evaluated after `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md` were produced.

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | `quickstart.md` Step 8 walks through end-to-end English / Arabic parity across every Phase 4 customer-facing AND chef-facing mobile surface. The OpenAPI contracts return error *codes* (e.g., `MENU_NAME_TOO_LONG`, `ITEM_NEGATIVE_EFFECTIVE_PRICE`, `ITEM_IMAGES_FULL`, `ITEM_UPLOAD_RATE_LIMITED`); messages are rendered client-side per the precedent from Phases 1 – 3. Bilingual `{ en, ar }` JSON for `Menu.name` / `Item.name` / `Item.description` is declared in the contracts; a `BilingualText` reusable schema is shared across the menu / item / category endpoints. |
| II | Server-Authoritative Trust Boundary | PASS | `data-model.md` documents the `effectivePrice(item)` helper as a pure function consumed by every read endpoint that returns item prices. The bulk-reorder transaction boundary is named at every reorder endpoint in the contracts. The image-upload throttle is named on the OpenAPI operation as a `429 ITEM_UPLOAD_RATE_LIMITED` response and tied to the FR-012b decorator in `data-model.md`. The today-available helper is unit-tested against the Cairo TZ; the contract documents that "today" is computed server-side. |
| III | Modular Monolith with Strict Module Boundaries | PASS | `data-model.md` shows every cross-module call: `items.service → categories.service.findOneActiveOrThrow` (cat existence on menu); `home.service → chefs.service.{findManyForDiscovery, findTopRated} + categories.service.listActive`; `menus.service / items.service → chefs.service.findOwnedOrThrow` (chef-row ownership re-derivation); item-image upload + delete → `storage.service`. No module reads another's Prisma client directly. The `effectivePrice` helper is the one exception to the service-method pattern — it's a stateless pure function exported from `items` and imported by `cart` (Phase 5) and `orders` (Phase 6); treating it as a service method would force a circular dep through `forwardRef`, which is worse. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | `data-model.md` declares the `0004_item_active_displayorder_indexes` migration as index-only — no column changes. Every menu / item read goes through `prismaService.extended.*`; every soft-delete goes through `softDelete({ id })`. The image-array mutation is documented in `data-model.md` as a read-mutate-`set` cycle, never raw SQL. The today-available query shape in `chefs.service.findFullProfile` (or `menus.service.findTodayAvailableForChef`) is shown as a single Prisma `findMany` with the OR predicate on `availableAllDays` + an existence check on `availability`. |
| V | Design-System-First UI | PASS | `quickstart.md` Step 3 walks the chef-side menu editor referencing the design-system "chef catalogue editor" mockups; Step 4 walks the chef-side item editor against the item-card-edit mockup; Step 6 walks the customer-facing chef profile menu region against the menu-section + item-card mockups. New mobile screens consume `useColors()` exclusively; no hex literals introduced. |
| VI | Auditable, Reversible Order Lifecycle | PASS | Non-applicable directly; no order-state code in this phase. The `effectivePrice` helper is the lever that makes Phase 6's `OrderItem` snapshots auditable — `OrderItem.price` snapshots `effectivePrice(item)` and `OrderItem.priceBeforeDiscount` snapshots `item.price` at order creation, both server-computed. |
| VII | Scope Discipline & Documented Non-Goals | PASS | The OpenAPI contracts intentionally omit any admin-menu / admin-item endpoint, any time-windowed promotion field, any bulk-discount, any per-customer pricing, any driver-role / Visa-Instapay wiring. The `Item.images` array cap is exactly 5 per FR-012; no override. The `Item.quantity` schema slot supports the unlimited sentinel but the customer-facing contract exposes only `isUnlimitedStock + quantity (nullable)` — the magic integer is never on the wire. |

**Post-design gate verdict**: PASS — no Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/005-phase-4-menus/
├── spec.md                                # Feature specification (with 6 clarifications: 3 from /specify + 3 from /clarify)
├── plan.md                                # This file
├── research.md                            # Phase 0 output: technical decisions (R1 – R8)
├── data-model.md                          # Phase 1 output: Menu + Item + MenuAvailability usage map
├── quickstart.md                          # Phase 1 output: end-to-end Phase 4 verification path
├── contracts/
│   ├── chef-menus.openapi.yaml            # chef-side menu CRUD + day-of-week + bulk reorder
│   ├── chef-items.openapi.yaml            # chef-side item CRUD + bulk reorder + images upload/remove
│   ├── public-chef-profile.openapi.yaml   # customer-facing chef profile menu region (today-available)
│   └── home-explore.openapi.yaml          # customer Home payload + (re-export of) discovery
├── checklists/
│   └── requirements.md                    # Authored during /speckit-specify; updated after /speckit-clarify
└── tasks.md                               # Phase 2 output (NOT this command)
```

### Source Code (repository root, additions for Phase 4)

```text
nafas/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                                  # No column changes; index additions only
│   │   │                                                  # (migration carries the index DDL)
│   │   ├── seed.ts                                        # No Phase 4 changes
│   │   └── migrations/
│   │       └── 0004_item_active_displayorder_indexes/     # NEW (index-only, additive)
│   │           └── migration.sql
│   ├── src/
│   │   ├── app.module.ts                                  # +ItemsModule, +HomeModule
│   │   │                                                  # (MenusModule already imported in Phase 3
│   │   │                                                  # as a shell; same import line, expanded contents)
│   │   ├── modules/
│   │   │   ├── health/                                    # (Phase 0)
│   │   │   ├── auth/                                      # (Phase 1)
│   │   │   ├── users/                                     # (Phase 1)
│   │   │   ├── twilio/                                    # (Phase 1)
│   │   │   ├── email/                                     # (Phase 1)
│   │   │   ├── settings/                                  # (Phase 1)
│   │   │   ├── addresses/                                 # (Phase 2)
│   │   │   ├── orders/                                    # (Phase 2 shell, untouched here)
│   │   │   ├── chefs/                                     # (Phase 3, EXTENDED with findTopRated +
│   │   │   │                                              # findFullProfile composer that pulls in
│   │   │   │                                              # menus.service.findTodayAvailableForChef)
│   │   │   ├── categories/                                # (Phase 3, EXTENDED with findOneActiveOrThrow)
│   │   │   ├── storage/                                   # (Phase 3, reused for item-images bucket)
│   │   │   ├── notifications/                             # (Phase 3, no Phase 4 writes)
│   │   │   ├── admin/                                     # (Phase 3, untouched here)
│   │   │   ├── menus/                                     # (Phase 3 shell, PROMOTED to full)
│   │   │   │   ├── menus.module.ts                        # +MenusController; export MenusService
│   │   │   │   ├── menus.controller.ts                    # NEW
│   │   │   │   │                                          # GET /chef/menus
│   │   │   │   │                                          # POST /chef/menus
│   │   │   │   │                                          # PATCH /chef/menus/:id
│   │   │   │   │                                          # DELETE /chef/menus/:id
│   │   │   │   │                                          # PATCH /chef/menus/reorder
│   │   │   │   │                                          # POST /chef/menus/:id/availability
│   │   │   │   │                                          # DELETE /chef/menus/:id/availability/:dayId
│   │   │   │   ├── menus.service.ts                       # EXTENDED:
│   │   │   │   │                                          # Phase 3 shell methods preserved
│   │   │   │   │                                          # +createMenu, updateMenu, softDeleteMenu,
│   │   │   │   │                                          # +reorderMenus (transaction, dense-renumber),
│   │   │   │   │                                          # +addAvailability, removeAvailability,
│   │   │   │   │                                          # +findManyForChef (own browse),
│   │   │   │   │                                          # +findTodayAvailableForChef (customer profile)
│   │   │   │   ├── today-cairo.ts                         # NEW — pure helper, returns 0..6 weekday
│   │   │   │   │                                          # against Africa/Cairo at call time (R2)
│   │   │   │   └── dto/
│   │   │   │       ├── create-menu.dto.ts                 # name BilingualText + categoryId +
│   │   │   │       │                                      # availableAllDays + (initial?) availability
│   │   │   │       ├── update-menu.dto.ts
│   │   │   │       ├── reorder-menus.dto.ts               # { items: [{ id }] } — ordered list
│   │   │   │       ├── add-availability.dto.ts            # { dayOfWeek: 0..6 }
│   │   │   │       ├── bilingual-text.dto.ts              # NEW shared {en,ar} validator
│   │   │   │       └── menu.response.dto.ts
│   │   │   ├── items/                                     # NEW
│   │   │   │   ├── items.module.ts
│   │   │   │   ├── items.controller.ts                    # NEW
│   │   │   │   │                                          # GET /chef/menus/:menuId/items
│   │   │   │   │                                          # POST /chef/menus/:menuId/items
│   │   │   │   │                                          # PATCH /chef/items/:id
│   │   │   │   │                                          # DELETE /chef/items/:id
│   │   │   │   │                                          # PATCH /chef/menus/:menuId/items/reorder
│   │   │   │   │                                          # POST /chef/items/:id/images   (throttled)
│   │   │   │   │                                          # DELETE /chef/items/:id/images/:imageKey
│   │   │   │   ├── items.service.ts                       # createItem, updateItem, softDeleteItem,
│   │   │   │   │                                          # toggleActive, reorderItems (transaction),
│   │   │   │   │                                          # appendImage, removeImage,
│   │   │   │   │                                          # findManyForChef, findActiveForMenu
│   │   │   │   ├── effective-price.ts                     # NEW — exported pure function
│   │   │   │   │                                          # used by cart / orders later
│   │   │   │   └── dto/
│   │   │   │       ├── create-item.dto.ts                 # name + description BilingualText +
│   │   │   │       │                                      # price + discountValue + discountUnit +
│   │   │   │       │                                      # quantity | isUnlimitedStock
│   │   │   │       ├── update-item.dto.ts
│   │   │   │       ├── reorder-items.dto.ts
│   │   │   │       ├── stock-input.dto.ts                 # encodes {isUnlimitedStock, quantity}
│   │   │   │       │                                      # union shape; validator refuses ambiguous
│   │   │   │       └── item.response.dto.ts               # includes both base and effective price,
│   │   │   │                                              # isUnlimitedStock
│   │   │   │                                              # (chef read only — omitted on customer read)
│   │   │   └── home/                                      # NEW (composer only — no Prisma reads)
│   │   │       ├── home.module.ts
│   │   │       ├── home.controller.ts                     # GET /home
│   │   │       └── home.service.ts                        # composes openChefs +
│   │   │                                                  # categories + topRatedChefs into one payload
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
│   │   │   │   ├── chef-event.logger.ts                   # (Phase 3)
│   │   │   │   ├── category-event.logger.ts               # (Phase 3)
│   │   │   │   ├── menu-event.logger.ts                   # NEW (FR-032)
│   │   │   │   └── item-event.logger.ts                   # NEW (FR-032)
│   │   │   └── errors/
│   │   │       ├── auth-error.codes.ts                    # (Phase 1, +menu/item-namespace codes)
│   │   │       └── http-exception.filter.ts               # widen coord-redaction to
│   │   │                                                  # /chef/menus/*, /chef/items/*,
│   │   │                                                  # /chefs/*/menus, /chefs/*/profile;
│   │   │                                                  # emit FR-032 menu.* / item.*
│   │   │                                                  # events for validation_rejected /
│   │   │                                                  # not_found / role_refused / rate_limited
│   │   └── ...
│   ├── test/
│   │   ├── menus.e2e-spec.ts                              # NEW (CRUD, availability, reorder)
│   │   ├── menus-availability.e2e-spec.ts                 # NEW (today-available across every weekday;
│   │   │                                                  # mocked Cairo wall clock)
│   │   ├── items.e2e-spec.ts                              # NEW (CRUD, active toggle, reorder, image
│   │   │                                                  # append + remove)
│   │   ├── items-effective-price.e2e-spec.ts              # NEW (fixed/percent/zero/negative-refusal)
│   │   ├── items-throttle.e2e-spec.ts                     # NEW (saturate 20/60s; assert SC-007b)
│   │   ├── home.e2e-spec.ts                               # NEW (open-chefs scroll + categories
│   │   │                                                  # + top-rated grid composition)
│   │   ├── public-chef-profile.e2e-spec.ts                # NEW (today-available filter,
│   │   │                                                  # bilingual rendering, ownership)
│   │   ├── http-redaction.e2e-spec.ts                     # EXTEND (chef-menus / chef-items paths)
│   │   └── chef-bulk-reorder.e2e-spec.ts                  # NEW (atomic reorder; non-exact-set refusal)
│   ├── package.json                                       # No new deps
│   └── ...
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx                                    # (Phase 3, unchanged)
│   │   ├── (auth)/                                        # (Phase 1 / 3, unchanged)
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx                                # (Phase 3, unchanged)
│   │   │   ├── index.tsx                                  # FILL IN (Home: greeting,
│   │   │   │                                              # open-chefs horizontal scroll,
│   │   │   │                                              # category chip ribbon,
│   │   │   │                                              # top-rated grid)
│   │   │   ├── explore.tsx                                # EXTEND (debounce + filter
│   │   │   │                                              # cancellation per FR-024; pre-filter
│   │   │   │                                              # from Home tap per FR-025)
│   │   │   ├── favorites.tsx                              # (Phase 3 placeholder, unchanged)
│   │   │   ├── orders.tsx                                 # (Phase 3 placeholder, unchanged)
│   │   │   └── profile/index.tsx                          # (Phase 3 placeholder, unchanged)
│   │   ├── (chef)/
│   │   │   ├── _layout.tsx                                # (Phase 3, unchanged)
│   │   │   ├── dashboard.tsx                              # (Phase 3 placeholder, unchanged)
│   │   │   ├── orders.tsx                                 # (Phase 3 placeholder, unchanged)
│   │   │   ├── menu.tsx                                   # FILL IN (chef-side menu list
│   │   │   │                                              # + create/edit/delete + bulk reorder
│   │   │   │                                              # + day-of-week picker + per-menu items)
│   │   │   ├── stats.tsx                                  # (Phase 3 placeholder, unchanged)
│   │   │   ├── schedule.tsx                               # (Phase 3 placeholder, unchanged)
│   │   │   └── profile.tsx                                # (Phase 3, unchanged)
│   │   └── chef/
│   │       └── [id].tsx                                   # EXTEND (graft today-available
│   │                                                      # menu sections onto the header)
│   ├── components/
│   │   ├── AddressPickerMap.tsx                           # (Phase 2)
│   │   ├── KitchenLocationPicker.tsx                      # (Phase 3)
│   │   ├── MenuSectionList.tsx                            # NEW (collapsible menu sections)
│   │   ├── ItemCard.tsx                                   # NEW (discount badge,
│   │   │                                                  # out-of-stock, image carousel)
│   │   ├── DayOfWeekPicker.tsx                            # NEW (chef-side weekday picker)
│   │   ├── ItemImagesDialog.tsx                           # NEW (upload + per-image remove)
│   │   └── MenuEditorSheet.tsx                            # NEW (create + edit menu modal)
│   ├── hooks/
│   │   └── useColors.ts                                   # (Phase 2)
│   ├── context/
│   │   ├── AuthContext.tsx                                # (Phase 3, unchanged)
│   │   └── ChefMenuContext.tsx                            # NEW (chef-side editor state:
│   │                                                      # current menu list, edit drafts,
│   │                                                      # optimistic reorder buffer)
│   ├── services/
│   │   ├── addresses.ts                                   # (Phase 2)
│   │   ├── chefs.ts                                       # (Phase 3, EXTENDED with
│   │   │                                                   # GET /chef/{id} fetching menus + items)
│   │   ├── chefApply.ts                                   # (Phase 3)
│   │   ├── chefProfile.ts                                 # (Phase 3)
│   │   ├── categories.ts                                  # (Phase 3)
│   │   ├── notifications.ts                               # (Phase 3 placeholder)
│   │   ├── menus.ts                                       # NEW (chef-side menu CRUD + reorder
│   │   │                                                   # + availability)
│   │   ├── items.ts                                       # NEW (chef-side item CRUD + reorder
│   │   │                                                   # + images)
│   │   └── home.ts                                        # NEW (GET /home composer)
│   ├── constants/
│   │   └── i18n/
│   │       ├── en.ts                                      # +~110 keys
│   │       └── ar.ts                                      # +~110 keys
│   ├── app.config.ts                                      # (Phase 2 keys still apply; no new env vars)
│   ├── package.json                                       # No new deps
│   └── ...
├── admin/
│   └── ...                                                # No Phase 4 changes
└── ...
```

**Structure Decision**: Same monorepo and three-workspace layout the
Foundation phase chose. Phase 4 promotes one Phase 3 shell module
to full (`menus`), introduces two new backend modules (`items`,
`home`), and fills in the placeholder mobile tabs Phase 3 stubbed
(`(tabs)/index.tsx` for Home, `(chef)/menu.tsx` for the chef
catalogue editor). Zero admin web changes (spec Assumption: admin
oversight of menus / items is a Phase 11 candidate at most). Zero
new dependencies across all three workspaces.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be
> justified**

No violations. The Constitution Check both pre-research and
post-design returned PASS for all seven principles.

One design decision is worth naming so it does not look like a
boundary leak to a future reader: the `effectivePrice(item)`
helper is exported from `items` as a **pure function**, not as a
service method. The cart module (Phase 5) and the orders module
(Phase 6) both depend on it, and treating it as a service method
would force a circular dependency through `forwardRef` (because
cart and orders also depend on items for `findOne` queries).
A pure function has no DI graph and is the simplest correct
shape; Constitution Principle III is preserved because the
function does not encapsulate state and does not own data. This
is a deliberate, documented choice, not a violation.
