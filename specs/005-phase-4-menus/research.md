# Phase 4 Research: Menus, Items & Customer Discovery Surfaces

This document resolves every technical decision implied by `spec.md`
and `plan.md` before implementation begins. Each entry follows the
Decision / Rationale / Alternatives format used in Phases 0 – 3.

---

## R1 — Schema additions for Phase 4 (index-only migration)

**Decision**: Phase 4 ships **one Prisma migration** named
`0004_item_active_displayorder_indexes`. The migration is **index-
only**: no column additions, no type changes, no nullability
changes, no new tables, no enum additions. It adds three composite
indexes:

```sql
-- Items: today-available read (filter by menu_id + is_active +
-- soft-delete) — keeps the chef-profile menu-region read on the
-- fast index path even as items per chef grows.
CREATE INDEX "items_menu_id_is_active_deleted_at_idx"
  ON "items" ("menu_id", "is_active", "deleted_at");

-- Items: chef-side browse + customer-facing sort
-- (displayOrder ASC, createdAt ASC, id ASC).
CREATE INDEX "items_menu_id_display_order_idx"
  ON "items" ("menu_id", "display_order");

-- Menus: chef-side reorder-friendly browse
-- (displayOrder ASC, createdAt ASC, id ASC).
CREATE INDEX "menus_chef_id_display_order_idx"
  ON "menus" ("chef_id", "display_order");
```

The Phase 0 canonical schema already declares every column Phase 4
needs (`Menu.chefId`, `Menu.categoryId`, `Menu.name`,
`Menu.displayOrder`, `Menu.availableAllDays`, `Menu.deletedAt`;
`Item.menuId`, `Item.name`, `Item.description`, `Item.price`,
`Item.discountValue`, `Item.discountUnit`, `Item.quantity`,
`Item.images: String[]`, `Item.displayOrder`, `Item.isActive`,
`Item.deletedAt`; `MenuAvailability.menuId`,
`MenuAvailability.dayOfWeek` with `@@unique([menuId, dayOfWeek])`).
Nothing else is needed.

**Rationale**:

- A schema column addition would push the migration count up by one
  for zero behaviour gain — every Phase 4 field already exists.
  Constitution Principle IV's "schema is canonical" posture is
  best honoured by NOT introducing additive columns when the
  canonical schema already covers the use case.
- The three indexes are the queries Phase 4 issues most often:
  - The today-available chef-profile read filters items by
    `menuId, isActive, deletedAt`. Without the composite, the
    read falls back to the single-column `items_menu_id_idx`
    (Phase 0) and full-scans the items, which is fine at v1
    scale but unnecessary cost.
  - The chef-side browse + customer-facing item card list sorts
    by `displayOrder` within a menu. The two-column index lets
    the planner avoid a separate sort step.
  - The chef-side menu browse + the FR-002a bulk-reorder read
    sort by `displayOrder` within a chef. Same logic.
- The migration is reversible — three `DROP INDEX` statements
  are enough to revert. No data loss possible.

**Alternatives considered**:

- *No migration at all*: Acceptable at v1 scale. Rejected because
  the three indexes are cheap and the queries they accelerate
  will compound as the catalogue grows; adding them now means
  the production deploy never needs a "performance migration"
  follow-up.
- *Wider composite index covering both `is_active` and
  `display_order` in one*: Considered. Rejected because the two
  predicates do not co-occur in the same query path — the
  today-available read filters by `is_active`, the chef-side
  browse sorts by `display_order` with no `is_active` filter
  (chefs see inactive items, FR-015). Two narrower indexes are
  cheaper than one wide index.
- *Add `verifiedAt` to the chef discovery composite from Phase 3
  R2*: Already done by Phase 3 (`chefs_is_verified_lat_lng_idx`).
  No Phase 4 addition needed.

**Open question**: None. The migration is additive index-only;
no existing column changes type or nullability.

---

## R2 — Today-available filter against Africa/Cairo

**Decision**: Phase 4 ships a pure helper at
`backend/src/modules/menus/today-cairo.ts`:

```ts
// Returns 0..6 (0 = Sunday) for the current weekday in Africa/Cairo.
export function todaysCairoWeekday(now: Date = new Date()): number {
  // Intl is the standard, zero-dep way to get a wall-clock weekday
  // in an arbitrary IANA zone without pulling in date-fns-tz or
  // luxon. Node 20 LTS ships full ICU data, so 'Africa/Cairo' is
  // available without --with-intl flags.
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
  }).format(now);

  const order: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return order[weekday]!;
}
```

The today-available chef-profile read calls `todaysCairoWeekday()`
at request-handler entry, stores the result in a local `const`, and
uses it as the `MenuAvailability.dayOfWeek` filter value. The
helper takes an optional `now` argument so unit tests can pin the
clock without `jest.useFakeTimers()` infecting unrelated tests.

**Today-available query shape** (in
`menus.service.findTodayAvailableForChef(chefId)`):

```ts
const today = todaysCairoWeekday();

return this.prismaService.extended.menu.findMany({
  where: {
    chefId,
    OR: [
      { availableAllDays: true },
      { availability: { some: { dayOfWeek: today } } },
    ],
  },
  include: {
    items: {
      where: { isActive: true },
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    },
  },
  orderBy: [
    { displayOrder: 'asc' },
    { createdAt: 'asc' },
    { id: 'asc' },
  ],
});
```

**Rationale**:

- The spec clarification (Q3) is unambiguous: Africa/Cairo is the
  single source of truth. `Intl.DateTimeFormat` is the simplest
  way to get that under Node 20; no dependency, no time-zone
  database to keep in sync.
- The OR predicate covers both the `availableAllDays = true` mode
  and the per-weekday `MenuAvailability` row. Prisma compiles
  this to one SQL query with a subquery / join — no N+1.
- The `include` on items (filtered by `isActive: true`) lets the
  read return menus + their items in one round-trip; the
  `prismaService.extended.menu` client already filters soft-deleted
  menus, and the include's nested where filters items by
  `isActive` (soft-deleted items are filtered by the same extension
  inside the include — Phase 0 extension covers nested includes).
- The deterministic `orderBy` triplet `(displayOrder ASC, createdAt
  ASC, id ASC)` matches FR-006 / FR-018; ties on `displayOrder`
  fall back to creation order, then to UUID for absolute
  determinism (R5).
- Mocking the clock via `todaysCairoWeekday(mockDate)` lets
  `test/menus-availability.e2e-spec.ts` exercise every weekday
  rollover (Sun → Mon, Sat → Sun, midnight Cairo boundary)
  without `jest.useFakeTimers()` global state.

**Alternatives considered**:

- *date-fns-tz or luxon*: Rejected. Adds a dependency for one
  helper function. `Intl.DateTimeFormat` is built-in and well-
  supported under Node 20.
- *Database-side timezone conversion via `pg_timezone_names` /
  `AT TIME ZONE`*: Rejected. Would require raw SQL
  (Constitution IV barrier) and would also push the timezone
  decision into the data layer, where it is less visible to
  future contributors.
- *Customer's device clock or each chef's local time*: Rejected
  during the spec clarification round (Q3) — see spec
  Clarifications section.
- *Storing the timezone constant in `Settings` / `SettingsService`*:
  Considered. Postponed — the timezone is fixed by the spec for
  v1 (Egypt-only marketplace, constitution non-goal: no
  multi-country expansion). Hard-coding `'Africa/Cairo'` in one
  helper is simpler than introducing a Settings round-trip on
  every read. Phase 4+ multi-country pivot would require a
  constitution amendment anyway.

---

## R3 — Image-upload throttle (FR-012b / SC-007b)

**Decision**: The image-upload endpoint
`POST /chef/items/:id/images` carries a per-route
`@nestjs/throttler` override that tightens the Phase 1 default
`60 req / 60 s / IP` tier to **20 successful uploads / 60 s per
chef**. The per-chef keying is implemented via a small custom
guard that extends `ThrottlerGuard` and overrides
`getTracker(req)` to return `req.user.sub` (the JWT subject — the
user id). Per Phase 3 R1, a user has at most one chef row, so
keying by user id is equivalent to keying by chef id for any
`@Roles('chef')`-gated endpoint, without requiring a DB lookup
inside the throttle check.

```ts
// backend/src/common/guards/chef-throttler.guard.ts
import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ChefThrottlerGuard extends ThrottlerGuard {
  // Override the throttle key. The global ThrottlerGuard keeps using
  // the default IP-based key for every other route; this guard
  // applies the per-user (== per-chef) key ONLY on routes that
  // include it in @UseGuards.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return (req.user?.sub as string | undefined) ?? req.ip;
  }
}
```

```ts
// backend/src/modules/items/items.controller.ts (excerpt)
@UseGuards(JwtAuthGuard, ChefThrottlerGuard, RolesGuard)
@Roles('chef')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Post(':id/images')
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 3 * 1024 * 1024 },
}))
async uploadImage(...) { ... }
```

Guard execution order matters: `JwtAuthGuard` populates `req.user`
BEFORE `ChefThrottlerGuard` consults it. The global
`ThrottlerGuard` (registered via `APP_GUARD` in Phase 1) ALSO
fires for this route and applies its IP-based check against the
same 20/60s `@Throttle` override on this route — the request
must pass BOTH the per-IP and the per-user checks. This gives
the spec's "per-IP cap retained as a backstop" semantic for free.

The Phase 1 single-`default`-tier rule (R7 of Phase 1) is
preserved — the per-route override re-uses the same named tier,
and no second named tier is introduced globally. `ChefThrottlerGuard`
is NOT a second tier; it is a different *guard* applying the
SAME `default` tier with a different key derivation.

A request refused by the throttle returns the standard
NestJS throttler 429 response shape with body
`{ statusCode: 429, code: 'ITEM_UPLOAD_RATE_LIMITED' }`. The
controller observes the throttle by emitting the FR-032
`item.image_upload / rate_limited` event from the
`HttpExceptionNormalizerFilter` (the throttler exception
fires before the controller body runs, identical to how Phase 1
emits `auth.rate_limit` on the OTP / sign-in routes — the
filter is the canonical chokepoint).

**Why per-chef and not per-IP only**: a chef on a shared NAT
(typical of an Egyptian home internet connection) would
otherwise share the per-IP budget with their family, partner,
or building's common network; the per-chef key isolates each
chef's behaviour. The per-IP global throttle remains in effect
as a backstop for the case where one chef account is being
driven by a distributed scripted client.

**Why per-user works as per-chef**: Phase 3 R1's `@unique` on
`Chef.userId` enforces a 1:1 User ↔ Chef relation. A signed-in
chef has exactly one chef row; their user id uniquely identifies
their chef row without a DB lookup inside the throttle check.
If the constitution amendment that would relax the 1:1
constraint ever lands (none planned), this guard would need to
re-derive the chef id from a request-scoped cache populated by
an earlier guard.

**Rationale**:

- Image upload is the highest-cost write path on the chef
  surface (each successful call writes ~3 MB to public storage).
  An unthrottled endpoint is a real abuse vector at v1+ scale.
- Phase 1's R7 single-tier rule is a hard constraint; the
  `@Throttle({ default: { ... } })` decorator overrides the
  default tier's limits per-route without introducing a second
  named tier (which would compound).
- The per-chef key prevents the legitimate case of two chef
  devices on the same shared NAT from blocking each other while
  still catching a scripted abuser hammering a single chef
  account.

**Alternatives considered**:

- *Per-IP throttle (no chef key)*: Rejected — shared-NAT case
  is the v1 default in Egypt; per-IP would too easily block
  legitimate co-located chefs.
- *Per-IP + per-chef both, with the tighter winning*: Considered.
  The per-IP backstop is provided by the Phase 1 default tier
  (60 req / 60 s) which already applies to every authenticated
  route; the per-route override adds the per-chef budget on top.
  Both are in effect — the request must pass both checks.
- *Token bucket via Redis*: Rejected. No Redis in the stack
  (constitution stack snapshot). `@nestjs/throttler`'s in-process
  store is sufficient for v1; a multi-instance prod deploy
  would see slightly looser bounds per instance, which is
  acceptable (the cap is permissive enough that drift doesn't
  defeat the contract).
- *Defer to Phase 12 hardening*: Rejected during the spec
  clarification round (Q1) — the abuse vector is significant
  enough that the spec records the cap as a v1 requirement.

---

## R4 — `isUnlimitedStock` response shape & chef-side toggle preservation

**Decision**: Every item read shape carries the unlimited-stock
state as an explicit boolean alongside the visible quantity
field. The database-internal sentinel (`Item.quantity = -1`,
per Phase 6 stock-decrement contract) is **never on the wire**:

**Customer-facing item read** (returned from the chef-profile
menu region and from any future cart preview):

```jsonc
{
  "id": "...",
  "name":        { "en": "Classic Koshary", "ar": "كشري كلاسيك" },
  "description": { "en": "...",             "ar": "..." },
  "price":          "60.00",   // base price, decimal string
  "effectivePrice": "55.00",   // server-computed, decimal string
  "discountValue":  "5.00",
  "discountUnit":   "fixed",
  "isUnlimitedStock": false,
  "quantity":         8,       // omitted on the wire when isUnlimitedStock=true
  "inStock":          true,    // true if unlimited OR quantity > 0
  "images": ["https://.../images/item-1-a.jpg", ".../item-1-b.jpg"],
  "displayOrder": 0
}
```

**Chef-facing item read** (returned from the chef's own browse
and item editor):

```jsonc
{
  // ... everything from the customer read, PLUS:
  "isActive": true             // chef sees inactive items in their browse
}
```

The chef-facing extra field (`isActive`) and the client-side
`lastFiniteQuantity` state let the chef-side editor preserve the
"unlimited" toggle's off-state without forcing the chef to
re-enter a finite count from memory (FR-008 second sentence). When the chef has the
toggle on, the server stores `quantity = -1` (sentinel) AND
the previously-typed finite value sits in client memory only
— the chef-facing read surfaces it from the database via a
separate column? **No** — see "Schema impact" below.

**Schema impact**: The chef-side editor preserves
`lastFiniteQuantity` **client-side only** (in `ChefMenuContext`
local state — see plan.md). The database column
`Item.quantity` stores `-1` when the unlimited toggle is active
(active unlimited sentinel for Phase 6 stock-decrement logic).
When the toggle is off, it stores the chef's typed non-negative
integer. The prior finite count is NOT retained in the database
once the chef switches to unlimited; on edit reopen the editor
reads the database value, displays "Unlimited" if the value is
`-1`, and the toggle-off restores a sensible default (the chef
just types fresh). A v2 change could add
`Item.lastFiniteQuantity: Int?` if the round-tripping is
observed as a friction in practice. The spec text "the client
preserves the last finite value so re-disabling 'unlimited'
restores it for editing" is satisfied by client-state
preservation within a single editor session. The chef-facing
read shape does NOT include `lastFiniteQuantity` on the wire.

**Mapping rules** (in `items.service`):

```ts
// On write (chef create / update):
// Input DTO carries either { isUnlimitedStock: true } OR
// { isUnlimitedStock: false, quantity: Int(≥0) }.
const dbQuantity = dto.isUnlimitedStock ? -1 : dto.quantity;

// On read (returned to chef or customer):
const isUnlimitedStock = row.quantity === -1;
const visibleQuantity = isUnlimitedStock ? null : row.quantity;
const inStock = isUnlimitedStock || row.quantity > 0;
```

**Rationale**:

- The `-1` sentinel is a database-internal convention shared
  with Phase 6's stock-decrement query
  (`OR: [{ quantity: -1 }, { quantity: { gte: needed } }]`).
  Exposing it on the wire would force every client to know the
  sentinel. The explicit `isUnlimitedStock` boolean keeps the
  data-model semantic at the boundary.
- `inStock` is server-computed (Constitution II) so a customer
  client never has to know the unlimited rule.
- Omitting `quantity` from the wire when unlimited (rather than
  sending `null`) is a small payload reduction; a permissive
  JSON parser on the client treats both as "no value".

**Alternatives considered**:

- *Send `quantity: -1` over the wire and let the client
  interpret*: Rejected. Leaks the sentinel; the client has to
  carry the mapping logic; future schema changes are harder.
- *Tagged union (`{ stockMode: 'unlimited' } | { stockMode:
  'finite', quantity: N }`)*: Considered. Cleaner type but
  noisier on the wire and harder to compose with the chef-side
  editor's optional `quantity` input. Rejected for v1
  simplicity.
- *Add `Item.lastFiniteQuantity: Int?` to the schema*:
  Rejected for v1 (per "Schema impact" above). Would require a
  column addition, breaking the R1 "index-only migration"
  posture. Can be added later additively if user friction
  emerges.

---

## R5 — Bulk-reorder transaction (FR-002a / FR-009a)

**Decision**: Both bulk-reorder endpoints wrap their dense-
renumber in one `prisma.$transaction`. The endpoint accepts an
ordered identifier list; the service validates it is an
**exact cover** of the chef's (for menus) or menu's (for items)
current non-soft-deleted collection, then rewrites every
listed row's `displayOrder` as a dense zero-based sequence
inside the transaction.

**Menus reorder** (`menus.service.reorderMenus(chefId, orderedMenuIds)`):

```ts
async reorderMenus(chefId: string, orderedMenuIds: string[]): Promise<void> {
  return this.prismaService.$transaction(async (tx) => {
    const currentRows = await tx.menu.findMany({
      where: { chefId, deletedAt: null },
      select: { id: true },
    });
    const currentIds = currentRows.map(r => r.id).sort();
    const submittedSorted = [...orderedMenuIds].sort();
    if (currentIds.length !== submittedSorted.length ||
        currentIds.some((id, i) => id !== submittedSorted[i])) {
      throw new BadRequestException({ code: 'MENUS_REORDER_NOT_EXACT_SET' });
    }
    // Dense renumber inside the transaction
    for (let i = 0; i < orderedMenuIds.length; i++) {
      await tx.menu.update({
        where: { id: orderedMenuIds[i] },
        data: { displayOrder: i },
      });
    }
  });
}
```

`items.service.reorderItems(menuId, orderedItemIds)` follows
the identical shape, validating against
`tx.item.findMany({ where: { menuId, deletedAt: null }, ... })`.

The exact-set guard happens BEFORE any update inside the
transaction. A submission with missing IDs, unknown IDs, or
duplicates short-circuits to a `400 *_REORDER_NOT_EXACT_SET`
with no DB writes. A submission whose ID set matches but
contains a row owned by another chef is caught by an
ownership pre-check before the transaction (every Phase 4
mutation re-derives `chefs.service.findOwnedOrThrow(userId)`).

**Rationale**:

- Mirrors Phase 3 FR-027's atomic category-reorder contract
  verbatim. Spec text "mirrors the Phase 3 FR-027 atomic
  category-reorder contract" is the load-bearing reference.
- The dense renumber inside the transaction ensures that
  (a) two rows in the same parent never share a `displayOrder`
  after the reorder commits, and (b) a partial reorder cannot
  be observed by any reader (the transaction is all-or-nothing).
- The exact-set guard prevents two classes of accidental
  corruption: a chef-side bug that drops an ID would otherwise
  leave the dropped row with its stale `displayOrder`; an
  unknown ID would otherwise raise `P2025` mid-transaction and
  roll back, which works but is less informative than a clear
  400.
- Sequential `tx.update` is fine at v1 scale (typical chef has
  < 10 menus, < 30 items per menu). At v2+ scale, the
  per-row updates could be replaced with a `tx.menu.updateMany`
  + `CASE WHEN id = ?` pattern, but that pattern requires raw
  SQL and is not justified by the current row counts.

**Alternatives considered**:

- *`updateMany` + `CASE WHEN id = ?`*: Rejected. Requires raw
  SQL (Constitution IV barrier) and is not justified by the
  current row counts.
- *Optimistic version field on each row to detect stale
  reorder submissions*: Considered. Postponed — the exact-set
  guard catches the "stale client view" case (the chef's
  submission references a row that has been deleted by another
  session); adding a version field is over-engineering for v1.
- *Reorder via PATCH with `displayOrder` on each row update
  endpoint*: Rejected. This is the original FR-009 wording
  before the /clarify round; the dedicated reorder endpoint is
  strictly better because it preserves atomicity AND avoids the
  collision case.

---

## R6 — Image array mutation strategy (`Item.images: String[]`)

**Decision**: Phase 4 reads, mutates, and writes the `images`
array in **TypeScript** (not in SQL). Prisma supports the
`push` operator for `String[]` columns (`data: { images: {
push: newUrl } }`) for the APPEND case, but it does NOT support
a slice-out operator for individual-image removal — so the
REMOVE case has to do a read-mutate-`set` cycle. For symmetry
and to avoid two divergent code paths, BOTH append and remove
use the same read-mutate-`set` cycle:

**Append** (FR-012 / FR-013):

```ts
async appendImage(itemId: string, chefId: string, fileBuffer: Buffer, mimeType: string): Promise<string[]> {
  const item = await this.findOwnedOrThrow(itemId, chefId);
  if (item.images.length >= 5) {
    throw new BadRequestException({ code: 'ITEM_IMAGES_FULL' });
  }
  const objectKey = `items/${chefId}/${itemId}/${randomUUID()}.${extension(mimeType)}`;
  const publicUrl = await this.storage.upload('item-images', objectKey, fileBuffer, mimeType);
  const next = [...item.images, publicUrl];
  await this.prismaService.item.update({
    where: { id: itemId },
    data: { images: { set: next } },
  });
  return next;
}
```

**Remove** (FR-012a / FR-013):

```ts
async removeImage(itemId: string, chefId: string, imageKey: string): Promise<string[]> {
  const item = await this.findOwnedOrThrow(itemId, chefId);
  // The imageKey is the storage object key (everything after the
  // bucket name in the public URL). It identifies one image
  // unambiguously without needing array indices that drift across
  // concurrent edits.
  const matching = item.images.filter(u => u.endsWith(imageKey));
  if (matching.length === 0) {
    // Idempotent: already removed (or never existed in this item).
    // FR-012a explicitly mandates idempotent "already removed".
    return item.images;
  }
  const next = item.images.filter(u => !u.endsWith(imageKey));
  await this.prismaService.item.update({
    where: { id: itemId },
    data: { images: { set: next } },
  });
  // Best-effort storage cleanup — same discipline as Phase 3
  // chef logo / banner replacement: log on failure, never throw.
  this.storage.delete('item-images', imageKey).catch(err =>
    this.logger.error({ msg: 'storage.delete failed', imageKey, err }),
  );
  return next;
}
```

Both operations are atomic at the row level. Two concurrent
removes on the same item are safe under Postgres last-write-wins
on the row; the second remove sees the already-shrunken array
(missing both URLs) and short-circuits to the idempotent path.

**Storage object key shape**: `items/<chefId>/<itemId>/<uuid>.<ext>`.
The path scopes uploads under the chef (avoids name collisions
across chefs) and under the item (lets a future "delete item"
cascade enumerate the item's objects cheaply). The UUID
prevents collision when a chef uploads the same filename twice;
the extension matches the mime-type.

**Rationale**:

- The read-mutate-`set` cycle is the simplest correct shape
  that handles both append (with a 5-cap check) and remove
  (with idempotency) without raw SQL.
- Identifying the image by its **storage object key** (the
  suffix of the public URL) rather than its array index makes
  the remove operation safe against concurrent edits: array
  indices drift, but the object key is stable for the lifetime
  of the storage object.
- The best-effort storage `delete` after the database write
  follows the Phase 3 chef logo / banner pattern (the row is
  the source of truth; the storage object is downstream).
  A storage delete failure leaves an orphaned object that a
  future Phase 12 cleanup job can sweep; the row state is
  consistent.

**Alternatives considered**:

- *Use Prisma's `push` for append and raw SQL for remove*:
  Rejected. Two divergent code paths; the raw SQL would need
  to be carved as a Constitution IV exception. Read-mutate-`set`
  is symmetric and clean.
- *Identify images by array index*: Rejected. Array indices
  drift under concurrent edits. The storage object key is
  stable.
- *Use a normalised `ItemImage` table with rows referencing
  the item*: Considered (would make per-image metadata easier
  to add later — captions, alt text). Rejected for v1 — the
  `String[]` shape on `Item.images` is already canonical from
  Phase 0; promoting to a table is a schema change that should
  be a separate phase if observed friction warrants it.

---

## R7 — Indexes consumed by Phase 4 queries

**Decision**: The three new composite indexes from R1 plus the
existing Phase 0 / 3 indexes cover every Phase 4 query. The
table below maps each query to the index it uses.

| Query | Module | Index consumed |
|---|---|---|
| Today-available chef-profile read | `menus.service.findTodayAvailableForChef` | `menus_chef_id_display_order_idx` (R1) for the outer menu sort; `items_menu_id_is_active_deleted_at_idx` (R1) for the items include filter; `menu_availabilities_menu_id_day_of_week_uq` (Phase 0 `@@unique`) for the OR predicate's nested `some`. |
| Chef-side menu browse | `menus.service.findManyForChef` | `menus_chef_id_display_order_idx` (R1). |
| Chef-side item browse for one menu | `items.service.findManyForChef` | `items_menu_id_display_order_idx` (R1). |
| Bulk-reorder current-set fetch | `menus.service.reorderMenus`, `items.service.reorderItems` | `menus_chef_id_display_order_idx` / `items_menu_id_display_order_idx`. |
| Add availability row | `menus.service.addAvailability` | `menu_availabilities_menu_id_day_of_week_uq` for the upsert. |
| Item ownership re-derivation | `items.service.findOwnedOrThrow` | Primary key on `items.id`; chef-row join via `menus.chefId` → `chefs.userId` (Phase 3 chef-ownership pattern). |
| Home open-chefs scroll | `home.service` → `chefs.service.findManyForDiscovery({ isOpen: true })` | `chefs_is_verified_latitude_longitude_idx` (Phase 3 R1) — the discovery query is unchanged. |
| Home top-rated grid | `chefs.service.findTopRated` | NEW: relies on a sort by `(ratings DESC, verifiedAt DESC, id ASC)`. The Phase 3 chef table has indexes on `is_verified` and on the composite from R1 of Phase 3; the top-rated sort is small (≤ 12 rows, capped by the home query) so a full-scan on the verified subset is acceptable at v1 scale. The `is_verified` filter narrows the scan; the in-memory sort over the bounded result set is sub-millisecond. **No new index needed.** If row counts grow into the tens of thousands of verified chefs, a `(is_verified, ratings, verified_at)` index becomes warranted; Phase 12 hardening can revisit. |
| Categories list | `categories.service.listActive` | 60-second in-process cache (Phase 3 R7). No DB read on cache hit. |

**Rationale**:

- The R1 indexes are sized to the queries that consume them
  the most (today-available read; chef-side browse; bulk
  reorder). No speculative indexes.
- The home top-rated grid is intentionally NOT given a new
  index because v1 chef counts are too low to warrant one;
  recording the reasoning here so a future contributor doesn't
  read "no index on top-rated" as an oversight.

**Alternatives considered**:

- *Index `chef.ratings` + `chef.verifiedAt`*: Rejected for v1.
  See above.
- *Materialised view for the today-available read*: Rejected.
  Adds operational complexity (refresh scheduling, staleness
  windows) for a read that hits the indexed path comfortably.

---

## R8 — Search debounce + filter cancellation on Explore (FR-024)

**Decision**: The mobile Explore screen
(`mobile/app/(tabs)/explore.tsx`) implements two related
behaviours:

1. **Search input debounce**: after the customer types a
   character, the screen waits **300 ms** of keystroke silence
   before issuing the backend request. 300 ms is comfortably
   above the SC-012 ≥ 200 ms threshold and below the
   perceptible-lag threshold (~500 ms).
2. **In-flight request cancellation**: every dispatched
   discovery request goes through an `AbortController`. Before
   the screen dispatches a new request (because the search
   term, the category filter, or the cursor changed), it
   `abort()`s any in-flight controller and creates a fresh
   one. The aborted request's response, if it ever arrives,
   is ignored.

Implementation lives in a `useDebouncedDiscovery({ q,
categoryId, lat, lng, radiusKm })` hook that owns both the
timer and the controller. The hook returns
`{ chefs, isLoading, error }` and is consumed by
`mobile/app/(tabs)/explore.tsx`. The same hook is reused on
the Home open-chefs scroll for the (rare) case where the
customer-supplied filters change.

**Rationale**:

- 300 ms debounce balances responsiveness against backend
  load. A faster debounce burns backend cycles on keystrokes
  the customer is mid-typing; a slower one (e.g., 500 ms)
  feels laggy.
- `AbortController` is the idiomatic React Native /
  fetch-API way to cancel in-flight requests. The Phase 1
  axios instance already supports `signal` for cancellation.
- Encapsulating both in one hook means the screen's render
  logic stays declarative and the timer / controller leak
  surface is small.

**Alternatives considered**:

- *Throttle instead of debounce*: Rejected. A throttle would
  fire on the first keystroke (no debounce), which results in
  noisy intermediate results before the customer finishes
  typing. Debounce is the right semantic for search.
- *Debounce duration tied to network round-trip time*:
  Over-engineered for v1. A fixed 300 ms is easier to reason
  about and unit-test.

---

## Open Items still tracked

- **Top-rated grid index** (R7): no new index at v1 scale.
  Phase 12 hardening sweep should revisit if verified-chef
  count exceeds ~10,000.
- **`Item.lastFiniteQuantity` schema column** (R4): not
  added in v1. Chef editor preserves last-finite-value in
  client memory only. If chefs observe friction (forgetting
  their finite count after a session reload), Phase 12 (or a
  v1.1 patch) could add the column additively.
- **Storage object cleanup for soft-deleted items / menus**:
  Phase 4 does not delete storage objects when a chef
  soft-deletes an item or menu. The row carries `deletedAt`
  but the storage objects under
  `items/<chefId>/<itemId>/*` remain. A Phase 12 cleanup
  job (or the existing Phase 0 daily cleanup cron, extended
  in Phase 12) could sweep storage paths whose owning row is
  soft-deleted and older than N days. This is intentional —
  preserving the storage objects matches the soft-delete
  audit posture (Constitution IV).
- **Concurrent edits on the same item by two chef sessions**:
  Phase 4 uses Postgres last-write-wins semantics. The spec
  flagged this as a low-impact deferral during /clarify. If
  observed friction emerges, a future phase could add an
  optimistic version field to `Item` and refuse stale writes
  with `409 STALE_WRITE`.
- **Image dimension / aspect-ratio minimums**: not enforced
  in v1 (consistent with the Phase 3 chef-logo/banner posture
  per R8 of Phase 3). The mobile client SHOULD render
  oversized images centred and cropped via the design-system
  item-card pattern, but the platform does not refuse a
  small image at upload. Phase 12 may revisit.
- **Currency**: Phase 4 returns prices as decimal strings
  (e.g., `"60.00"`); the currency is implicitly Egyptian
  Pounds (EGP) per the Egypt-only marketplace constraint.
  The wire format does not name the currency in v1. A multi-
  currency future would require a constitution amendment and
  is out of scope.
