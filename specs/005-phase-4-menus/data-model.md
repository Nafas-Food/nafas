# Phase 4 Data Model: Menus, Items & Customer Discovery Surfaces

Phase 4 ships **one Prisma migration** that is **index-only** —
no column additions, no type changes, no nullability changes, no
new tables, no enum additions. Behaviour is materialised on
entities the constitution already defines and the Foundation
phase already migrated:

- `Menu` — Phase 3 read this table through a small shell
  (`hasMenuInCategory`, `categoriesForChef`, `chefIdsInCategory`).
  Phase 4 is the first phase that creates / mutates / soft-deletes
  rows in this entity. The Phase 3 shell methods are preserved
  on `MenusService` unchanged.
- `Item` — Phase 4 is the first phase that creates / mutates /
  soft-deletes rows in this entity. No previous phase wrote
  Items.
- `MenuAvailability` — Phase 4 is the first phase that creates
  or deletes rows in this entity.
- `Chef` (existing, Phase 3): read-only in Phase 4 for the chef-
  ownership re-derivation and the home top-rated grid. No new
  fields, no new writes.
- `Category` (existing, Phase 3): read-only in Phase 4 for the
  FR-003 category-existence guard. No new fields, no new writes.

The canonical schema lives at `backend/prisma/schema.prisma`;
this document is the human-readable usage map for Phase 4.

---

## The `0004_item_active_displayorder_indexes` migration (additive index-only)

```sql
-- Phase 4 schema additions (one migration, index-only)

CREATE INDEX "items_menu_id_is_active_deleted_at_idx"
  ON "items" ("menu_id", "is_active", "deleted_at");

CREATE INDEX "items_menu_id_display_order_idx"
  ON "items" ("menu_id", "display_order");

CREATE INDEX "menus_chef_id_display_order_idx"
  ON "menus" ("chef_id", "display_order");
```

Three changes only:

1. **`items_menu_id_is_active_deleted_at_idx`** — composite
   index consumed by the today-available chef-profile read's
   items include (R7).
2. **`items_menu_id_display_order_idx`** — composite index
   consumed by the chef-side browse + customer-facing item
   sort (R7).
3. **`menus_chef_id_display_order_idx`** — composite index
   consumed by the chef-side menu browse + the FR-002a
   bulk-reorder pre-check (R7).

No existing column changes type, nullability, or default. No
data migration is required.

---

## Conventions inherited from Phase 0 / Phase 1 / Phase 2 / Phase 3

- **ID columns**: `Menu.id`, `Item.id`, `MenuAvailability.id` are
  all `@db.Uuid @default(dbgenerated("gen_random_uuid()"))`.
- **Timestamps**: All Phase 4 entities carry `createdAt`,
  `updatedAt`, and (for soft-delete entities — `Menu` and `Item`)
  `deletedAt`. `MenuAvailability` carries only `createdAt`
  (rows are hard-deleted when a chef unticks a weekday —
  there is no audit benefit to retaining a per-weekday history).
- **Reads on soft-delete entities**:
  `prismaService.extended.menu.*` / `prismaService.extended.item.*`
  is the default — soft-deleted rows are filtered automatically,
  including in nested `include` blocks. **Phase 4 has no
  exceptions to this rule** (Phase 3's cooldown-gate exception
  for the bare `chef` client is the only such exception in the
  codebase).
- **Writes on soft-delete entities**:
  - Soft-delete: `prismaService.menu.softDelete({ id })` /
    `prismaService.item.softDelete({ id })`. The extension
    takes the where-clause directly (not wrapped in another
    `{ where: ... }`), per Phase 0 conventions.
  - Hard `prisma.menu.delete(...)` / `prisma.item.delete(...)`
    are blocked at CI by the Phase 0 grep gate
    (`backend/scripts/ci-no-hard-delete.sh`).
  - `MenuAvailability` rows ARE hard-deleted via
    `prisma.menuAvailability.delete({ where: { menuId_dayOfWeek:
    { menuId, dayOfWeek } } })`. The CI grep gate is configured
    to allow `prisma.menuAvailability.delete` (the gate lists
    soft-delete entities explicitly).

---

## Menu

### State machine

```text
            ┌───────────────────────────┐
[no row] ── │ POST /chef/menus          │ ──→ Active (deletedAt=NULL)
            └───────────────────────────┘

Active   ──┬── PATCH /chef/menus/:id            ──→ Active (fields updated)
           │
           ├── POST /chef/menus/:id/availability ──→ Active (one
           │                                             MenuAvailability
           │                                             row added)
           │
           ├── DELETE /chef/menus/:id/availability/:dayId
           │                                       ──→ Active (one
           │                                             MenuAvailability
           │                                             row removed)
           │
           ├── PATCH /chef/menus/reorder          ──→ Active (displayOrder
           │                                             rewritten in $tx)
           │
           └── DELETE /chef/menus/:id             ──→ Soft-deleted
                                                       (deletedAt=now;
                                                        nested items
                                                        unreachable via
                                                        chef + customer
                                                        reads)
```

A soft-deleted menu is never resurrected by a Phase 4 surface.
A chef who soft-deletes a menu and wants the menu back creates a
fresh menu (with fresh items). This matches the constitution's
schema-first / audit-preserving posture: the soft-deleted row
remains for audit, the new menu is a new row.

### Fields used in Phase 4

| Field | Type | Phase 4 usage |
|---|---|---|
| `id` | UUID | Returned in every menu response. Path param on chef-self mutations and on item-create / item-list (`/chef/menus/:menuId/items`). |
| `chefId` | UUID | Set at menu create from the chef row resolved by `chefs.service.findOwnedOrThrow(userId)`. NEVER client-supplied. |
| `categoryId` | UUID | Set at menu create / update. Validated against `categories.service.findOneActiveOrThrow(id)` before the write (FR-003). |
| `name` | Json | Bilingual display name as `{ en: string, ar: string }`. Each locale validated `@Length(1, 60)` after server-side trim (FR-001, spec /clarify Q2). Required on both locales. |
| `displayOrder` | Int | Defaults `0` at create. Mutated ONLY by `menus.service.reorderMenus` inside its `prisma.$transaction` (FR-002a). The per-menu update endpoint does NOT accept this field (the `UpdateMenuDto` does not declare it; the global `whitelist: true, forbidNonWhitelisted: true` pipe refuses the field on the update path). |
| `availableAllDays` | Boolean | Defaults `false`. When `true`, the menu is today-available regardless of `MenuAvailability` rows. FR-001 / FR-002 / FR-017. |
| `createdAt` | DateTime | Auto. Used as the second-level tiebreaker in the deterministic sort `(displayOrder ASC, createdAt ASC, id ASC)` (FR-006 / FR-018). |
| `updatedAt` | DateTime | Auto. |
| `deletedAt` | DateTime? | Soft-delete marker (Phase 0 convention). Set by `softDelete({ id })`. Cleared NEVER in Phase 4 (no resurrection). |

### Relations exercised in Phase 4

| Relation | Direction | Phase 4 usage |
|---|---|---|
| `Chef` | `menus.chef_id → chefs.id` | Read for the ownership re-derivation on every menu mutation. The chef row carries `userId`; the menu mutation re-derives the chef from `req.user.sub` via `chefs.service.findOwnedOrThrow(userId)` and asserts `menu.chefId === chef.id` before any write. |
| `Category` | `menus.category_id → categories.id` | Read at menu create / update for the FR-003 existence check via `categories.service.findOneActiveOrThrow(id)`. A reference to a soft-deleted or non-existent category is refused with `400 CATEGORY_NOT_FOUND`. |
| `Item[]` | `items.menu_id → menus.id` | Read by the customer-facing chef-profile read (the today-available `include`) and the chef-side browse. Soft-deleted items are filtered automatically through `prismaService.extended.item.*`. |
| `MenuAvailability[]` | `menu_availabilities.menu_id → menus.id` | Read by the today-available filter (`availability: { some: { dayOfWeek: today } }`). Written by `addAvailability` / `removeAvailability` on the chef-side editor. |

### Validation rules (DTO-level)

| Rule | Source | Where validated |
|---|---|---|
| `name.en` / `name.ar` ≤ 60 chars after trim, both required | FR-001 (spec /clarify Q2) | `@ValidateNested()` + custom `BilingualText` validator (60-char cap) on `CreateMenuDto.name` and `UpdateMenuDto.name`. The cap is enforced AFTER `@Transform(trim)`. |
| `categoryId` is a non-soft-deleted Category | FR-003 | DTO validates UUID shape (`@IsUUID()`); the service-layer `categories.service.findOneActiveOrThrow(id)` performs the existence check. |
| `availableAllDays` boolean | FR-001 / FR-002 | `@IsBoolean()`. |
| Bulk reorder body `items: [{ id }]` is an exact cover of the chef's current non-soft-deleted menus | FR-002a | DTO declares `@ArrayMinSize(1)` + `@ArrayUnique('id')`. The service-layer guard runs the exact-set check inside the transaction (R5). |
| `dayOfWeek` ∈ [0, 6] (0 = Sunday) | FR-004 | `@IsInt()` + `@Min(0)` + `@Max(6)` on `AddAvailabilityDto.dayOfWeek`. Idempotency on the unique `(menuId, dayOfWeek)` is honoured via `upsert` (R1). |
| Request body MUST NOT carry server-owned fields | FR-031 | `whitelist: true, forbidNonWhitelisted: true` pipe (Phase 0 default) refuses `id`, `chefId`, `displayOrder` (on update), `createdAt`, `updatedAt`, `deletedAt`. |

### Indexes consumed

| Index | Source | Phase 4 query that uses it |
|---|---|---|
| Primary key on `id` | implicit | Single-row fetch / update / soft-delete. |
| `menus_chefid_idx` | Phase 0 `@@index([chefId])` | `categoriesForChef(chefId)` / `hasMenuInCategory(chefId, ...)` (Phase 3 shell methods, unchanged). |
| `menus_chef_id_display_order_idx` | **NEW (R1)** | Chef-side menu browse + bulk-reorder pre-check. |

### Lifecycle in Phase 4

The state-machine diagram above captures the full lifecycle.
Every mutation runs through `chefs.service.findOwnedOrThrow(userId)`
before any write. Bulk reorder is a `prisma.$transaction`. Every
other mutation is a single Prisma call.

---

## Item

### State machine

```text
            ┌───────────────────────────┐
[no row] ── │ POST /chef/menus/:menuId/ │ ──→ Active (isActive=true,
            │              items        │     deletedAt=NULL,
            └───────────────────────────┘     images=[] or initial set)

Active ──┬── PATCH /chef/items/:id            ──→ Active (fields updated;
         │                                          isActive may flip)
         │
         ├── POST /chef/items/:id/images      ──→ Active (image appended;
         │                                          subject to 5-image cap
         │                                          and FR-012b throttle)
         │
         ├── DELETE /chef/items/:id/images/:imageKey
         │                                    ──→ Active (image removed
         │                                          idempotently)
         │
         ├── PATCH /chef/menus/:menuId/items/reorder
         │                                    ──→ Active (displayOrder
         │                                          rewritten in $tx)
         │
         └── DELETE /chef/items/:id           ──→ Soft-deleted
                                                  (deletedAt=now;
                                                   storage objects
                                                   retained — see R6)
```

The `isActive` flag is a separate, **chef-controlled, reversible**
hide-from-customer toggle (FR-011). Soft-delete (FR-014) is a
**stronger** operation: a soft-deleted item is hidden from chef AND
customer surfaces and does not resurrect. Both states are honoured
by every Phase 4 read.

### Fields used in Phase 4

| Field | Type | Phase 4 usage |
|---|---|---|
| `id` | UUID | Returned in every item response. Path param on chef-self mutations. |
| `menuId` | UUID | Set at item create from the path param `/chef/menus/:menuId/items`. The menu is re-derived via `menus.service.findOwnedOrThrow(menuId, userId)` so cross-menu writes are impossible. NEVER client-supplied via the body. |
| `name` | Json | Bilingual `{ en, ar }`. Each locale validated `@Length(1, 60)` after trim (FR-007, spec /clarify Q2). |
| `description` | Json | Bilingual `{ en, ar }`. Each locale validated `@Length(1, 500)` after trim (FR-007, spec /clarify Q2). |
| `price` | Decimal(10, 2) | Set at item create / update. Validated `> 0` server-side via `@IsPositive()` + `@IsNumber({ maxDecimalPlaces: 2 })`. Stored as `Decimal`; returned as decimal string (Phase 0 convention). |
| `discountValue` | Decimal(10, 2) | Defaults `0`. Validated `>= 0`. The combined `(price, discountValue, discountUnit)` MUST yield a non-negative effective price; the validator at the service layer raises `400 ITEM_NEGATIVE_EFFECTIVE_PRICE` otherwise (FR-010). |
| `discountUnit` | enum `DiscountUnit` (`fixed` / `percent`) | Defaults `fixed`. Selects the effective-price formula (R4 / FR-016). |
| `quantity` | Int | Stored as either a non-negative integer (chef's last typed finite count) OR `-1` (the platform-defined unlimited sentinel, R4). Mapped to / from the wire's `(isUnlimitedStock, quantity)` pair in `items.service`. |
| `images` | String[] | Postgres `String[]`. Append goes through the read-mutate-`set` cycle in `items.service.appendImage` (R6). Remove goes through `items.service.removeImage` (R6). Cap: 5 entries. |
| `displayOrder` | Int | Defaults `0` at create. Mutated ONLY by `items.service.reorderItems` inside its `prisma.$transaction` (FR-009a). The per-item update endpoint does NOT accept this field (same posture as `Menu.displayOrder`). |
| `isActive` | Boolean | Defaults `true`. Mutated via the regular per-item update endpoint (toggled by chef from the chef-side editor). Customer-facing reads filter `isActive: true`; chef-facing browse returns both states (FR-011 / FR-015). |
| `createdAt` | DateTime | Auto. Second-level tiebreaker in the deterministic sort (FR-018). |
| `updatedAt` | DateTime | Auto. |
| `deletedAt` | DateTime? | Soft-delete marker. Set by `softDelete({ id })` on `DELETE /chef/items/:id`. |

### Effective-price computation (the FR-016 helper)

The `effectivePrice(item)` helper lives at
`backend/src/modules/items/effective-price.ts` and is exported
as a **pure function**, not a service method (see plan.md
Complexity Tracking for the rationale). Its shape:

```ts
import Decimal from 'decimal.js';

/**
 * Server-authoritative effective sell price for an item (FR-016).
 * Consumed by:
 *  - items.service (returned alongside base price on every read).
 *  - Phase 5 cart subtotal computation.
 *  - Phase 6 OrderItem.price snapshot at order creation.
 *
 * NEVER computed on the client. Constitution Principle II.
 */
export function effectivePrice(item: {
  price: Decimal | string;
  discountValue: Decimal | string;
  discountUnit: 'fixed' | 'percent';
}): Decimal {
  const base = new Decimal(item.price);
  const discount = new Decimal(item.discountValue);
  if (item.discountUnit === 'fixed') {
    return Decimal.max(base.minus(discount), 0);
  }
  // percent
  const factor = new Decimal(1).minus(discount.div(100));
  return Decimal.max(base.times(factor), 0);
}
```

The helper is also used by `items.service.assertNonNegativeEffectivePrice(dto)`
at create / update validation time:

```ts
private assertNonNegativeEffectivePrice(dto: { price; discountValue; discountUnit; }): void {
  const eff = effectivePrice(dto);
  // The helper already clamps to 0. An effective price of exactly 0 is permitted
  // (FR-010). The validator only refuses when the chef's input would have driven
  // the math negative before the clamp — i.e., when discount > price for fixed,
  // or discount > 100 for percent.
  if (dto.discountUnit === 'fixed' && new Decimal(dto.discountValue).gt(dto.price)) {
    throw new BadRequestException({ code: 'ITEM_NEGATIVE_EFFECTIVE_PRICE' });
  }
  if (dto.discountUnit === 'percent' && new Decimal(dto.discountValue).gt(100)) {
    throw new BadRequestException({ code: 'ITEM_NEGATIVE_EFFECTIVE_PRICE' });
  }
}
```

### `isUnlimitedStock` mapping (the R4 wire shape)

| Where | Wire field | Database column |
|---|---|---|
| Chef create / update DTO | `isUnlimitedStock: boolean` AND (when false) `quantity: Int(≥0)` | Mapped to `Item.quantity = -1` (when unlimited) or `Item.quantity = dto.quantity` (when finite). |
| Customer-facing item read | `isUnlimitedStock: boolean` + `quantity: Int \| null` (null when unlimited) + `inStock: boolean` (server-computed) | Read from `Item.quantity`; the wire shape omits the `-1` sentinel. |
| Chef-facing item read | Same as customer + `isActive: boolean` | Read from `Item.quantity` and `Item.isActive`. |

The chef-side editor preserves the chef's last typed finite
quantity in client memory only (R4 / spec FR-008). The database
column does not retain a separate `lastFiniteQuantity` field
in v1.

### Validation rules (DTO-level)

| Rule | Source | Where validated |
|---|---|---|
| `name.en` / `name.ar` ≤ 60 chars after trim, both required | FR-007 (spec /clarify Q2) | `@ValidateNested()` + `BilingualText` validator (60-char cap). |
| `description.en` / `description.ar` ≤ 500 chars after trim, both required | FR-007 (spec /clarify Q2) | `@ValidateNested()` + `BilingualText` validator (500-char cap). |
| `price` > 0, ≤ 2 decimal places | FR-007 / FR-010 | `@IsPositive()` + `@IsNumber({ maxDecimalPlaces: 2 })`. |
| `discountValue` >= 0, ≤ 2 decimal places | FR-007 | `@IsNumber({ maxDecimalPlaces: 2 })` + `@Min(0)`. |
| `discountUnit` ∈ {`fixed`, `percent`} | FR-007 | `@IsEnum(DiscountUnit)`. |
| `effectivePrice(price, discountValue, discountUnit)` >= 0 | FR-010 | Service-layer `assertNonNegativeEffectivePrice(dto)` (above). |
| `isUnlimitedStock` boolean; `quantity` integer ≥ 0 when isUnlimitedStock=false; `quantity` MUST be absent when isUnlimitedStock=true | FR-008 (spec /clarify Q1) | Custom `StockInputDto` validator (refuses ambiguous combinations). |
| `images` length ≤ 5 (validated at append time, not at create time) | FR-012 | Service-layer guard in `items.service.appendImage`. The create DTO does not accept `images` directly — the chef uploads images after item create via `POST /chef/items/:id/images`. |
| `isActive` boolean (defaults true at create; toggleable on update) | FR-011 | `@IsBoolean()` (optional on update). |
| Bulk reorder body `items: [{ id }]` is an exact cover of the menu's current non-soft-deleted items | FR-009a | DTO `@ArrayMinSize(1)` + `@ArrayUnique('id')`; service-layer exact-set check inside the transaction (R5). |
| Image upload: mime-type ∈ {`image/jpeg`, `image/png`, `image/webp`}; size ≤ 3 MB | FR-012 | `FileInterceptor({ limits: { fileSize: 3 * 1024 * 1024 } })` for size; mime-type whitelist enforced in `items.service.appendImage`. |
| Image upload: per-chef throttle 20 / 60 s | FR-012b | `@Throttle({ default: { limit: 20, ttl: 60_000 } })` per-route override (R3). |
| Request body MUST NOT carry server-owned fields | FR-031 | `whitelist: true, forbidNonWhitelisted: true` (Phase 0 default). |

### Indexes consumed

| Index | Source | Phase 4 query that uses it |
|---|---|---|
| Primary key on `id` | implicit | Single-row fetch / update / soft-delete. |
| `items_menuid_idx` | Phase 0 `@@index([menuId])` | Existing index — overlaps with the new composites below for queries that filter on `menu_id` alone. |
| `items_menu_id_is_active_deleted_at_idx` | **NEW (R1)** | Today-available chef-profile read's items include. |
| `items_menu_id_display_order_idx` | **NEW (R1)** | Chef-side item browse + bulk-reorder pre-check + customer-facing item sort. |

### Lifecycle in Phase 4

The state-machine diagram above captures the full lifecycle.

---

## MenuAvailability

### Fields used in Phase 4

| Field | Type | Phase 4 usage |
|---|---|---|
| `id` | UUID | Returned in availability-list responses (rare). Path param on `DELETE /chef/menus/:menuId/availability/:dayId` — but the controller resolves the row by `(menuId, dayOfWeek)` composite key (more stable) and accepts `:dayId` only as a convenience for clients that want the row's id; the DTO carries `dayOfWeek` in the body for the delete-by-day case. |
| `menuId` | UUID | Foreign key to the parent menu. Set at row create from the path param `/chef/menus/:menuId/availability`. NEVER client-supplied via the body. |
| `dayOfWeek` | Int | Integer in [0, 6]. 0 = Sunday. The `@@unique([menuId, dayOfWeek])` constraint Phase 0 declared guarantees idempotency on insert. |
| `createdAt` | DateTime | Auto. |

`MenuAvailability` is the only Phase 4 entity that does NOT
soft-delete — rows are hard-deleted by the chef-side "untick a
weekday" operation. There is no audit benefit to retaining
per-weekday history; the chef's intent is "this weekday is
no longer included", and the absence of the row IS the
representation.

### Idempotent insert pattern

```ts
await this.prismaService.menuAvailability.upsert({
  where: { menuId_dayOfWeek: { menuId, dayOfWeek } },
  create: { menuId, dayOfWeek },
  update: {}, // no-op
});
```

The `upsert` makes `POST /chef/menus/:menuId/availability` with
the same `dayOfWeek` value idempotent (FR-004) — a re-submit
is a no-op rather than a unique-constraint violation.

### Idempotent delete pattern

```ts
try {
  await this.prismaService.menuAvailability.delete({
    where: { menuId_dayOfWeek: { menuId, dayOfWeek } },
  });
} catch (e) {
  if (isPrismaP2025(e)) {
    // Row didn't exist — idempotent no-op per FR-004.
    return;
  }
  throw e;
}
```

### Indexes consumed

| Index | Source | Phase 4 query that uses it |
|---|---|---|
| `@@unique([menuId, dayOfWeek])` | Phase 0 | Upsert / delete by composite key. |

---

## Chef (read-only in Phase 4)

### Fields read in Phase 4

| Field | Type | Phase 4 usage |
|---|---|---|
| `id` | UUID | Returned in the customer-facing chef profile (Phase 3 owns the profile header; Phase 4 grafts the menu region). Read by every menu / item mutation for the ownership re-derivation. |
| `userId` | UUID | Read by `chefs.service.findOwnedOrThrow(userId)` to map JWT sub to a chef row. |
| `isVerified` | Boolean | Filter on the chef-profile read (Phase 3 contract: unverified chefs return 404). Phase 4 inherits this. |
| `isOpen` | Boolean | Read by the Home open-chefs scroll (`chefs.service.findManyForDiscovery({ isOpen: true })`). |
| `ratings` | Decimal(3, 2) | Read by the Home top-rated grid's sort. Until Phase 7 ships review writes, every chef's rating is `0` and the top-rated sort collapses to the verified-newest-first tiebreaker — the grid renders without an error (plan.md). |
| `verifiedAt` | DateTime? | Read by the Home top-rated grid as the secondary sort key. Set by Phase 3 verification (R3 of Phase 3). |
| `deletedAt` | DateTime? | Filtered by `prismaService.extended.chef.*` automatically — soft-deleted chefs are hidden from Phase 4 reads. |

No Phase 4 surface mutates `Chef`. Cross-module access goes
exclusively through `chefs.service` methods (Constitution III).

### New `chefs.service` method exposed for Phase 4

```ts
/**
 * Top-rated grid query for the Home surface (FR-022).
 * Sorts by (ratings DESC, verifiedAt DESC, id ASC) so the
 * tiebreaker is deterministic and consistent with Phase 3's
 * verified-newest secondary sort (FR-016 of Phase 3).
 */
async findTopRated(limit: number = 12): Promise<ChefCardDto[]> {
  return this.prismaService.extended.chef.findMany({
    where: { isVerified: true },
    orderBy: [
      { ratings: 'desc' },
      { verifiedAt: 'desc' },
      { id: 'asc' },
    ],
    take: limit,
  });
}
```

The existing Phase 3 `findManyForDiscovery(params)` is unchanged.
The Home open-chefs scroll calls it with `{ isOpen: true }` and
the default page size.

---

## Category (read-only in Phase 4)

### New `categories.service` method exposed for Phase 4

```ts
/**
 * FR-003 guard for menu create / update — refuses a soft-deleted
 * or non-existent category reference with 400 CATEGORY_NOT_FOUND.
 */
async findOneActiveOrThrow(id: string): Promise<Category> {
  // The Phase 3 in-process category cache (R7 of Phase 3) is
  // consulted first; on miss the read falls through to
  // prismaService.extended.category.*.
  const cached = this.cache?.get(id);
  if (cached) return cached;
  const row = await this.prismaService.extended.category.findUnique({
    where: { id },
  });
  if (!row) throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND' });
  return row;
}
```

Phase 4 does not mutate `Category`. Cross-module access goes
exclusively through `categories.service` methods (Constitution III).

---

## Today-available chef-profile read (the FR-017 query)

The Phase 4 chef-profile menu-region read sits on top of Phase 3's
chef-profile header (which returns the chef's name, banner, logo,
bio, rating, open/closed state, category chips). Phase 4 returns
the menu sections + their items as an additional payload on the
same `GET /chefs/:id` response.

**Implementation home**: `chefs.service.findFullProfile(chefId)` is
the public-profile read that Phase 3 shipped. Phase 4 extends it
to additionally call `menus.service.findTodayAvailableForChef(chefId)`
and merge the result into the response payload. The cross-module
call goes through the injected `MenusService` interface
(Constitution III).

```ts
// Phase 3 shape (chef header), extended in Phase 4:
async findFullProfile(chefId: string): Promise<ChefPublicProfileDto> {
  const header = await this.findOnePublic(chefId);          // Phase 3
  if (!header) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
  const menus = await this.menusService                     // NEW in Phase 4
    .findTodayAvailableForChef(chefId);
  return {
    ...header,
    menus: menus.map(toMenuSectionDto),                     // see "menus.service.findTodayAvailableForChef"
  };
}
```

**`menus.service.findTodayAvailableForChef`** shape (R2):

```ts
async findTodayAvailableForChef(chefId: string): Promise<MenuWithActiveItems[]> {
  const today = todaysCairoWeekday(); // R2

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
}
```

The mapper `toMenuSectionDto(menu)` computes `effectivePrice(item)`
for every item, derives `inStock` and `isUnlimitedStock` per the
R4 wire-shape rules, and trims the response to the customer-
facing fields (omitting `chefId`, `categoryId` is kept,
omitting `Item.lastFiniteQuantity`, `Item.isActive`).

**One Prisma query for the menus + items section.** Constitution
Principle IV: clean (no `$queryRaw`).

---

## Bulk-reorder transactions (the FR-002a / FR-009a queries)

```ts
async reorderMenus(chefId: string, orderedMenuIds: string[]): Promise<void> {
  return this.prismaService.$transaction(async (tx) => {
    const currentRows = await tx.menu.findMany({
      where: { chefId, deletedAt: null },
      select: { id: true },
    });
    assertExactSet(
      currentRows.map(r => r.id),
      orderedMenuIds,
      'MENUS_REORDER_NOT_EXACT_SET',
    );
    for (let i = 0; i < orderedMenuIds.length; i++) {
      await tx.menu.update({
        where: { id: orderedMenuIds[i] },
        data: { displayOrder: i },
      });
    }
  });
}

async reorderItems(menuId: string, chefId: string, orderedItemIds: string[]): Promise<void> {
  return this.prismaService.$transaction(async (tx) => {
    // Ownership re-derivation: the menu must belong to the chef.
    const menu = await tx.menu.findFirst({
      where: { id: menuId, chefId, deletedAt: null },
      select: { id: true },
    });
    if (!menu) throw new NotFoundException({ code: 'MENU_NOT_FOUND' });

    const currentRows = await tx.item.findMany({
      where: { menuId, deletedAt: null },
      select: { id: true },
    });
    assertExactSet(
      currentRows.map(r => r.id),
      orderedItemIds,
      'ITEMS_REORDER_NOT_EXACT_SET',
    );
    for (let i = 0; i < orderedItemIds.length; i++) {
      await tx.item.update({
        where: { id: orderedItemIds[i] },
        data: { displayOrder: i },
      });
    }
  });
}

function assertExactSet(current: string[], submitted: string[], errorCode: string): void {
  const currentSet = new Set(current);
  const submittedSet = new Set(submitted);
  if (
    currentSet.size !== submittedSet.size ||
    submitted.length !== submittedSet.size /* dup check */ ||
    [...submittedSet].some(id => !currentSet.has(id))
  ) {
    throw new BadRequestException({ code: errorCode });
  }
}
```

Both reorder operations are atomic. A partial reorder never
becomes observable. The exact-set guard catches missing IDs,
unknown IDs, and duplicates.

---

## Image-array mutation (the FR-012 / FR-012a queries)

See R6 for the full code shape. Summary:

- **Append**: read item → 5-cap guard → `storage.upload(...)` →
  `update({ data: { images: { set: [...item.images, newUrl] } } })`.
- **Remove**: read item → match URL by suffix object key → if no
  match, return idempotently → otherwise `update({ data: { images:
  { set: filtered } } })` → best-effort `storage.delete(...)`.

Both operations are atomic at the row level. Storage-layer
cleanup on remove is best-effort (mirrors Phase 3 chef-logo /
banner replacement).

---

## Home surface composition

The `home.service.findHomeForUser(userId)` composer:

```ts
async findHomeForUser(userId: string): Promise<HomeDto> {
  const user = await this.usersService.findOneOrThrow(userId);
  const [openChefs, categories, topRated] = await Promise.all([
    this.chefsService.findManyForDiscovery({ isOpen: true, pageSize: 20 }),
    this.categoriesService.listActive(),
    this.chefsService.findTopRated(12),
  ]);
  return {
    greeting: { userFirstName: user.firstName },     // client renders the
                                                     //   bilingual greeting
                                                     //   string locally
    openChefs,
    categories,
    topRated,
  };
}
```

No direct Prisma reads in `home.service`. Constitution Principle
III: clean.

---

## Ownership and isolation matrix

| Verb | Path | Auth role | Owner check | Soft-delete read filter |
|---|---|---|---|---|
| `GET /chef/menus` | chef-side menu browse | chef | `findOwnedOrThrow(userId)` resolves the chef row from JWT sub | extended.menu.* |
| `POST /chef/menus` | chef create menu | chef | `findOwnedOrThrow(userId)`; menu's `chefId` derived from chef row | extended.menu.* |
| `PATCH /chef/menus/:id` | chef edit menu | chef | `findOwnedOrThrow(userId)` + `menu.chefId === chef.id` | extended.menu.* |
| `DELETE /chef/menus/:id` | chef soft-delete menu | chef | same | extended.menu.* (read); `softDelete` (write) |
| `PATCH /chef/menus/reorder` | chef bulk-reorder menus | chef | `findOwnedOrThrow(userId)` + exact-set check inside transaction | extended.menu.* (within transaction) |
| `POST /chef/menus/:id/availability` | chef add weekday | chef | `findOwnedOrThrow(userId)` + menu ownership | extended.menu.* (read parent menu) |
| `DELETE /chef/menus/:id/availability/:dayId` | chef remove weekday | chef | same | extended.menu.* (read parent menu); hard-delete the availability row by composite key |
| `GET /chef/menus/:menuId/items` | chef-side item browse | chef | menu ownership via menu chefId | extended.item.* (NOT filtered by isActive — chef sees all) |
| `POST /chef/menus/:menuId/items` | chef create item | chef | menu ownership | extended.item.* |
| `PATCH /chef/items/:id` | chef edit item | chef | item → menu → chefId chain | extended.item.* |
| `DELETE /chef/items/:id` | chef soft-delete item | chef | same | extended.item.* (read); `softDelete` (write) |
| `PATCH /chef/menus/:menuId/items/reorder` | chef bulk-reorder items | chef | menu ownership + exact-set in transaction | extended.item.* (within transaction) |
| `POST /chef/items/:id/images` | chef append image (throttled) | chef | item → menu → chefId chain | extended.item.* (read); `data: { images: { set: ... } }` (write); 5-cap guard; throttle key = chef.id |
| `DELETE /chef/items/:id/images/:imageKey` | chef remove image | chef | same | same |
| `GET /chefs/:id` | customer chef profile (header + menus + items) | authenticated | n/a (public read; FR-020 refuses unverified / soft-deleted with 404) | extended.chef.* + extended.menu.* + extended.item.* (filtered by isActive) |
| `GET /home` | customer Home surface | authenticated | n/a | extended.chef.* + extended.category.* |

The chef-self ownership check uses the same single-find pattern
Phase 2 R4 / Phase 3 chef-self mutations established:
re-derive the owner from the JWT sub claim; return 404 if the
target's owner differs (no identifier-disclosure leak between
chefs; FR-026 / SC-014).

---

## Observability shape

The Phase 4 menu-event and item-event log lines follow the
Phase 1 / 2 / 3 envelope (`event`, `outcome`, `timestamp`,
`sourceIp`, `actor.userId`, `actor.role`, `correlationId`,
`target`):

| Event | Outcome | Trigger |
|---|---|---|
| `menu.create` | `success` | POST /chef/menus 201. |
| `menu.create` | `validation_rejected` | POST /chef/menus 400 from the global pipe (length cap, missing field). |
| `menu.create` | `category_not_found` | POST /chef/menus 400 from the FR-003 guard. |
| `menu.update` | `success` / `validation_rejected` / `category_not_found` / `not_found` | PATCH /chef/menus/:id. |
| `menu.soft_delete` | `success` / `not_found` | DELETE /chef/menus/:id. |
| `menu.reorder` | `success` / `validation_rejected` / `reorder_not_exact_set` | PATCH /chef/menus/reorder. |
| `menu.availability_add` | `success` (idempotent) / `validation_rejected` / `not_found` | POST /chef/menus/:id/availability. |
| `menu.availability_remove` | `success` (idempotent) / `not_found` | DELETE /chef/menus/:id/availability/:dayId. |
| `item.create` | `success` | POST /chef/menus/:menuId/items 201. |
| `item.create` | `validation_rejected` / `negative_effective_price` / `not_found` (menu) | POST 400 / 400 / 404. |
| `item.update` | `success` / `validation_rejected` / `negative_effective_price` / `not_found` | PATCH /chef/items/:id. |
| `item.soft_delete` | `success` / `not_found` | DELETE /chef/items/:id. |
| `item.active_toggle` | `success` / `not_found` | PATCH /chef/items/:id with `isActive` in the body. (Same event as `item.update` if a single field is toggled; emitted as a distinct event when the body carries ONLY `isActive` so dashboards can isolate active-toggle frequency.) |
| `item.reorder` | `success` / `validation_rejected` / `reorder_not_exact_set` / `not_found` (menu) | PATCH /chef/menus/:menuId/items/reorder. |
| `item.image_upload` | `success` | POST /chef/items/:id/images 201. |
| `item.image_upload` | `unsupported_media_type` / `payload_too_large` / `images_full` / `not_found` / `rate_limited` | POST 415 / 413 / 400 / 404 / 429. The `rate_limited` outcome maps to the FR-012b per-chef throttle refusal. |
| `item.image_remove` | `success` (including idempotent "already removed") / `not_found` | DELETE /chef/items/:id/images/:imageKey. |

Every log line carries: `event` (from the table), `outcome`
(from the table), `timestamp` (ISO 8601), `sourceIp`,
`actor.userId` (from JWT sub), `actor.role` (chef on every
chef-self event), `correlationId` (from
`correlation-id.middleware.ts` Phase 1), and a `target` reference
(`menuId` / `itemId` whichever applies). **Per FR-033, no
`latitude`, `longitude`, `coordinates`, or coordinate-derived
value ever appears in the line**, mirroring the Phase 2 / 3
contracts.

Validation rejections (`validation_rejected`), 404s (`not_found`),
role refusals (`role_refused`), and rate-limit refusals
(`rate_limited`) are emitted from
`HttpExceptionNormalizerFilter` — the same pattern Phase 1 used
for `auth.*` events. Service-layer success outcomes emit directly
from the service. Reorder-not-exact-set refusals
(`reorder_not_exact_set`) emit from the service (they're thrown
as `BadRequestException`s the filter catches, but the service
knows the outcome shape and logs it before throwing).

---

## Test fixtures

Phase 4 integration tests reuse Phase 1 / 2 / 3 fixtures and
add:

- `chefWithMenu(chef, { categoryId?, availableAllDays?, dayOfWeek?: number[] })`
  — calls the real `POST /chef/menus` to seed a menu owned by
  the given chef. Returns the created menu row. Used by every
  item + chef-profile test.
- `menuWithItem(menu, { name?, price?, discountValue?, discountUnit?, quantity?, isUnlimitedStock?, images?: string[] })`
  — calls the real `POST /chef/menus/:menuId/items` to seed an
  item under the given menu. Returns the created item row.
  Used by every chef-profile read test, the effective-price
  test, the image upload / remove tests.
- `pinCairoWeekday(weekday: number)` — patches the
  `todaysCairoWeekday()` helper for the duration of one test
  to return a fixed weekday. Used by
  `test/menus-availability.e2e-spec.ts` to exercise every
  Sun..Sat combination + the midnight Cairo boundary case.
- `imageFixture({ mimeType?, sizeBytes? })` — returns a
  multipart body buffer of the requested mime + size. Used by
  the upload tests (oversized, wrong-type, valid).
- `saturateUploadThrottle(chef, n)` — issues `n` valid uploads
  back-to-back. Returns the per-upload status codes. Used by
  `test/items-throttle.e2e-spec.ts` to assert SC-007b.

All fixtures are local to `test/`; no production code path
inserts a Menu or Item without going through the intended
Phase 4 chef-side endpoints.
