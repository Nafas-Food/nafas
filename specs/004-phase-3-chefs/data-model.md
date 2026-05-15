# Phase 3 Data Model: Categories, Chef Application & Verification

Phase 3 ships **one Prisma migration** that is additive only and
introduces **no new tables**. Behaviour is materialised on entities
the constitution already defines and the Foundation phase already
migrated:

- `Chef` — populated for the first time (Phase 0 created the table;
  Phase 3 creates / mutates rows). Two new fields: `rejectedAt`,
  `verifiedAt`.
- `Category` — populated for the first time (Phase 0 created the
  table; Phase 3 seeds it and ships its admin curation surface).
- `User` — role transitions ride through `users.service.setRole`
  (R6). No new fields.
- `Notification` — created on every chef application state
  transition. One new enum value: `chef_revoked`.
- `Menu` — read (never written) by `chefs.service` for FR-014
  category-filter membership. Phase 4 owns writes.

The canonical schema lives at `backend/prisma/schema.prisma`; this
document is the human-readable usage map for Phase 3.

---

## The `0003_chef_rejection_state` migration (additive only)

```sql
-- Phase 3 schema additions (one migration, no destructive changes)

ALTER TABLE "chefs"
  ADD COLUMN "rejected_at" timestamp(3),
  ADD COLUMN "verified_at" timestamp(3);

CREATE INDEX "chefs_is_verified_latitude_longitude_idx"
  ON "chefs" ("is_verified", "latitude", "longitude");

ALTER TYPE "NotificationType"
  ADD VALUE 'chef_revoked';
```

Three changes only:

1. **`chefs.rejected_at`** — cooldown source-of-truth for FR-006
   rejections (R1, R4).
2. **`chefs.verified_at`** — secondary-sort source-of-truth for the
   FR-016 "verified-newest-first" rule. Captured at the moment
   `admin.service.verifyApplication` flips `isVerified` to true
   (R3). Existing rows have this column NULL because no chef has
   been verified yet before Phase 3.
3. **`chefs_is_verified_latitude_longitude_idx`** — composite
   index that the bounding-box discovery query consumes (R2).
4. **`NotificationType.chef_revoked`** — distinct event type for
   the new admin revocation flow (R1, FR-012a).

No existing column changes type or nullability. No data
migration is required.

---

## Conventions inherited from Phase 0 / Phase 1 / Phase 2

- **ID columns**: `Chef.id`, `Category.id`, `Notification.id`,
  `User.id`, `Menu.id` are all
  `@db.Uuid @default(dbgenerated("gen_random_uuid()"))`.
- **Timestamps**: All Phase 3 entities carry `createdAt`,
  `updatedAt`, and (for soft-delete entities) `deletedAt`.
- **Reads on soft-delete entities**: `prismaService.extended.<model>.*`
  is the default — soft-deleted rows are filtered automatically.
  **Phase 3 exception**: the cooldown gate in
  `chef-application.service.assertEligibleToApply` reads the bare
  `prismaService.chef.findFirst({ where: { userId } })` because the
  gate explicitly needs to see rejected (`rejectedAt != NULL`) and
  revoked (`deletedAt != NULL`) rows that the extension hides. This
  deviation is named at the call site with a comment.
- **Writes on soft-delete entities**:
  - Soft-delete: `prismaService.chef.softDelete({ id })` /
    `prismaService.category.softDelete({ id })`.
    The extension takes the where-clause directly (not wrapped in
    another `{ where: ... }`), per Phase 0 conventions.
  - Hard `prisma.chef.delete(...)` / `prisma.category.delete(...)`
    are blocked at CI by the Phase 0 grep gate
    (`backend/scripts/ci-no-hard-delete.sh`).

---

## Chef

### State machine (built on existing schema + `rejected_at`)

```text
            ┌──────────────────────┐
[no row] ── │ POST /chef/apply     │ ──→ Pending (Chef.isVerified=false,
            └──────────────────────┘            rejectedAt=NULL, deletedAt=NULL)

Pending  ──┬── PATCH /admin/chefs/:id/verify   ──→ Verified
           │      (atomically: Chef.isVerified=true,
           │       Chef.verifiedAt=now,
           │       User.role=chef,
           │       Notification[chef_verified])
           │
           ├── PATCH /admin/chefs/:id/reject   ──→ Rejected
                  (atomically: Chef.rejectedAt=now,
                   Notification[chef_rejected])

Verified ── DELETE /admin/chefs/:id           ──→ Revoked
              (atomically: Chef.softDelete (deletedAt=now),
               User.role=customer,
               Notification[chef_revoked])

Rejected / Revoked
         ── POST /chef/apply (≥ 24h after rejectedAt / deletedAt)
                                              ──→ Pending (Chef row updated
                                                  in place: rejectedAt=NULL,
                                                  deletedAt=NULL, isVerified=false,
                                                  application fields replaced)
```

### Fields used in Phase 3

| Field | Type | Phase 3 usage |
|---|---|---|
| `id` | UUID | Returned in every chef response. Path param on chef-self mutations and admin mutations. |
| `userId` | UUID | Set at apply from `req.user.sub` (server-authoritative). Carries the @unique constraint that keeps the 1:1 User ↔ Chef relation. |
| `chefName` | String | Public chef name. Required at apply, editable post-verification. 1–80 chars after trim. |
| `bio` | String? | Public chef bio. Required at apply (FR-002), editable post-verification. 1–1000 chars after trim. |
| `latitude` | Decimal(10, 7) | Kitchen latitude. Set from the map picker (R5). Coordinate redaction (FR-039) hides this from every observability surface. |
| `longitude` | Decimal(10, 7) | Kitchen longitude. Same redaction discipline. |
| `isVerified` | Boolean | `false` while pending or rejected; `true` after admin verification. |
| `isOpen` | Boolean | Chef-controlled flag (FR-020). `false` at chef creation; chef toggles via PATCH /chef/availability. |
| `ratings` | Decimal(3, 2) | Default `0`. Phase 3 reads it in the public profile response (always `0` until Phase 7 starts writing). |
| `totalReviews` | Int | Default `0`. Same — Phase 3 reads, Phase 7 writes. |
| `minOrderPrice` | Decimal(10, 2) | Set at apply, editable post-verification. Positive value (validated at the DTO layer). |
| `logo` | String | URL into `chef-logos` bucket. Default placeholder URL (FR-023) set at chef creation; replaced by `POST /chef/logo`. |
| `banner` | String | Same pattern, against `chef-banners` bucket. |
| `verifiedAt` | DateTime? | **NEW (R1)**. Set the moment admin verification commits. Secondary-sort source for FR-016. |
| `rejectedAt` | DateTime? | **NEW (R1)**. Set the moment admin rejection commits. Cooldown source for FR-006 / FR-012b. Cleared when the customer re-applies (R4). |
| `createdAt` | DateTime | Auto. |
| `updatedAt` | DateTime | Auto. |
| `deletedAt` | DateTime? | Soft-delete marker. Set by `softDelete` only — on admin revocation (FR-012a). Cleared when the customer re-applies after revocation (R4). |

### Relations exercised in Phase 3

| Relation | Direction | Phase 3 usage |
|---|---|---|
| `User` | `userId → users.id` | Set at apply from JWT sub. Read on public profile (the chef's role is the user's role). Mutated by `users.service.setRole` (R6) inside the verify / revoke transaction (R3). |
| `Menu[]` | `menus.chefId → chefs.id` | Read **only** by `menus.service.hasMenuInCategory(chefId, categoryId)` (FR-014 filter) and `menus.service.categoriesForChef(chefId)` (chef profile category-chip render). `chefs.service` never reads `prisma.menu` directly per Constitution Principle III. |
| `Order[]` | `orders.chefId → chefs.id` | NOT read in Phase 3. Phase 6 reads this for the chef's order list. |
| `UserReview[]` | `user_reviews.chefId → chefs.id` | Public profile reads `chef.ratings` and `chef.totalReviews` (denormalised columns) — does NOT join into UserReview. Phase 7 ships the join + recompute. |
| `Favorite[]` | `favorites.chefId → chefs.id` | NOT read in Phase 3. Phase 7 reads this. |

### Validation rules (DTO-level)

| Rule | Source | Where validated |
|---|---|---|
| `chefName` 1–80 chars after trim, non-empty | FR-002 | `@IsString()` + `@Length(1, 80)` + `@Transform(trim)` on `ApplyChefDto.chefName` and `UpdateChefProfileDto.chefName`. |
| `bio` 1–1000 chars after trim, non-empty | FR-002 | `@IsString()` + `@Length(1, 1000)` + `@Transform(trim)` on `ApplyChefDto.bio` and `UpdateChefProfileDto.bio`. (The 1000-char ceiling is the "industry-standard free-text limit" the spec deferred — picked here because it covers any reasonable chef intro and bounds the discovery search-substring scan.) |
| `latitude` ∈ [-90, 90] | FR-001 | `@IsLatitude()` from `class-validator`. |
| `longitude` ∈ [-180, 180] | FR-001 | `@IsLongitude()` from `class-validator`. |
| `minOrderPrice` positive Decimal | FR-002 | `@IsPositive()` + `@IsNumber({ maxDecimalPlaces: 2 })` on the DTO; converted via `class-transformer` to a `decimal.js` value before the service hands it to Prisma. |
| `reason` 1–1000 chars (admin reject / revoke) | FR-010 / FR-012a | `@IsString()` + `@Length(1, 1000)` on `RejectApplicationDto.reason` and `RevokeChefDto.reason`. |
| Apply / profile request body MUST NOT carry server-owned fields | FR-037 + Phase 0 global pipe | `whitelist: true, forbidNonWhitelisted: true` rejects any DTO field not declared (`id`, `userId`, `isVerified`, `verifiedAt`, `rejectedAt`, `deletedAt`, `ratings`, `totalReviews`, `logo`, `banner` — these all live server-side). |

### Indexes consumed

| Index | Source | Phase 3 query that uses it |
|---|---|---|
| Primary key on `id` | implicit | Single-row fetch / update / soft-delete. |
| `userId` (unique) | `@unique` declared in schema | Cooldown gate `findFirst({ where: { userId } })`; verify / reject / revoke all key on this through the joined `User` row. |
| `(is_verified, latitude, longitude)` (composite) | NEW (R2) | Bounding-box discovery `findMany`. |

### Lifecycle in Phase 3

The state-machine diagram above captures the full lifecycle. Every
transition is a `prisma.$transaction` invocation; the cooldown
gate is a `findFirst` outside any transaction (it's a pure
read).

---

## Category

### Fields used in Phase 3

| Field | Type | Phase 3 usage |
|---|---|---|
| `id` | UUID | Returned in every category response. Path param on admin mutations. |
| `name` | Json | Bilingual display name as `{ en: string, ar: string }`. Validated to require both keys, each 1–80 chars. |
| `icon` | String? | Feather glyph name (e.g., `coffee`, `pie-chart`). Validated as 1–40 chars when present; nullable. |
| `displayOrder` | Int | Sort key on the customer-facing list. Mutated by `PATCH /admin/categories/reorder` (FR-027). |
| `isActive` | Boolean | Defaults `true`. Soft-delete is the canonical "remove from customer list" path; `isActive=false` is reserved for a future use case (e.g., "draft category" — out of scope for v1, schema slot retained). |
| `createdAt` / `updatedAt` / `deletedAt` | Timestamp | Standard timestamps including soft-delete marker. |

### Relations exercised in Phase 3

| Relation | Direction | Phase 3 usage |
|---|---|---|
| `Menu[]` | `menus.category_id → categories.id` | Read by `menus.service.hasMenuInCategory` (FR-014 filter). |

### Seed data (Phase 3)

`prisma/seed.ts` populates eight categories on first deployment.
The seed is idempotent — UUIDs are pre-generated constants in the
seed module, and the upsert keys on `id`. Re-running the seed is
a no-op.

| English name | Arabic name | Icon (Feather) | Display order |
|---|---|---|---|
| Koshary | كشري | bowl-food (or `coffee` fallback) | 0 |
| Mahshi | محشي | leaf | 1 |
| Molokheya | ملوخية | feather | 2 |
| Hawawshi | حواوشي | pie-chart | 3 |
| Sweets | حلويات | cake | 4 |
| Feteer | فطير | square | 5 |
| Fattah | فتة | layers | 6 |
| Other | أخرى | more-horizontal | 7 |

The exact icon glyph names will be picked from the
`@expo/vector-icons` Feather set during implementation; the seed
file is the source of truth for the names actually shipped. The
seed comment block links each row to its corresponding row in the
spec FR-025 list.

### Validation rules (DTO-level)

| Rule | Source | Where validated |
|---|---|---|
| `name.en` / `name.ar` 1–80 chars after trim, both required | FR-025 / FR-026 | `@ValidateNested()` + custom `class-validator` decorator on `CreateCategoryDto.name`. |
| `displayOrder` non-negative integer | FR-027 | `@IsInt()` + `@Min(0)` on `CreateCategoryDto.displayOrder` and on each `ReorderCategoriesDto.items[].displayOrder`. |
| `icon` 1–40 chars when present, nullable | implementation default | `@IsOptional()` + `@IsString()` + `@Length(1, 40)`. |
| Bulk reorder body `items: [{ id, displayOrder }, ...]` MUST be non-empty and MUST list each affected category exactly once | FR-027 + SC-014 | `@ArrayMinSize(1)` + custom `class-validator` `@ArrayUnique('id')` decorator on `ReorderCategoriesDto.items`. |

### Indexes consumed

| Index | Source | Phase 3 query that uses it |
|---|---|---|
| Primary key on `id` | implicit | Single-row update / soft-delete. |
| `displayOrder` (existing) | `@@index([displayOrder])` declared in schema | Customer list `findMany({ orderBy: { displayOrder: asc } })`. |

### Lifecycle in Phase 3

```text
[seed]   ──→ Category { isActive=true, deletedAt=null, displayOrder=0..7 }
         ──→ admin PATCH /admin/categories/reorder
                   (one $transaction over all referenced rows; atomic)
         ──→ admin PATCH /admin/categories/:id (rename / icon change)
         ──→ admin POST /admin/categories (insert new row)
         ──→ admin DELETE /admin/categories/:id (softDelete)
```

The 60-second in-process cache (R7) sits in front of every read
and is invalidated on each of the four mutation paths.

---

## User (role transitions only)

### Fields used in Phase 3

| Field | Type | Phase 3 usage |
|---|---|---|
| `id` | UUID | `Chef.userId` foreign key target. Read by `users.service.setRole`. |
| `role` | enum `Role` | Mutated by `users.service.setRole(userId, nextRole)` (R6) inside the verify / revoke transaction (R3). Phase 3 transitions: `customer → chef` (verify), `chef → customer` (revoke). The `admin` and `driver` values are untouched. |
| `fcmToken` | String? | Read by `notifications.service` for the FCM push dispatch after each verify / reject / revoke commit. |

### Validation rules

None added in Phase 3 — `setRole` only accepts the enum's existing
values and is callable only from within the same monolith (no
public DTO).

### Lifecycle in Phase 3

```text
User.role = customer ── verifyApplication ──→ User.role = chef
                                                   │
                                                   ▼
                                            revokeChef
                                                   │
                                                   ▼
User.role = customer ←──────────────────────────────┘
```

Both transitions happen inside a single `prisma.$transaction`
that also writes the corresponding `Chef` and `Notification`
changes (R3).

---

## Notification (write side only — read side is Phase 8)

### Fields written in Phase 3

| Field | Type | Phase 3 usage |
|---|---|---|
| `userId` | UUID | The user being notified (the applicant). |
| `type` | enum `NotificationType` | `chef_verified` (FR-009), `chef_rejected` (FR-010), or `chef_revoked` (FR-012a — new enum value per R1). |
| `title` | Json | `{ en: string, ar: string }` per Constitution Principle I. |
| `body` | Json | `{ en: string, ar: string }`. For rejection / revocation, the body includes the admin-typed reason in BOTH locales (the admin types one reason; Phase 3 echoes it verbatim into both `en` and `body.ar` fields — Phase 3 does not translate). |
| `data` | Json? | Carries `{ chefId }` for verifications; `{ chefId, reason }` for rejections / revocations. Used by mobile push-tap deep-link routing in Phase 8. |
| `readAt` | DateTime? | Defaults NULL. Phase 8 mutates this. Phase 3 only writes the row. |

### Lifecycle in Phase 3

Phase 3 only inserts. No update, no delete. The read paths are
all owned by Phase 8 (notification centre). Phase 3 reads
`User.fcmToken` from inside `notifications.service` to dispatch
the push but never reads existing Notification rows.

### Indexes consumed

The Phase 0 schema declares `@@index([userId, readAt])` on
`Notification` — Phase 3 doesn't read but the writes don't
require it either; the index exists for Phase 8's unread-count
read.

---

## Menu (read-only shell, FR-014 filter only)

### Fields read in Phase 3

| Field | Type | Phase 3 usage |
|---|---|---|
| `id` | UUID | Selected via `select: { id: true }` to make the FR-014 filter an existence check, not a row materialisation. |
| `chefId` | UUID | Filter target (the chef whose category membership we're checking). |
| `categoryId` | UUID | Filter target. |
| `isActive` | Boolean | Filter — `true`. (Inactive menus do not count toward category membership; this matches the spec FR-014 wording "at least one of their (active, non-soft-deleted) menus".) |
| `deletedAt` | DateTime? | Filter — `null`. Comes automatically through `prismaService.extended.menu.*`. |

### Phase 3 query shape (`menus.service.hasMenuInCategory`)

```ts
async hasMenuInCategory(chefId: string, categoryId: string): Promise<boolean> {
  const found = await this.prismaService.extended.menu.findFirst({
    where: { chefId, categoryId, isActive: true },
    select: { id: true },
  });
  return found !== null;
}
```

And `menus.service.categoriesForChef(chefId)`:

```ts
async categoriesForChef(chefId: string): Promise<string[]> {
  const rows = await this.prismaService.extended.menu.findMany({
    where: { chefId, isActive: true },
    select: { categoryId: true },
    distinct: ['categoryId'],
  });
  return rows.map(r => r.categoryId);
}
```

Both methods are the **only** code in Phase 3 that reads `Menu`.
Every other module routes through these methods.

### Indexes consumed

| Index | Source | Phase 3 query that uses it |
|---|---|---|
| `menus.chefId` | `@@index([chefId])` declared in schema | Both shell methods. |

---

## Discovery query (chefs.service.findManyForDiscovery)

The Phase 3 discovery query is the most behaviourally complex read
in this phase. Its full shape (R2):

```ts
async findManyForDiscovery(params: DiscoveryQueryDto): Promise<ChefResponseDto[]> {
  // 1. Build the where clause
  const where: Prisma.ChefWhereInput = {
    isVerified: true,
    // deletedAt: null is added by the extended client automatically
  };

  // 2. Apply the category filter (FR-014) via the menus shell
  let chefIdSubset: string[] | undefined;
  if (params.categoryId) {
    const menus = await this.prismaService.extended.menu.findMany({
      where: { categoryId: params.categoryId, isActive: true },
      select: { chefId: true },
      distinct: ['chefId'],
    });
    chefIdSubset = menus.map(m => m.chefId);
    if (chefIdSubset.length === 0) return [];
    where.id = { in: chefIdSubset };
  }

  // 3. Apply the text search (FR-015) — case-insensitive contains on chefName or bio
  if (params.q && params.q.trim().length > 0) {
    where.OR = [
      { chefName: { contains: params.q, mode: 'insensitive' } },
      { bio:      { contains: params.q, mode: 'insensitive' } },
    ];
  }

  // 4. Apply the geographic bounding box (FR-016) when coordinates are known
  let effectiveRadiusKm: number | null = null;
  if (params.lat !== undefined && params.lng !== undefined) {
    effectiveRadiusKm = Math.min(params.radiusKm ?? 15, 50);    // default 15, cap 50
    const latOffset = effectiveRadiusKm / 111;
    const lngOffset = effectiveRadiusKm / (111 * Math.cos((params.lat * Math.PI) / 180));
    where.latitude  = { gte: params.lat - latOffset, lte: params.lat + latOffset };
    where.longitude = { gte: params.lng - lngOffset, lte: params.lng + lngOffset };
  }

  // 5. Fetch the candidate set
  const candidates = await this.prismaService.extended.chef.findMany({
    where,
    orderBy:
      // When no radius applies, use the FR-016 secondary sort
      effectiveRadiusKm === null
        ? [{ isOpen: 'desc' }, { verifiedAt: 'desc' }]
        : undefined,            // will sort by exact distance below
    take: params.pageSize ?? 30,
    skip: params.cursor ?? 0,
  });

  // 6. When the radius applies, compute exact Haversine, filter + sort
  if (effectiveRadiusKm !== null) {
    return candidates
      .map(c => ({ ...c, distanceKm: haversine(params.lat, params.lng, c.latitude, c.longitude) }))
      .filter(c => c.distanceKm <= effectiveRadiusKm)
      .sort((a, b) => {
        // open-first per FR-013, then by distance asc
        if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
        return a.distanceKm - b.distanceKm;
      });
  }

  return candidates;
}
```

This shape:

- Issues **at most two** Prisma queries (one for the optional
  category-filter chef-id subset; one for the chef list itself).
- Uses indexes the schema already declares plus the new
  `(is_verified, latitude, longitude)` index from the migration.
- Never invokes `$queryRaw`. Constitution Principle IV: clean.
- Bounds the in-JS Haversine sort to ≤ `pageSize` rows (typically
  20–30) by leveraging Prisma's `take` on the bounded candidate
  set.
- Surfaces `distanceKm` on the response so the mobile client can
  render "1.2 km away" labels per the design-system chef-card
  mockup.

---

## Cooldown gate (chef-application.service.assertEligibleToApply)

```ts
async assertEligibleToApply(userId: string): Promise<void> {
  // Bare client deliberately — see the Phase 3 R4 exception note.
  const existing = await this.prismaService.chef.findFirst({
    where: { userId },
  });

  if (!existing) return; // no prior application — eligible

  if (existing.isVerified && !existing.deletedAt) {
    throw new ConflictException({ code: 'ALREADY_CHEF', chefId: existing.id });
  }
  if (!existing.isVerified && !existing.rejectedAt && !existing.deletedAt) {
    throw new ConflictException({ code: 'APPLICATION_PENDING', applicationId: existing.id });
  }

  // Cooldown check: 24h from the most recent rejection / revocation
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const blockerTimestamp = existing.deletedAt ?? existing.rejectedAt;
  if (blockerTimestamp && blockerTimestamp > cutoff) {
    const earliestResubmitAt = new Date(blockerTimestamp.getTime() + 24 * 60 * 60 * 1000);
    throw new ConflictException({
      code: 'APPLICATION_COOLDOWN_IN_EFFECT',
      earliestResubmitAt: earliestResubmitAt.toISOString(),
    });
  }

  // Eligible: rejected / revoked + cooldown elapsed
}
```

This is the only Phase 3 code path that reads the bare Prisma
client on a soft-delete entity. The R4 / Phase 3 exception is
deliberate and named at the call site.

---

## Ownership and isolation matrix

| Verb | Path | Auth role | Owner check | Soft-delete read filter |
|---|---|---|---|---|
| `GET /chefs` | discovery list | authenticated | n/a (public read) | extended.chef.* |
| `GET /chefs/:id` | public profile | authenticated | n/a | extended.chef.* |
| `GET /chefs/:id/reviews` | public reviews | authenticated | n/a | extended.userReview.* (Phase 7 wires this) |
| `POST /chef/apply` | apply | customer | derives `userId` from JWT sub; cooldown gate uses bare client (R4) | bare client (cooldown gate); `extended.chef.*` afterwards |
| `PATCH /chef/profile` | chef self | chef | `findFirst({ id, userId: sub })` — 404 if owned by another | extended.chef.* |
| `PATCH /chef/availability` | chef self | chef | same | extended.chef.* |
| `POST /chef/logo`, `POST /chef/banner` | chef self | chef | same | extended.chef.* |
| `GET /categories` | public read | authenticated | n/a | extended.category.* |
| `POST/PATCH/DELETE /admin/categories[/:id]` | admin curate | admin | n/a | extended.category.* (read), softDelete (write) |
| `PATCH /admin/categories/reorder` | admin reorder | admin | n/a | `prisma.$transaction` over per-row updates |
| `GET /admin/chefs/pending` | admin queue | admin | n/a | extended.chef.* filtered to pending |
| `GET /admin/chefs` | admin list of verified | admin | n/a | extended.chef.* filtered to verified |
| `PATCH /admin/chefs/:id/verify` | admin verify | admin | n/a (admin role is the gate) | transaction (R3) |
| `PATCH /admin/chefs/:id/reject` | admin reject | admin | n/a | transaction (R3) |
| `DELETE /admin/chefs/:id` | admin revoke | admin | n/a | transaction with softDelete (R3) |

The chef-self ownership check on every chef-profile mutation
uses the same single-find pattern Phase 2 R4 established for
address mutations — re-derive the owner from the JWT sub claim,
return 404 if the row's `userId` differs (no identifier-
disclosure leak between accounts; FR-024 / SC-012).

---

## Observability shape

The Phase 3 chef-event and category-event log lines follow the
Phase 1 / Phase 2 envelope:

| Event | Outcome | Trigger |
|---|---|---|
| `chef.apply` | `success` | POST /chef/apply 201. |
| `chef.apply` | `validation_rejected` | POST /chef/apply 400 from the global pipe. |
| `chef.apply` | `application_pending` | POST /chef/apply 409 when a pending row exists (FR-004). |
| `chef.apply` | `already_chef` | POST /chef/apply 409 when caller is already verified (FR-005). |
| `chef.apply` | `rejected_cooldown_in_effect` | POST /chef/apply 409 during the 24-h cooldown (FR-006 / FR-012b). |
| `chef.verify` | `success` | PATCH /admin/chefs/:id/verify 200. |
| `chef.verify` | `application_not_pending` | PATCH /admin/chefs/:id/verify 409 (FR-012 race / already-acted). |
| `chef.reject` | `success` | PATCH /admin/chefs/:id/reject 200. |
| `chef.reject` | `application_not_pending` | PATCH /admin/chefs/:id/reject 409. |
| `chef.revoke` | `success` | DELETE /admin/chefs/:id 204. |
| `chef.revoke` | `chef_not_verified` | DELETE /admin/chefs/:id 409 against a non-verified chef. |
| `chef.profile_update` | `success` / `validation_rejected` / `not_found` | PATCH /chef/profile. |
| `chef.availability_toggle` | `success` / `not_found` | PATCH /chef/availability. |
| `chef.logo_upload` / `chef.banner_upload` | `success` / `unsupported_media_type` / `payload_too_large` / `not_found` | POST /chef/logo and POST /chef/banner. The `unsupported_media_type` and `payload_too_large` outcomes are direct mappings of the R8 mime-type-whitelist and 5-MB-limit refusals. |
| `category.create` / `category.update` / `category.delete` | `success` / `validation_rejected` / `not_found` / `role_refused` | POST/PATCH/DELETE /admin/categories[/:id]. |
| `category.reorder` | `success` / `validation_rejected` / `role_refused` | PATCH /admin/categories/reorder. |

Every log line carries: `event` (from the table), `outcome`
(from the table), `timestamp` (ISO 8601), `sourceIp`,
`actor.userId` (from JWT sub), `actor.role` (so admin /
customer / chef distinction is visible in the log without a
join), `correlationId` (from `correlation-id.middleware.ts`),
and a `target` reference (`chefId` / `categoryId` /
`applicationId` whichever applies). **Per FR-039, no `latitude`,
`longitude`, `coordinates`, or coordinate-derived value ever
appears in the line**, mirroring the Phase 2 FR-021 contract.

Validation rejections (`validation_rejected`), 404s (`not_found`),
and role refusals (`role_refused`) are emitted from
`HttpExceptionNormalizerFilter` — the same pattern Phase 1 used
for `auth.password_validation` / `auth.rate_limit` and Phase 2
used for `address.*` events. Service-layer success outcomes
emit directly from the service. Application-pending / cooldown-
in-effect refusals emit from the service (they're thrown as
`ConflictException`s the filter catches, but the service knows
the outcome shape and logs it before throwing).

---

## Test fixtures

Phase 3 integration tests reuse Phase 1 / Phase 2 fixtures and
add:

- `signedInAdmin()` — registers + signs in a user, then directly
  mutates their `User.role` to `admin` via `prisma.user.update`
  (the only test-only direct-row mutation; bootstrap admins ship
  via `prisma/seed.ts` in Phase 13 deploy). Returns a session
  with admin role.
- `pendingApplication(user, overrides?)` — calls the real
  `POST /chef/apply` flow to seed a pending application owned by
  the given user. Used by every admin verification / rejection
  test.
- `verifiedChef(user, overrides?)` — calls
  `pendingApplication(...)` then has the test admin verify it,
  returning the fully verified Chef row. Used by every discovery
  test and every chef-self-mutation test.
- `rejectedApplication(user, overrides?)` — same but admin
  rejects with a synthetic reason. Used by the cooldown gate test
  and the re-apply test.
- `revokedChef(user, overrides?)` — same but admin revokes after
  verification. Used by the post-revocation cooldown test.
- `seedCategories()` — re-runs `prisma/seed.ts`'s category seed
  against the test database in a clean state. Used by every
  discovery test that exercises the FR-014 category filter.
- `seedMenu(chef, category)` — bypasses the (yet-unbuilt) Phase 4
  menu-creation flow by inserting a `Menu` row directly via the
  test Prisma client with `chefId: chef.id, categoryId:
  category.id, isActive: true`. Used solely by the FR-014 filter
  tests.
- `seedManyChefs(N)` — bulk seeds N verified chefs at
  distributed lat/lng points around a test centre. Used by the
  Haversine discovery test (`test/discovery.e2e-spec.ts`).

All fixtures are local to `test/`; no production code path
inserts a Menu or seeds an admin without going through the
intended Phase 4 / Phase 13 paths.
