---
description: "Phase 4 Menus, Items & Customer Discovery Surfaces — implementation tasks"
---

# Tasks: Menus, Items & Customer Discovery Surfaces

**Input**: Design documents from `/specs/005-phase-4-menus/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓ (4 OpenAPI files), quickstart.md ✓
**Branch**: `005-phase-4-menus`
**Repo root**: `<repo>` = `C:\Users\faragelo\Desktop\nafas`

> **Implementer guidance (READ FIRST)**
>
> Each task below is atomic, self-contained, and orderable. File paths
> are repo-relative under `<repo>`. Where a file's full content matters,
> the content is inlined verbatim — copy it as written. Where a decision
> is non-obvious, the task references the decision in `research.md`
> (R1–R8) or the relevant FR / SC in `spec.md`. Where an endpoint
> contract matters, the task references one of the four files under
> `contracts/`. Run shell commands exactly as written. The user is on
> Windows + PowerShell; use PowerShell syntax (`$env:VAR`, backtick
> line continuation, `Test-Path`). If a command fails, do NOT
> improvise — re-read the task and the referenced artifact.
>
> **Six clarifications were integrated into the spec** (see
> `spec.md#Clarifications`):
> 1. Stock: chef-side editor exposes an **"unlimited" toggle** that
>    writes `Item.quantity = -1` (the platform-defined sentinel); reads
>    map back to `{ isUnlimitedStock, quantity? }` (R4).
> 2. Image management: append-only on upload (5-image cap) plus a
>    per-image remove endpoint with idempotent "already removed"
>    semantics (R6).
> 3. "Today" for the today-available filter = **Africa/Cairo wall
>    clock** at request-handler entry, NEVER the device clock (R2).
> 4. Image-upload endpoint throttled at **20 successful uploads / 60 s
>    per chef** on top of Phase 1's default 60/60s/IP tier (R3).
> 5. Bilingual text caps: `Menu.name` ≤ 60 / `Item.name` ≤ 60 /
>    `Item.description` ≤ 500 per locale, validated AFTER server-side
>    trim, refused (not silently truncated).
> 6. Display order: **bulk-reorder ONLY** (dedicated endpoint, dense
>    renumber inside `prisma.$transaction`, exact-set guard). Reads
>    always sort by `(displayOrder ASC, createdAt ASC, id ASC)` (R5).
>
> **Phase 0/1/2/3 invariants this phase MUST preserve**:
> - All `Menu` and `Item` reads go through
>   `prismaService.extended.<model>.*` (default `deletedAt: null`
>   filter). There are NO new bare-client exceptions in Phase 4 (Phase
>   3's cooldown gate is the only such exception in the codebase).
> - All cross-module data access goes through the owning module's
>   service (Constitution Principle III). Phase 4 introduces:
>   - `menus.service.{createMenu, updateMenu, softDeleteMenu,
>     reorderMenus, addAvailability, removeAvailability,
>     findManyForChef, findTodayAvailableForChef}` — the **only** way
>     Phase 4 mutates / reads `Menu` (the Phase 3 shell methods stay
>     unchanged).
>   - `items.service.{createItem, updateItem, softDeleteItem,
>     reorderItems, appendImage, removeImage, findManyForChef,
>     findActiveForMenu}` — the **only** way Phase 4 mutates / reads
>     `Item`.
>   - `chefs.service.findTopRated(limit)` — the **only** way Phase 4
>     reads chef rows for the Home top-rated grid.
>   - `categories.service.findOneActiveOrThrow(id)` — the **only** way
>     Phase 4 enforces the FR-003 category-existence guard.
> - Soft-delete on `Menu` / `Item` goes through
>   `prismaService.<model>.softDelete({ id })` OUTSIDE transactions;
>   INSIDE a `prisma.$transaction(async (tx) => …)` use
>   `tx.<model>.update({ where: { id }, data: { deletedAt: new Date() } })`
>   (the `tx` client does not expose the extension methods). The CI
>   grep gate (`backend/scripts/ci-no-hard-delete.sh`) only blocks
>   `.delete(` calls on `menu`, `item`; the `update`-based soft-delete
>   inside transactions is safe and intentional.
> - `MenuAvailability` is the **one Phase 4 entity that hard-deletes**
>   — rows are removed via `prisma.menuAvailability.delete({ where: …
>   })`. T012 below updates the CI gate to allow this single
>   exception.
> - `class-validator` + `class-transformer` are wired globally with
>   `whitelist: true, forbidNonWhitelisted: true` from Phase 0; DTOs
>   declare ONLY the fields the contract lets the client send. In
>   particular, neither `UpdateMenuDto` nor `UpdateItemDto` declares
>   `displayOrder` — display-order changes go through the dedicated
>   bulk-reorder endpoints (R5).
> - Money fields are `Decimal(10,2)` delivered as JS strings. Phase 4
>   accepts `price` and `discountValue` as **decimal strings** in
>   request bodies (`@IsNumberString({ no_symbols: false, allow_negatives:
>   false }) + custom @MaxDecimalPlaces(2)`), and converts to
>   `decimal.js` before any math. Never `Number(decimal)`.
> - `mobile/hooks/useColors.ts` is the **only** place hex literals
>   are allowed in the mobile app (Phase 2 convention). Every new
>   Phase 4 mobile component consumes colors via `useColors()`.
> - `mobile/services/api.ts` already swaps `Content-Type` to
>   `multipart/form-data` when `cfg.data instanceof FormData` (Phase 3
>   convention). DO NOT re-implement this in `services/items.ts`; the
>   shared axios instance handles it for the item-image upload path
>   automatically.
> - Phase 3 convention preserved: any free-text field stored by a chef
>   and rendered to a customer is stored AS THE CHEF ENTERED IT and
>   rendered AS-IS; the platform does not translate user-typed text.
>
> **Zero new dependencies in Phase 4.** Do NOT run `npm install`
> anywhere — every library this phase needs is already in
> `<repo>\backend\package.json`, `<repo>\mobile\package.json`, and
> `<repo>\admin\package.json` from Phases 0 – 3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks → safe to parallelize.
- **[Story]**: Maps to a user story in `spec.md` (`US1`–`US6`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch / environment prerequisites. No source files written yet.

 - [X] T001 Verify the working directory and branch. From PowerShell at `<repo>`, run `git rev-parse --abbrev-ref HEAD` and confirm it prints `005-phase-4-menus`. Run `Test-Path specs\005-phase-4-menus\plan.md` and confirm `True`. Run `Test-Path backend\src\modules\chefs\chefs.controller.ts` and confirm `True` (Phase 3 must be in place — `ChefsController` is a sentinel). Run `Test-Path backend\src\modules\menus\menus.service.ts` and confirm `True` (Phase 3 shell of `MenusModule` is a sentinel — Phase 4 PROMOTES this module to full, not creates from scratch). Run `Test-Path backend\src\modules\categories\categories.service.ts` and confirm `True`. Do not proceed unless all five checks pass.
 
 - [X] T002 [P] Confirm zero new dependencies required. From `<repo>\backend` run `npm ls firebase-admin @supabase/supabase-js decimal.js @nestjs/throttler @nestjs/platform-express class-validator class-transformer` — every package MUST resolve to a concrete version (none `(empty)`). From `<repo>\mobile` run `npm ls expo-image-picker axios @expo/vector-icons` — same expectation. Do NOT install anything. If any package is missing, STOP and re-check Phase 0 / Phase 3 — the missing package was supposed to be installed earlier.

 - [X] T003 [P] Verify the Supabase Storage `item-images` bucket exists. Open the Supabase console at https://app.supabase.com → your project → Storage. Confirm a bucket named `item-images` is listed (Phase 0.6 created it alongside `chef-logos` and `chef-banners`). The bucket MUST be public-read. If absent, create it now with: name `item-images`, public toggle ON, file-size limit 3 MB, allowed MIME types `image/jpeg, image/png, image/webp`. The MIME whitelist on the bucket is a second line of defence; the backend `items.service.appendImage` enforces the same list independently (R8 of Phase 3 pattern applied here too).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migration, shared helpers, loggers, and cross-module method additions every user story depends on. Complete this phase **before** starting any user-story phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema migration

- [X] T004 Add the three Phase 4 composite indexes to the schema. Open `<repo>\backend\prisma\schema.prisma`. Find the `model Item { ... }` block. **Inside** the block, AFTER any existing `@@index(...)` declarations and BEFORE the `@@map("items")` line, add these two declarations:
  ```prisma
    @@index([menuId, isActive, deletedAt])
    @@index([menuId, displayOrder])
  ```
  Then find the `model Menu { ... }` block. **Inside** it, AFTER any existing `@@index(...)` declarations and BEFORE `@@map("menus")`, add:
  ```prisma
    @@index([chefId, displayOrder])
  ```
  Save the file. Do NOT change any other line. Do NOT add any column.

- [X] T005 Generate the Prisma migration. From `<repo>\backend` run:
  ```powershell
  npx prisma migrate dev --name 0004_item_active_displayorder_indexes
  ```
  Expected outcome: a new directory `<repo>\backend\prisma\migrations\0004_item_active_displayorder_indexes\` is created with a `migration.sql` whose contents are equivalent to:
  ```sql
  CREATE INDEX "items_menu_id_is_active_deleted_at_idx" ON "items"("menu_id", "is_active", "deleted_at");
  CREATE INDEX "items_menu_id_display_order_idx" ON "items"("menu_id", "display_order");
  CREATE INDEX "menus_chef_id_display_order_idx" ON "menus"("chef_id", "display_order");
  ```
  Prisma also regenerates the client. Verify with `npx prisma migrate status` — must report "Database schema is up to date." Verify with `npx prisma format` — no diff.

### Shared backend helpers (pure-function — no module)

- [X] T006 [P] Create the today-available helper at `<repo>\backend\src\modules\menus\today-cairo.ts`. Verbatim content:
  ```ts
  /**
   * Returns 0..6 (0 = Sunday) for the current weekday in Africa/Cairo.
   *
   * Single source of truth for "today" in every Phase 4 today-available
   * read (FR-017, research R2). Pass a `now` argument in tests to pin
   * the clock without `jest.useFakeTimers()`.
   *
   * Node 20 LTS ships full ICU data, so 'Africa/Cairo' resolves without
   * --with-intl flags.
   */
  export function todaysCairoWeekday(now: Date = new Date()): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      weekday: 'short',
    }).format(now);

    const order: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const value = order[weekday];
    if (value === undefined) {
      throw new Error(`Unexpected weekday from Intl: ${weekday}`);
    }
    return value;
  }
  ```
  No dependencies. No exports beyond the function. This file lives under `menus/` because the today-available filter conceptually belongs to the menu domain even though it's a pure utility.

- [X] T007 [P] Create the effective-price helper at `<repo>\backend\src\modules\items\effective-price.ts` (the directory `<repo>\backend\src\modules\items\` does NOT yet exist — create it now). Verbatim content:
  ```ts
  import Decimal from 'decimal.js';

  /**
   * Server-authoritative effective sell price for an item (FR-016).
   *
   * Consumed by:
   *   - items.service (returned alongside base price on every read)
   *   - Phase 5 cart subtotal computation
   *   - Phase 6 OrderItem.price snapshot at order creation
   *
   * NEVER computed on the client (Constitution Principle II).
   *
   * Exported as a PURE FUNCTION (not a service method) so that
   * cart.service and orders.service can import it without forcing
   * a forwardRef circular dep through items.module. See
   * plan.md "Complexity Tracking" for the rationale.
   */
  export function effectivePrice(item: {
    price: Decimal | string | number;
    discountValue: Decimal | string | number;
    discountUnit: 'fixed' | 'percent';
  }): Decimal {
    const base = new Decimal(item.price as Decimal.Value);
    const discount = new Decimal(item.discountValue as Decimal.Value);
    if (item.discountUnit === 'fixed') {
      return Decimal.max(base.minus(discount), 0);
    }
    // percent
    const factor = new Decimal(1).minus(discount.div(100));
    return Decimal.max(base.times(factor), 0);
  }
  ```
  Verify by running `npx tsc --noEmit` from `<repo>\backend` — must pass.

### Shared DTO building blocks

- [X] T008 [P] Create the shared `BilingualText` DTO + validator at `<repo>\backend\src\modules\menus\dto\bilingual-text.dto.ts`. The directory `<repo>\backend\src\modules\menus\dto\` does NOT yet exist — create it now. Verbatim content:
  ```ts
  import { Transform } from 'class-transformer';
  import { IsString, MaxLength, MinLength } from 'class-validator';

  /**
   * Shared bilingual JSON shape for Menu.name, Item.name,
   * Item.description (and the Phase 3 Category.name).
   *
   * Both locales are required (FR-030). Each locale is trimmed
   * server-side BEFORE the length check so leading/trailing
   * whitespace cannot inflate the value past the cap.
   *
   * The maxLength cap is set per-instance (60 for names, 500 for
   * descriptions) by extending this class — see CreateMenuDto,
   * CreateItemDto.
   */
  export class BilingualText {
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString({ message: 'BILINGUAL_EN_REQUIRED' })
    @MinLength(1, { message: 'BILINGUAL_EN_REQUIRED' })
    en!: string;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString({ message: 'BILINGUAL_AR_REQUIRED' })
    @MinLength(1, { message: 'BILINGUAL_AR_REQUIRED' })
    ar!: string;
  }

  /**
   * Helper to apply a custom per-locale max length on instances of
   * BilingualText subclasses. Used in concrete DTOs to set the
   * 60-char (name) or 500-char (description) cap with the right
   * error code.
   *
   * Returns a class-validator decorator factory you compose on the
   * field with `@ValidateNested()` + `@Type(() => CappedBilingualText(...))`.
   *
   * In practice we declare a per-locale-capped subclass per field;
   * see `MenuName60`, `ItemName60`, and `ItemDescription500` below.
   */
  function bilingualSubclass(
    maxLen: number,
    requiredCode: string,
    tooLongCode: string,
  ): typeof BilingualText {
    class Capped extends BilingualText {
      @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
      )
      @IsString({ message: requiredCode })
      @MinLength(1, { message: requiredCode })
      @MaxLength(maxLen, { message: tooLongCode })
      declare en: string;

      @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
      )
      @IsString({ message: requiredCode })
      @MinLength(1, { message: requiredCode })
      @MaxLength(maxLen, { message: tooLongCode })
      declare ar: string;
    }
    return Capped;
  }

  /** Bilingual menu name capped at 60 characters per locale. */
  export const MenuName60 = bilingualSubclass(
    60,
    'MENU_NAME_REQUIRED',
    'MENU_NAME_TOO_LONG',
  );

  /** Bilingual item name capped at 60 characters per locale. */
  export const ItemName60 = bilingualSubclass(
    60,
    'ITEM_NAME_REQUIRED',
    'ITEM_NAME_TOO_LONG',
  );

  /** Bilingual item description capped at 500 characters per locale. */
  export const ItemDescription500 = bilingualSubclass(
    500,
    'ITEM_DESCRIPTION_REQUIRED',
    'ITEM_DESCRIPTION_TOO_LONG',
  );
  ```
  Verify with `npx tsc --noEmit` from `<repo>\backend`.

- [X] T009 [P] Create the `StockInput` DTO + validator at `<repo>\backend\src\modules\items\dto\stock-input.dto.ts` (the directory `<repo>\backend\src\modules\items\dto\` does NOT yet exist — create it now). Verbatim content:
  ```ts
  import {
    IsBoolean,
    IsInt,
    Min,
    ValidateIf,
    IsDefined,
    IsEmpty,
  } from 'class-validator';

  /**
   * Encodes the FR-008 chef-side "unlimited stock" toggle on the wire.
   *
   * Acceptable shapes:
   *   { isUnlimitedStock: true }                  → stored as -1
   *   { isUnlimitedStock: false, quantity: N≥0 }  → stored as N
   *
   * An ambiguous combination (both or neither) refuses with
   * ITEM_STOCK_AMBIGUOUS.
   */
  export class StockInputDto {
    @IsBoolean({ message: 'ITEM_STOCK_AMBIGUOUS' })
    isUnlimitedStock!: boolean;

    /**
     * Required and >= 0 when isUnlimitedStock === false.
     * MUST be absent when isUnlimitedStock === true.
     */
    @ValidateIf((o: StockInputDto) => o.isUnlimitedStock === false)
    @IsDefined({ message: 'ITEM_STOCK_AMBIGUOUS' })
    @IsInt({ message: 'ITEM_STOCK_AMBIGUOUS' })
    @Min(0, { message: 'ITEM_STOCK_AMBIGUOUS' })
    quantity?: number;

    @ValidateIf((o: StockInputDto) => o.isUnlimitedStock === true)
    @IsEmpty({ message: 'ITEM_STOCK_AMBIGUOUS' })
    quantityWhenUnlimitedMustBeAbsent?: undefined;
  }

  /**
   * Maps the wire shape to the database-internal Item.quantity value.
   * `-1` is the platform-defined unlimited sentinel (Phase 6 stock-
   * decrement honours it). Database-internal — NEVER on the wire.
   */
  export function stockInputToDb(stock: StockInputDto): number {
    return stock.isUnlimitedStock ? -1 : (stock.quantity as number);
  }

  /**
   * Maps a stored Item.quantity value back to the wire shape.
   * Returns { isUnlimitedStock, quantity } where quantity is omitted
   * (undefined) when isUnlimitedStock=true.
   */
  export function dbToStockOutput(
    quantity: number,
  ): { isUnlimitedStock: boolean; quantity?: number; inStock: boolean } {
    if (quantity === -1) {
      return { isUnlimitedStock: true, inStock: true };
    }
    return { isUnlimitedStock: false, quantity, inStock: quantity > 0 };
  }
  ```
  Verify with `npx tsc --noEmit`.

### Structured-log loggers (siblings to Phase 1/2/3 loggers)

- [X] T010 [P] Create the menu-event logger at `<repo>\backend\src\common\logging\menu-event.logger.ts`. Open `<repo>\backend\src\common\logging\chef-event.logger.ts` first to see the exact envelope shape Phase 3 used. The menu logger MUST emit the same shape (`event`, `outcome`, `actorId`, `actorRole`, `sourceIp`, `correlationId`, `timestamp`, `target`). Verbatim skeleton — model the body after the Phase 3 chef logger; only the event-name constants and method names change:
  ```ts
  import { Injectable, Logger } from '@nestjs/common';
  import { CorrelationIdContext } from './correlation-id.context';

  type MenuEventName =
    | 'menu.create'
    | 'menu.update'
    | 'menu.soft_delete'
    | 'menu.reorder'
    | 'menu.availability_add'
    | 'menu.availability_remove';

  type MenuEventOutcome =
    | 'success'
    | 'validation_rejected'
    | 'category_not_found'
    | 'reorder_not_exact_set'
    | 'not_found'
    | 'role_refused';

  interface MenuEventInput {
    event: MenuEventName;
    outcome: MenuEventOutcome;
    actorUserId: string | null;
    actorRole: 'admin' | 'customer' | 'chef' | null;
    sourceIp: string | null;
    targetMenuId?: string;
  }

  @Injectable()
  export class MenuEventLogger {
    private readonly logger = new Logger('MenuEvent');

    constructor(private readonly correlationContext: CorrelationIdContext) {}

    emit(input: MenuEventInput): void {
      const line = {
        event: input.event,
        outcome: input.outcome,
        actor: { userId: input.actorUserId, role: input.actorRole },
        sourceIp: input.sourceIp,
        target: input.targetMenuId ? { menuId: input.targetMenuId } : undefined,
        correlationId: this.correlationContext.get() ?? null,
        timestamp: new Date().toISOString(),
      };
      this.logger.log(JSON.stringify(line));
    }
  }
  ```
  Register `MenuEventLogger` in `<repo>\backend\src\common\logging\logging.module.ts` (the module that already exports `AuthEventLogger`, `AddressEventLogger`, `ChefEventLogger`, `CategoryEventLogger`). Append `MenuEventLogger` to both the `providers` array AND the `exports` array.

- [X] T011 [P] Create the item-event logger at `<repo>\backend\src\common\logging\item-event.logger.ts`. Mirror T010's shape; only the event-name constants and outcomes change:
  ```ts
  import { Injectable, Logger } from '@nestjs/common';
  import { CorrelationIdContext } from './correlation-id.context';

  type ItemEventName =
    | 'item.create'
    | 'item.update'
    | 'item.soft_delete'
    | 'item.active_toggle'
    | 'item.reorder'
    | 'item.image_upload'
    | 'item.image_remove';

  type ItemEventOutcome =
    | 'success'
    | 'validation_rejected'
    | 'negative_effective_price'
    | 'images_full'
    | 'unsupported_media_type'
    | 'payload_too_large'
    | 'rate_limited'
    | 'reorder_not_exact_set'
    | 'not_found'
    | 'role_refused';

  interface ItemEventInput {
    event: ItemEventName;
    outcome: ItemEventOutcome;
    actorUserId: string | null;
    actorRole: 'admin' | 'customer' | 'chef' | null;
    sourceIp: string | null;
    targetItemId?: string;
  }

  @Injectable()
  export class ItemEventLogger {
    private readonly logger = new Logger('ItemEvent');

    constructor(private readonly correlationContext: CorrelationIdContext) {}

    emit(input: ItemEventInput): void {
      const line = {
        event: input.event,
        outcome: input.outcome,
        actor: { userId: input.actorUserId, role: input.actorRole },
        sourceIp: input.sourceIp,
        target: input.targetItemId ? { itemId: input.targetItemId } : undefined,
        correlationId: this.correlationContext.get() ?? null,
        timestamp: new Date().toISOString(),
      };
      this.logger.log(JSON.stringify(line));
    }
  }
  ```
  Register `ItemEventLogger` in `<repo>\backend\src\common\logging\logging.module.ts` alongside `MenuEventLogger`.

### CI grep gate allow-list update

- [X] T012 Update the CI hard-delete grep gate to allow `prisma.menuAvailability.delete(...)`. Open `<repo>\backend\scripts\ci-no-hard-delete.sh`. Find the line that lists the soft-delete entity names (Phase 0 / 1 / 2 / 3 will have built up a list). The script's logic is a `grep -RnE` that flags any `prisma\.<entity>\.delete\(` occurrence on the entities. Add `menuAvailability` to the **allow-list** (NOT the soft-delete list) — `MenuAvailability` rows are hard-deleted by chef-untick-weekday and the design is intentional (research R1 / data-model.md). The exact diff depends on the current shape of the script; the goal is that running this from `<repo>\backend` exits 0 AFTER T021 lands its `prisma.menuAvailability.delete` call:
  ```powershell
  ./scripts/ci-no-hard-delete.sh
  ```
  Verify after T021 lands.

### Cross-module method additions (consumed by US1 – US5)

- [X] T013 [P] Extend `chefs.service` with `findOwnedOrThrow(userId)`. Open `<repo>\backend\src\modules\chefs\chefs.service.ts`. If a method with this name already exists (Phase 3 may have shipped it under a slightly different name — e.g., `findOwnedByUser`), DO NOT duplicate. Either: (a) the method already exists with the exact name `findOwnedOrThrow` — proceed to T014, OR (b) the method exists under a different name — add a thin alias method `findOwnedOrThrow(userId: string): Promise<Chef>` that delegates. If neither exists, add the canonical method:
  ```ts
  /**
   * Phase 4 chef-row ownership resolver for every chef-side mutation.
   * Returns the calling user's chef row. Throws 404 CHEF_NOT_FOUND
   * if the user has no verified, non-soft-deleted chef row.
   *
   * The 404 shape is identical to the "no row" case so a non-chef
   * caller learns nothing about whether they ever had a chef row.
   */
  async findOwnedOrThrow(userId: string): Promise<Chef> {
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { userId, isVerified: true },
    });
    if (!chef) {
      throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    }
    return chef;
  }
  ```
  Confirm with `npx tsc --noEmit`.

- [X] T014 [P] Extend `chefs.service` with `findTopRated(limit)`. Open `<repo>\backend\src\modules\chefs\chefs.service.ts` and append (alongside the Phase 3 `findManyForDiscovery`):
  ```ts
  /**
   * Top-rated grid query for the Home surface (FR-022).
   * Sorts by (ratings DESC, verifiedAt DESC, id ASC) so the
   * tiebreaker is deterministic. Until Phase 7 wires reviews, every
   * chef's rating is 0 and the order collapses to verified-newest-first.
   */
  async findTopRated(limit = 12): Promise<Chef[]> {
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
  Confirm with `npx tsc --noEmit`.

- [X] T015 [P] Extend `categories.service` with `findOneActiveOrThrow(id)`. Open `<repo>\backend\src\modules\categories\categories.service.ts` and append:
  ```ts
  /**
   * FR-003 guard for menu create / update. Refuses a soft-deleted
   * or non-existent category reference with 400 CATEGORY_NOT_FOUND.
   *
   * Consulted by menus.service before any Menu write. Reads through
   * prismaService.extended.category.* so the Phase 0 soft-delete
   * filter applies automatically; the in-process cache from Phase 3
   * R7 is also consulted first when present.
   */
  async findOneActiveOrThrow(id: string): Promise<Category> {
    const row = await this.prismaService.extended.category.findUnique({
      where: { id },
    });
    if (!row) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND' });
    }
    return row;
  }
  ```
  Ensure `BadRequestException` is imported from `@nestjs/common`. Confirm with `npx tsc --noEmit`.

### HttpExceptionNormalizerFilter widening

- [X] T016 Widen `HttpExceptionNormalizerFilter` to cover Phase 4 paths and emit Phase 4 events. Open `<repo>\backend\src\common\errors\http-exception.filter.ts`. The filter already strips `latitude` / `longitude` / `coordinates` for `/api/v1/addresses/*`, `/api/v1/chefs/*`, `/api/v1/chef/*`, `/api/v1/admin/chefs/*` (Phases 2 / 3). Extend the path-prefix list it scrubs to also cover:
  - `/api/v1/chef/menus`
  - `/api/v1/chef/items`
  - `/api/v1/chefs/`  ← already there for Phase 3, but Phase 4 extends `GET /chefs/:id` to include menu data; the prefix already covers it
  - `/api/v1/home`

  The filter also emits the Phase 3 chef-event lines for `validation_rejected` / `not_found` / `role_refused` outcomes on `/chefs/*` and `/chef/*` paths. Extend the emission table so that, for path-prefix `/api/v1/chef/menus`:
    - `400` → `MenuEventLogger.emit({ event: 'menu.update', outcome: 'validation_rejected', ... })` (use the most relevant event name based on the HTTP verb — `POST` → `menu.create`, `PATCH /reorder` → `menu.reorder`, `PATCH /{id}` → `menu.update`, etc.; you can use a small switch inside the filter or a path-pattern → event-name table)
    - `404` → `MenuEventLogger.emit({ ..., outcome: 'not_found' })`
    - `403` → `MenuEventLogger.emit({ ..., outcome: 'role_refused' })`
    - `429` → `MenuEventLogger.emit({ ..., outcome: 'rate_limited' })` ← but menus have no throttle, so this won't fire on /menus

  For path-prefix `/api/v1/chef/items`, emit `ItemEventLogger` lines with the analogous mapping:
    - `400` → `item.create` / `item.update` / `item.reorder` per the verb
    - `404` → `item.update / not_found` (or the most relevant event name)
    - `403` → `item.update / role_refused`
    - `429` → `item.image_upload / rate_limited` ← this IS reachable per FR-012b
    - `413` → `item.image_upload / payload_too_large`
    - `415` → `item.image_upload / unsupported_media_type`

  Inject `MenuEventLogger` and `ItemEventLogger` via the filter's constructor. Keep the Phase 3 chef-event / category-event emissions intact. Service-layer success outcomes emit directly from the services (see T021, T030, T032, etc.), so the filter ONLY handles error outcomes.

  Confirm with `npx tsc --noEmit`. Add a Jest test in `<repo>\backend\test\http-redaction.e2e-spec.ts` (the existing Phase 2 / 3 file) — see T079 below.

---

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel by user story.

---

## Phase 3: User Story 1 - Verified chef creates a menu (Priority: P1) 🎯 MVP slice

**Goal**: A verified chef can create a menu (bilingual name, category, day-of-week availability OR "available every day"), and can add/remove individual weekday rows.

**Independent Test**: With a Phase 3 verified chef, the chef can submit a complete `POST /chef/menus` and see the menu in their browse list (`GET /chef/menus`). Adding `POST /chef/menus/:id/availability { dayOfWeek: 0 }` is idempotent. Deleting an availability row that doesn't exist is also idempotent.

### DTOs

- [X] T017 [P] [US1] Create `<repo>\backend\src\modules\menus\dto\create-menu.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsUUID,
    Max,
    Min,
    ValidateNested,
    ArrayUnique,
  } from 'class-validator';
  import { MenuName60 } from './bilingual-text.dto';

  export class CreateMenuDto {
    @ValidateNested()
    @Type(() => MenuName60)
    name!: InstanceType<typeof MenuName60>;

    @IsUUID('4', { message: 'CATEGORY_NOT_FOUND' })
    categoryId!: string;

    @IsBoolean()
    availableAllDays!: boolean;

    @IsOptional()
    @IsArray()
    @ArrayUnique({ message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    @IsInt({ each: true, message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    @Min(0, { each: true, message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    @Max(6, { each: true, message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    initialAvailability?: number[];
  }
  ```

- [X] T018 [P] [US1] Create `<repo>\backend\src\modules\menus\dto\add-availability.dto.ts`:
  ```ts
  import { IsInt, Max, Min } from 'class-validator';

  export class AddAvailabilityDto {
    @IsInt({ message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    @Min(0, { message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    @Max(6, { message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
    dayOfWeek!: number;
  }
  ```

### Service methods

- [X] T019 [US1] Add `createMenu` to `<repo>\backend\src\modules\menus\menus.service.ts`. Append (alongside the Phase 3 shell methods `hasMenuInCategory`, `categoriesForChef`, `chefIdsInCategory` — do NOT remove them):
  ```ts
  /**
   * FR-001: create a menu owned by the calling chef. The chef row is
   * re-derived from the JWT sub upstream (controller calls
   * chefs.service.findOwnedOrThrow first and passes the resolved
   * chef.id as `chefId` here).
   *
   * Category existence is enforced via the cross-module call
   * categories.service.findOneActiveOrThrow.
   *
   * If `initialAvailability` is supplied, the weekday rows are
   * created in the same transaction as the menu insert.
   */
  async createMenu(
    chefId: string,
    dto: CreateMenuDto,
  ): Promise<MenuWithAvailability> {
    await this.categoriesService.findOneActiveOrThrow(dto.categoryId);

    const menu = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.menu.create({
        data: {
          chefId,
          categoryId: dto.categoryId,
          name: dto.name as unknown as Prisma.JsonObject,
          availableAllDays: dto.availableAllDays,
        },
      });
      if (dto.initialAvailability && dto.initialAvailability.length > 0) {
        await tx.menuAvailability.createMany({
          data: dto.initialAvailability.map((dayOfWeek) => ({
            menuId: created.id,
            dayOfWeek,
          })),
          skipDuplicates: true,
        });
      }
      return tx.menu.findUniqueOrThrow({
        where: { id: created.id },
        include: { availability: true },
      });
    });

    this.menuEventLogger.emit({
      event: 'menu.create',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menu.id,
    });
    return menu;
  }
  ```
  Add imports: `import { Prisma } from '@prisma/client';`, `import { CreateMenuDto } from './dto/create-menu.dto';`, `import { CategoriesService } from '../categories/categories.service';`, `import { MenuEventLogger } from '../../common/logging/menu-event.logger';`. Inject `CategoriesService` and `MenuEventLogger` via the constructor (alongside the existing `PrismaService`). The `actorContext` is the small ALS-backed helper already used by `chefs.service` to read JWT `sub` + source IP (Phase 3); inject it the same way (or re-derive from the request via the controller and pass it in — match Phase 3's pattern in `chefs.service`).

  Add the supporting type at the bottom of the file:
  ```ts
  type MenuWithAvailability = Prisma.MenuGetPayload<{ include: { availability: true } }>;
  ```
  Verify with `npx tsc --noEmit`.

- [X] T020 [US1] Add `findManyForChef` (chef's own browse) to `<repo>\backend\src\modules\menus\menus.service.ts`:
  ```ts
  /**
   * FR-006: chef-side browse. Returns every non-soft-deleted menu
   * owned by `chefId`, in the deterministic order
   * (displayOrder ASC, createdAt ASC, id ASC). Items inside each
   * menu are returned in the same order, INCLUDING items the chef
   * has marked inactive (FR-015 — chef sees full catalogue).
   */
  async findManyForChef(chefId: string): Promise<ChefMenuWithItems[]> {
    return this.prismaService.extended.menu.findMany({
      where: { chefId },
      include: {
        availability: true,
        items: {
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
  Add type alias `type ChefMenuWithItems = Prisma.MenuGetPayload<{ include: { availability: true; items: true } }>;`.

- [X] T021 [US1] Add `addAvailability` + `removeAvailability` to `<repo>\backend\src\modules\menus\menus.service.ts`:
  ```ts
  /**
   * FR-004: idempotent on the (menuId, dayOfWeek) composite. A re-
   * submit with the same dayOfWeek is a no-op (handled by upsert).
   */
  async addAvailability(menuId: string, chefId: string, dayOfWeek: number): Promise<void> {
    await this.assertMenuOwnedByChef(menuId, chefId);
    await this.prismaService.menuAvailability.upsert({
      where: { menuId_dayOfWeek: { menuId, dayOfWeek } },
      create: { menuId, dayOfWeek },
      update: {},
    });
    this.menuEventLogger.emit({
      event: 'menu.availability_add',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menuId,
    });
  }

  /**
   * FR-004: idempotent. Removing a weekday that is not currently
   * included is a no-op (HTTP 204 from the controller).
   */
  async removeAvailability(menuId: string, chefId: string, dayOfWeek: number): Promise<void> {
    await this.assertMenuOwnedByChef(menuId, chefId);
    try {
      await this.prismaService.menuAvailability.delete({
        where: { menuId_dayOfWeek: { menuId, dayOfWeek } },
      });
    } catch (err: unknown) {
      // Prisma P2025 = "Record to delete does not exist" — idempotent no-op.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        return;
      }
      throw err;
    }
    this.menuEventLogger.emit({
      event: 'menu.availability_remove',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menuId,
    });
  }

  /**
   * Private ownership helper. Returns the menu when owned by the
   * caller's chef; throws NotFoundException with code MENU_NOT_FOUND
   * when the menu does not exist, is soft-deleted, OR is owned by
   * a different chef. The 404 shape is identical across all three
   * cases (FR-026 / SC-014).
   */
  private async assertMenuOwnedByChef(menuId: string, chefId: string): Promise<void> {
    const menu = await this.prismaService.extended.menu.findFirst({
      where: { id: menuId, chefId },
      select: { id: true },
    });
    if (!menu) {
      throw new NotFoundException({ code: 'MENU_NOT_FOUND' });
    }
  }
  ```
  Add `import { NotFoundException } from '@nestjs/common';`.

### Controller

- [X] T022 [US1] Create `<repo>\backend\src\modules\menus\menus.controller.ts`. Verbatim content for the US1 scope (US5 extends this same file with PATCH/DELETE/reorder; do NOT pre-write those endpoints here — they'll be added in T046):
  ```ts
  import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
    Req,
    UseGuards,
  } from '@nestjs/common';
  import { Request } from 'express';
  import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../../common/guards/roles.guard';
  import { Roles } from '../../common/decorators/roles.decorator';
  import { ChefsService } from '../chefs/chefs.service';
  import { MenusService } from './menus.service';
  import { CreateMenuDto } from './dto/create-menu.dto';
  import { AddAvailabilityDto } from './dto/add-availability.dto';

  @ApiTags('ChefMenus')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('chef')
  @Controller('api/v1/chef/menus')
  export class MenusController {
    constructor(
      private readonly menusService: MenusService,
      private readonly chefsService: ChefsService,
    ) {}

    @Get()
    async listOwnMenus(@Req() req: Request) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      return this.menusService.findManyForChef(chef.id);
    }

    @Post()
    async createMenu(@Req() req: Request, @Body() dto: CreateMenuDto) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      return this.menusService.createMenu(chef.id, dto);
    }

    @Post(':id/availability')
    async addAvailability(
      @Req() req: Request,
      @Param('id') menuId: string,
      @Body() dto: AddAvailabilityDto,
    ) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      await this.menusService.addAvailability(menuId, chef.id, dto.dayOfWeek);
      return { dayOfWeek: dto.dayOfWeek };
    }

    @Delete(':id/availability/:dayOfWeek')
    @HttpCode(204)
    async removeAvailability(
      @Req() req: Request,
      @Param('id') menuId: string,
      @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    ) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      await this.menusService.removeAvailability(menuId, chef.id, dayOfWeek);
    }
  }
  ```
  Note: the contract OpenAPI documents `:dayOfWeek` as an integer path param (0..6). This task implements the same — the chef-side client always has the weekday integer at hand from the day-chip toggle, so the integer is the natural identifier and no MenuAvailability row UUID lookup is needed.

  Register `MenusController` in `<repo>\backend\src\modules\menus\menus.module.ts` under `controllers: [MenusController]` and ensure `ChefsModule` is imported (so `ChefsService` resolves). Add `CategoriesModule` to imports too (for `CategoriesService`). Confirm with `npx tsc --noEmit`.

### Mobile

- [X] T023 [P] [US1] Create `<repo>\mobile\services\menus.ts`. Verbatim:
  ```ts
  import { api } from './api';

  export type BilingualText = { en: string; ar: string };
  export type ChefMenu = {
    id: string;
    chefId: string;
    categoryId: string;
    name: BilingualText;
    displayOrder: number;
    availableAllDays: boolean;
    availability: { id: string; menuId: string; dayOfWeek: number; createdAt: string }[];
    items: import('./items').ChefItem[];
    createdAt: string;
    updatedAt: string;
  };

  export const menusService = {
    listOwn: () => api.get<ChefMenu[]>('/api/v1/chef/menus').then((r) => r.data),
    create: (body: {
      name: BilingualText;
      categoryId: string;
      availableAllDays: boolean;
      initialAvailability?: number[];
    }) => api.post<ChefMenu>('/api/v1/chef/menus', body).then((r) => r.data),
    addAvailability: (menuId: string, dayOfWeek: number) =>
      api.post<{ dayOfWeek: number }>(`/api/v1/chef/menus/${menuId}/availability`, { dayOfWeek }).then((r) => r.data),
    removeAvailability: (menuId: string, dayOfWeek: number) =>
      api.delete<void>(`/api/v1/chef/menus/${menuId}/availability/${dayOfWeek}`),
  };
  ```
  This file declares `ChefMenu.items` typed as `import('./items').ChefItem[]` — that import resolves once T036 creates `services/items.ts`. TypeScript module resolution handles the lazy import; the chef-side US1 screen does not need to render items yet (US2 fills items in), so the `items` array will be empty on US1's first read.

- [X] T024 [P] [US1] Create `<repo>\mobile\components\DayOfWeekPicker.tsx`. Verbatim:
  ```tsx
  import React from 'react';
  import { Pressable, Text, View } from 'react-native';
  import { useColors } from '../hooks/useColors';
  import { useTranslation } from '../hooks/useTranslation'; // Phase 1 hook

  interface DayOfWeekPickerProps {
    selected: number[];                 // 0..6
    onChange: (next: number[]) => void;
  }

  export function DayOfWeekPicker({ selected, onChange }: DayOfWeekPickerProps) {
    const colors = useColors();
    const { t, isRTL } = useTranslation();

    const days: { value: number; key: string }[] = [
      { value: 0, key: 'common.day.sun' },
      { value: 1, key: 'common.day.mon' },
      { value: 2, key: 'common.day.tue' },
      { value: 3, key: 'common.day.wed' },
      { value: 4, key: 'common.day.thu' },
      { value: 5, key: 'common.day.fri' },
      { value: 6, key: 'common.day.sat' },
    ];

    function toggle(day: number) {
      onChange(selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day]);
    }

    return (
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {days.map((d) => {
          const on = selected.includes(d.value);
          return (
            <Pressable
              key={d.value}
              onPress={() => toggle(d.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: on ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: on ? colors.primary : colors.border,
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={{ color: on ? colors.onPrimary : colors.text }}>{t(d.key)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  ```
  Add the seven `common.day.{sun..sat}` keys to T065/T066 (i18n) — for now, the keys are referenced; values will land in US6.

- [X] T025 [P] [US1] Create `<repo>\mobile\components\MenuEditorSheet.tsx`. The sheet is a modal that creates OR edits a menu. For US1 it only covers create — edit is added in US5. The sheet posts to `menusService.create` and on success calls an `onCreated(menu)` prop. Use design-system primitives via `useColors()`; the `DayOfWeekPicker` from T024; bilingual `t(key)` strings throughout. Mirror the design-system "chef catalogue editor" modal layout from the `nafas-design-system` skill. The exact JSX is design-system-driven (consult the skill before writing); the contract is:
  - props: `{ visible: boolean; categories: { id: string; name: BilingualText }[]; onClose: () => void; onCreated: (menu: ChefMenu) => void }`
  - state: `nameEn`, `nameAr`, `categoryId`, `mode: 'specific-days' | 'every-day'`, `selectedDays: number[]`
  - submit: if `mode === 'every-day'`, send `{ availableAllDays: true, initialAvailability: undefined }`; else send `{ availableAllDays: false, initialAvailability: selectedDays }` and refuse client-side if `selectedDays.length === 0`.
  - errors: display the server's error `code` mapped via `t('errors.menu.' + code.toLowerCase())`.

- [X] T026 [US1] Wire the menu editor into `<repo>\mobile\app\(chef)\menu.tsx`. The file is a Phase 3 placeholder — replace its body. The screen:
  1. On mount, fetches `menusService.listOwn()` and `categoriesService.list()` in parallel.
  2. Renders a list of the chef's menus (empty state when zero).
  3. Top-right header action: "Create Menu" → opens `MenuEditorSheet` with `categories` prop populated.
  4. On `onCreated(menu)`, the screen re-fetches `menusService.listOwn()` and surfaces the new menu in the list.
  5. Every visible string consumes `t(key)`; layout uses `isRTL` for `flexDirection`.

  Sketch (the actual file follows the design-system "chef menu browse" mockup — check the `nafas-design-system` skill for the exact card / FAB / empty-state visuals):
  ```tsx
  import React, { useEffect, useState } from 'react';
  import { FlatList, View, Text, Pressable } from 'react-native';
  import { useColors } from '../../hooks/useColors';
  import { useTranslation } from '../../hooks/useTranslation';
  import { menusService, ChefMenu } from '../../services/menus';
  import { categoriesService, Category } from '../../services/categories';
  import { MenuEditorSheet } from '../../components/MenuEditorSheet';

  export default function ChefMenuScreen() {
    const colors = useColors();
    const { t, isRTL } = useTranslation();
    const [menus, setMenus] = useState<ChefMenu[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [sheetOpen, setSheetOpen] = useState(false);

    async function refresh() {
      const [m, c] = await Promise.all([menusService.listOwn(), categoriesService.list()]);
      setMenus(m);
      setCategories(c);
    }

    useEffect(() => {
      refresh();
    }, []);

    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* header + create CTA */}
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', padding: 16, justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{t('chef.menu.title')}</Text>
          <Pressable onPress={() => setSheetOpen(true)}>
            <Text style={{ color: colors.primary }}>{t('chef.menu.create')}</Text>
          </Pressable>
        </View>
        {/* list (or empty state) */}
        {menus.length === 0 ? (
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.muted }}>{t('chef.menu.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={menus}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={{ padding: 16, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
                <Text style={{ color: colors.text }}>{t('chef.menu.row.name', { name: item.name[isRTL ? 'ar' : 'en'] })}</Text>
              </View>
            )}
          />
        )}
        <MenuEditorSheet
          visible={sheetOpen}
          categories={categories}
          onClose={() => setSheetOpen(false)}
          onCreated={() => {
            setSheetOpen(false);
            refresh();
          }}
        />
      </View>
    );
  }
  ```
  Adjust the JSX to match the design-system "chef menu browse" mockup. Verify with `npx tsc --noEmit` from `<repo>\mobile`.

**Checkpoint**: At this point, User Story 1 is fully functional. A verified chef can create a menu via the mobile app and see it persist across app restart. Backend integration test in T072 below covers the API surface.

---

## Phase 4: User Story 2 - Verified chef adds items to a menu (Priority: P1)

**Goal**: A verified chef can create items inside one of their menus, set a price + optional discount + stock (with the "unlimited" toggle), and upload up to 5 images per item.

**Independent Test**: With a Phase 3 verified chef AND a menu created via Phase 3 (or via US1), the chef can `POST /chef/menus/:menuId/items` with a valid body and see the item in the menu's item list (`GET /chef/menus/:menuId/items`). Uploading a JPEG (≤ 3 MB) appends to `images`; uploading a 6th image refuses with `ITEM_IMAGES_FULL`; uploading an SVG refuses with `UNSUPPORTED_MEDIA_TYPE`; uploading a 4-MB JPEG refuses with `PAYLOAD_TOO_LARGE`.

### DTOs

- [X] T027 [P] [US2] Create `<repo>\backend\src\modules\items\dto\create-item.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import {
    IsBoolean,
    IsEnum,
    IsNumberString,
    IsOptional,
    ValidateNested,
  } from 'class-validator';
  import { ItemName60, ItemDescription500 } from '../../menus/dto/bilingual-text.dto';
  import { StockInputDto } from './stock-input.dto';

  export class CreateItemDto {
    @ValidateNested()
    @Type(() => ItemName60)
    name!: InstanceType<typeof ItemName60>;

    @ValidateNested()
    @Type(() => ItemDescription500)
    description!: InstanceType<typeof ItemDescription500>;

    /**
     * Decimal string with up to 2 decimal places, > 0. The service
     * converts to a Decimal before any math.
     */
    @IsNumberString({ no_symbols: false }, { message: 'ITEM_PRICE_INVALID' })
    price!: string;

    @IsOptional()
    @IsNumberString({ no_symbols: false }, { message: 'ITEM_DISCOUNT_INVALID' })
    discountValue?: string;

    @IsOptional()
    @IsEnum(['fixed', 'percent'], { message: 'ITEM_DISCOUNT_INVALID' })
    discountUnit?: 'fixed' | 'percent';

    @ValidateNested()
    @Type(() => StockInputDto)
    stock!: StockInputDto;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
  }
  ```

### Service methods

- [X] T028 [US2] Create `<repo>\backend\src\modules\items\items.service.ts`. Verbatim shell (further methods are added in US5):
  ```ts
  import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    forwardRef,
  } from '@nestjs/common';
  import Decimal from 'decimal.js';
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { MenusService } from '../menus/menus.service';
  import { StorageService } from '../storage/storage.service';
  import { ItemEventLogger } from '../../common/logging/item-event.logger';
  import { CorrelationIdContext } from '../../common/logging/correlation-id.context';
  import { ActorContext } from '../../common/actor-context/actor-context.service'; // confirm exact path; mirror chefs.service
  import { CreateItemDto } from './dto/create-item.dto';
  import { StockInputDto, stockInputToDb, dbToStockOutput } from './dto/stock-input.dto';
  import { effectivePrice } from './effective-price';
  import { randomUUID } from 'crypto';
  import type { Item } from '@prisma/client';

  @Injectable()
  export class ItemsService {
    constructor(
      private readonly prismaService: PrismaService,
      @Inject(forwardRef(() => MenusService))
      private readonly menusService: MenusService,
      private readonly storage: StorageService,
      private readonly itemEventLogger: ItemEventLogger,
      private readonly actorContext: ActorContext,
    ) {}

    /**
     * FR-007: create an item under one of the calling chef's own menus.
     * Caller is responsible for resolving `chefId` via
     * chefs.service.findOwnedOrThrow upstream and passing it in.
     */
    async createItem(menuId: string, chefId: string, dto: CreateItemDto): Promise<ItemWire> {
      await this.menusService.assertMenuOwnedByChefPublic(menuId, chefId);
      this.assertNonNegativeEffectivePrice(dto);

      const created = await this.prismaService.item.create({
        data: {
          menuId,
          name: dto.name as any,
          description: dto.description as any,
          price: new Decimal(dto.price).toFixed(2),
          discountValue: new Decimal(dto.discountValue ?? '0').toFixed(2),
          discountUnit: (dto.discountUnit ?? 'fixed') as any,
          quantity: stockInputToDb(dto.stock),
          isActive: dto.isActive ?? true,
        },
      });
      this.itemEventLogger.emit({
        event: 'item.create',
        outcome: 'success',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef',
        sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: created.id,
      });
      return this.toWire(created);
    }

    /**
     * FR-015: chef-side browse of one menu's items, INCLUDING inactive.
     */
    async findManyForChef(menuId: string, chefId: string): Promise<ItemWire[]> {
      await this.menusService.assertMenuOwnedByChefPublic(menuId, chefId);
      const rows = await this.prismaService.extended.item.findMany({
        where: { menuId },
        orderBy: [
          { displayOrder: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });
      return rows.map((r) => this.toWire(r));
    }

    /**
     * FR-010: refuses combinations that would drive the effective
     * price below 0. The effectivePrice helper itself clamps to 0;
     * the validator only refuses when the CHEF INPUT would have
     * driven it negative — i.e., fixed-discount > price, or
     * percent-discount > 100.
     */
    private assertNonNegativeEffectivePrice(dto: {
      price: string;
      discountValue?: string;
      discountUnit?: 'fixed' | 'percent';
    }): void {
      const unit = dto.discountUnit ?? 'fixed';
      const discount = new Decimal(dto.discountValue ?? '0');
      if (unit === 'fixed' && discount.gt(dto.price)) {
        throw new BadRequestException({ code: 'ITEM_NEGATIVE_EFFECTIVE_PRICE' });
      }
      if (unit === 'percent' && discount.gt(100)) {
        throw new BadRequestException({ code: 'ITEM_NEGATIVE_EFFECTIVE_PRICE' });
      }
    }

    /**
     * Maps a stored Item row to the wire shape (R4): omits the -1
     * sentinel from `quantity`, returns `isUnlimitedStock` and
     * server-computed `inStock`, surfaces both base and effective
     * prices as decimal strings.
     */
    private toWire(item: Item): ItemWire {
      const stock = dbToStockOutput(item.quantity);
      return {
        id: item.id,
        menuId: item.menuId,
        name: item.name as any,
        description: item.description as any,
        price: new Decimal(item.price as unknown as Decimal.Value).toFixed(2),
        effectivePrice: effectivePrice(item as any).toFixed(2),
        discountValue: new Decimal(item.discountValue as unknown as Decimal.Value).toFixed(2),
        discountUnit: item.discountUnit as 'fixed' | 'percent',
        isUnlimitedStock: stock.isUnlimitedStock,
        ...(stock.quantity !== undefined ? { quantity: stock.quantity } : {}),
        inStock: stock.inStock,
        images: item.images,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    }
  }

  export interface ItemWire {
    id: string;
    menuId: string;
    name: { en: string; ar: string };
    description: { en: string; ar: string };
    price: string;
    effectivePrice: string;
    discountValue: string;
    discountUnit: 'fixed' | 'percent';
    isUnlimitedStock: boolean;
    quantity?: number;
    inStock: boolean;
    images: string[];
    displayOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }
  ```
  NOTE: this references `menus.service.assertMenuOwnedByChefPublic` — a public alias of the `assertMenuOwnedByChef` helper from T021. Add the alias to `menus.service.ts` now (just `async assertMenuOwnedByChefPublic(menuId, chefId) { return this.assertMenuOwnedByChef(menuId, chefId); }`). The cross-module call needs to be public.

  The `MenusService` import uses `forwardRef` because `MenusModule` will import `ItemsModule` for the today-available read's items include (T037), creating a circular dep — `forwardRef` resolves it. Mirror the Phase 0 pattern.

  Confirm with `npx tsc --noEmit`.

- [X] T029 [US2] Add `appendImage` to `<repo>\backend\src\modules\items\items.service.ts`. Append to the class body:
  ```ts
  /**
   * FR-012 / FR-013: append a new image to an item's images array.
   * Enforces:
   *   - mime-type ∈ {image/jpeg, image/png, image/webp}
   *   - file size ≤ 3 MB (also enforced upstream by the FileInterceptor)
   *   - the item's current images.length must be < 5 (FR-012 cap)
   *
   * The throttle (FR-012b: 20 / 60 s per chef) is applied at the
   * controller (T031). This service method is called only after the
   * throttle passes.
   */
  async appendImage(
    itemId: string,
    chefId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<ItemWire> {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(mimeType)) {
      this.itemEventLogger.emit({
        event: 'item.image_upload',
        outcome: 'unsupported_media_type',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef',
        sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: itemId,
      });
      throw new BadRequestException({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    }

    const item = await this.findOwnedItemOrThrow(itemId, chefId);
    if (item.images.length >= 5) {
      this.itemEventLogger.emit({
        event: 'item.image_upload',
        outcome: 'images_full',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef',
        sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: itemId,
      });
      throw new BadRequestException({ code: 'ITEM_IMAGES_FULL' });
    }

    const ext =
      mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
    const objectKey = `items/${chefId}/${itemId}/${randomUUID()}.${ext}`;
    const publicUrl = await this.storage.upload('item-images', objectKey, fileBuffer, mimeType);

    const next = [...item.images, publicUrl];
    const updated = await this.prismaService.item.update({
      where: { id: itemId },
      data: { images: { set: next } },
    });

    this.itemEventLogger.emit({
      event: 'item.image_upload',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef',
      sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
    return this.toWire(updated);
  }

  /**
   * Private ownership helper. Walks item → menu → chefId and
   * returns the item when the chain resolves to the calling chef.
   * Throws NotFoundException with code ITEM_NOT_FOUND when the
   * item does not exist, is soft-deleted, OR its owning chef
   * differs from `chefId`. Identical 404 shape across all three.
   */
  private async findOwnedItemOrThrow(itemId: string, chefId: string): Promise<Item> {
    const item = await this.prismaService.extended.item.findFirst({
      where: { id: itemId, menu: { chefId } },
    });
    if (!item) {
      throw new NotFoundException({ code: 'ITEM_NOT_FOUND' });
    }
    return item;
  }
  ```

### Controller

- [X] T030 [US2] Create the per-chef throttle guard AND the `ItemsController`. **First** create `<repo>\backend\src\common\guards\chef-throttler.guard.ts` — verbatim:
  ```ts
  import { Injectable } from '@nestjs/common';
  import { ThrottlerGuard } from '@nestjs/throttler';

  /**
   * Per-chef throttle key derivation for the FR-012b image-upload cap.
   *
   * Phase 3 R1 enforces @unique on Chef.userId — a user has exactly
   * one chef row — so keying by the JWT `sub` (user id) is equivalent
   * to keying by chef id, without a DB lookup inside the throttle
   * check. Apply this guard explicitly via @UseGuards on the upload
   * route ONLY; every other route stays on the global IP-keyed
   * ThrottlerGuard from Phase 1.
   *
   * The global ThrottlerGuard ALSO fires on the upload route and
   * applies its IP-keyed check against the same @Throttle override.
   * The request must pass BOTH the per-IP and the per-user checks —
   * the per-IP backstop is preserved for free (research R3).
   *
   * Falls back to req.ip when req.user is somehow absent (defensive;
   * should never happen because JwtAuthGuard runs first).
   */
  @Injectable()
  export class ChefThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
      return (req.user?.sub as string | undefined) ?? req.ip;
    }
  }
  ```
  No module registration needed — `ChefThrottlerGuard` is consumed via `@UseGuards` directly on the controller method. It does NOT replace the global `ThrottlerGuard`; both fire on the upload route.

  **Then** create `<repo>\backend\src\modules\items\items.controller.ts`. US2 scope: list items, create item, upload image. (US5 extends with PATCH / DELETE / reorder / image-remove.):
  ```ts
  import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors,
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { Throttle } from '@nestjs/throttler';
  import { Request } from 'express';
  import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../../common/guards/roles.guard';
  import { Roles } from '../../common/decorators/roles.decorator';
  import { ChefThrottlerGuard } from '../../common/guards/chef-throttler.guard';
  import { ChefsService } from '../chefs/chefs.service';
  import { ItemsService } from './items.service';
  import { CreateItemDto } from './dto/create-item.dto';

  @ApiTags('ChefItems')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('chef')
  @Controller('api/v1/chef')
  export class ItemsController {
    constructor(
      private readonly itemsService: ItemsService,
      private readonly chefsService: ChefsService,
    ) {}

    @Get('menus/:menuId/items')
    async listItems(@Req() req: Request, @Param('menuId') menuId: string) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      return this.itemsService.findManyForChef(menuId, chef.id);
    }

    @Post('menus/:menuId/items')
    async createItem(
      @Req() req: Request,
      @Param('menuId') menuId: string,
      @Body() dto: CreateItemDto,
    ) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      return this.itemsService.createItem(menuId, chef.id, dto);
    }

    /**
     * FR-012b: per-chef throttle (20 / 60 s). ChefThrottlerGuard
     * (declared in @UseGuards below) overrides the default
     * getTracker to key on req.user.sub (== chef id, per Phase 3 R1).
     * The Phase 1 single-`default`-tier rule is preserved — the
     * @Throttle decorator overrides the same `default` tier's
     * limits per-route, no second tier is introduced.
     *
     * Guard order matters: JwtAuthGuard populates req.user BEFORE
     * ChefThrottlerGuard consults it. The global IP-keyed
     * ThrottlerGuard from Phase 1 also fires and applies the same
     * 20/60s cap by IP — the per-IP backstop is preserved.
     */
    @UseGuards(JwtAuthGuard, ChefThrottlerGuard, RolesGuard)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @Post('items/:id/images')
    @HttpCode(201)
    @UseInterceptors(
      FileInterceptor('file', {
        limits: { fileSize: 3 * 1024 * 1024 },
      }),
    )
    async uploadImage(
      @Req() req: Request,
      @Param('id') itemId: string,
      @UploadedFile() file: Express.Multer.File,
    ) {
      const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
      return this.itemsService.appendImage(itemId, chef.id, file.buffer, file.mimetype);
    }
  }
  ```
  Note: the per-method `@UseGuards(JwtAuthGuard, ChefThrottlerGuard, RolesGuard)` overrides the class-level `@UseGuards(JwtAuthGuard, RolesGuard)` declaration for this route only — the chef throttle guard sits between JWT auth and role check. Every other method in the controller keeps the class-level guard set.

  Create `<repo>\backend\src\modules\items\items.module.ts`:
  ```ts
  import { Module, forwardRef } from '@nestjs/common';
  import { PrismaModule } from '../../common/prisma/prisma.module';
  import { ChefsModule } from '../chefs/chefs.module';
  import { MenusModule } from '../menus/menus.module';
  import { StorageModule } from '../storage/storage.module';
  import { LoggingModule } from '../../common/logging/logging.module';
  import { ItemsController } from './items.controller';
  import { ItemsService } from './items.service';

  @Module({
    imports: [
      PrismaModule,
      ChefsModule,
      forwardRef(() => MenusModule),
      StorageModule,
      LoggingModule,
    ],
    controllers: [ItemsController],
    providers: [ItemsService],
    exports: [ItemsService],
  })
  export class ItemsModule {}
  ```

  Register `ItemsModule` in `<repo>\backend\src\app.module.ts` under `imports: []`. Confirm with `npx tsc --noEmit`.

### Mobile

- [X] T031 [P] [US2] Create `<repo>\mobile\services\items.ts`. Verbatim:
  ```ts
  import { api } from './api';

  export type BilingualText = { en: string; ar: string };
  export interface ChefItem {
    id: string;
    menuId: string;
    name: BilingualText;
    description: BilingualText;
    price: string;
    effectivePrice: string;
    discountValue: string;
    discountUnit: 'fixed' | 'percent';
    isUnlimitedStock: boolean;
    quantity?: number;
    inStock: boolean;
    images: string[];
    displayOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export const itemsService = {
    listForMenu: (menuId: string) =>
      api.get<ChefItem[]>(`/api/v1/chef/menus/${menuId}/items`).then((r) => r.data),
    create: (
      menuId: string,
      body: {
        name: BilingualText;
        description: BilingualText;
        price: string;
        discountValue?: string;
        discountUnit?: 'fixed' | 'percent';
        stock: { isUnlimitedStock: true } | { isUnlimitedStock: false; quantity: number };
        isActive?: boolean;
      },
    ) => api.post<ChefItem>(`/api/v1/chef/menus/${menuId}/items`, body).then((r) => r.data),
    uploadImage: async (itemId: string, file: { uri: string; name: string; type: string }) => {
      const form = new FormData();
      form.append('file', file as any);
      // services/api.ts swaps Content-Type to multipart/form-data when
      // cfg.data instanceof FormData (Phase 3 convention) — do NOT set
      // headers manually here.
      const res = await api.post<ChefItem>(`/api/v1/chef/items/${itemId}/images`, form);
      return res.data;
    },
  };
  ```

- [X] T032 [P] [US2] Create `<repo>\mobile\components\ItemCard.tsx`. The card renders an item per the design-system "item card" mockup (consult `nafas-design-system` skill). Contract:
  - props: `{ item: ChefItem | PublicItem; onAddToCart?: () => void }`
  - renders: first image from `images[]` (or design-system default placeholder when empty); bilingual name (`item.name[isRTL ? 'ar' : 'en']`); discount badge when `discountValue > "0"`; effective price + struck-through base price when `discountValue > "0"`; "Out of stock" overlay when `!inStock`; "Add to cart" CTA only when `onAddToCart` is provided (Phase 5 wires this prop; Phase 4 leaves it `undefined` on the customer-facing chef profile).
  - colors via `useColors()`; layout uses `isRTL`. Zero hex literals.

- [X] T033 [P] [US2] Create `<repo>\mobile\components\ItemEditorSheet.tsx`. Modal that creates OR edits an item. For US2 it only covers create — edit lands in US5. Contract:
  - props: `{ visible: boolean; menuId: string; onClose: () => void; onCreated: (item: ChefItem) => void }`
  - state: `nameEn`, `nameAr`, `descriptionEn`, `descriptionAr`, `priceText`, `discountValueText`, `discountUnit: 'fixed' | 'percent'`, `isUnlimitedStock: boolean`, `quantityText`
  - submit: validate that `priceText` parses as `Decimal > 0`; validate that `discountUnit === 'percent'` → `Decimal(discountValueText) <= 100`; validate that `discountUnit === 'fixed'` → `Decimal(discountValueText) <= Decimal(priceText)`; build the body per the items.ts contract; on success call `onCreated(item)`.
  - errors: server's error `code` mapped via `t('errors.item.' + code.toLowerCase())`.

- [X] T034 [P] [US2] Create `<repo>\mobile\components\ItemImagesDialog.tsx`. Modal that:
  - shows the existing image array as a horizontal carousel (re-uses `ItemCard`'s carousel primitive if extracted, otherwise local).
  - has an "Add Image" CTA that opens `expo-image-picker` (`ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 })`).
  - posts the picked file via `itemsService.uploadImage(itemId, file)`.
  - on success, replaces the local `images` state with the response's `images` array (the server is the source of truth — do NOT optimistically append).
  - on 4xx, displays the error `code` mapped via `t(...)`; specifically:
    - `ITEM_IMAGES_FULL` → "You already have the maximum 5 images for this item."
    - `UNSUPPORTED_MEDIA_TYPE` → "Image must be JPEG, PNG, or WebP."
    - `PAYLOAD_TOO_LARGE` → "Image must be 3 MB or smaller."
    - `ITEM_UPLOAD_RATE_LIMITED` → "You're uploading too fast — please retry shortly." (Phase 4 throttle refusal copy)
  - US5 (T056) extends this dialog with per-image remove.

- [X] T035 [US2] Wire `ItemEditorSheet` + `ItemImagesDialog` into the chef-side menu detail flow. Open `<repo>\mobile\app\(chef)\menu.tsx` (the file extended in T026). Each menu row in the FlatList becomes pressable → opens a per-menu detail screen at `<repo>\mobile\app\(chef)\menu\[id].tsx` (new file). The detail screen:
  1. Fetches `itemsService.listForMenu(menuId)` on mount.
  2. Renders the items as a list (use `ItemCard` from T032 for visual consistency).
  3. Top-right header action: "Add Item" → opens `ItemEditorSheet` with `menuId` prop.
  4. Tapping an item opens `ItemImagesDialog` (US2 scope: upload only; edit + remove land in US5).
  5. On `onCreated`, re-fetch.

  Sketch:
  ```tsx
  // mobile/app/(chef)/menu/[id].tsx
  import React, { useEffect, useState } from 'react';
  import { FlatList, Pressable, View } from 'react-native';
  import { useLocalSearchParams } from 'expo-router';
  import { itemsService, ChefItem } from '../../../services/items';
  import { ItemCard } from '../../../components/ItemCard';
  import { ItemEditorSheet } from '../../../components/ItemEditorSheet';
  import { ItemImagesDialog } from '../../../components/ItemImagesDialog';

  export default function ChefMenuDetailScreen() {
    const { id: menuId } = useLocalSearchParams<{ id: string }>();
    const [items, setItems] = useState<ChefItem[]>([]);
    const [editorOpen, setEditorOpen] = useState(false);
    const [imagesItem, setImagesItem] = useState<ChefItem | null>(null);

    async function refresh() {
      setItems(await itemsService.listForMenu(menuId));
    }
    useEffect(() => {
      refresh();
    }, [menuId]);

    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => setImagesItem(item)}>
              <ItemCard item={item} />
            </Pressable>
          )}
        />
        <ItemEditorSheet
          visible={editorOpen}
          menuId={menuId}
          onClose={() => setEditorOpen(false)}
          onCreated={() => {
            setEditorOpen(false);
            refresh();
          }}
        />
        {imagesItem && (
          <ItemImagesDialog
            item={imagesItem}
            onClose={() => setImagesItem(null)}
            onChanged={(updated) => {
              setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
              setImagesItem(updated);
            }}
          />
        )}
      </View>
    );
  }
  ```
  Adjust per the design-system "chef menu detail" mockup. Verify with `npx tsc --noEmit` from `<repo>\mobile`.

**Checkpoint**: At this point, User Story 2 is fully functional. A verified chef can add items with prices, discounts, stock toggles, and images to a menu via the mobile app. Backend integration tests in T073 / T074 / T075 below cover the API surface.

---

## Phase 5: User Story 3 - Customer reads a chef profile with today-available menus (Priority: P1)

**Goal**: A signed-in customer reading `GET /chefs/:id` sees the Phase 3 header PLUS a today-available menu region. Menus appear only when today's Cairo weekday is included; items inside appear only when `isActive=true` and not soft-deleted. Both base and effective prices are returned.

**Independent Test**: With a Phase 3 verified chef who owns one menu created via US1 (weekday-specific, e.g., Sunday only) AND one menu (every-day) AND items via US2: a signed-in customer reading the chef's profile on a Sunday sees both menu sections; on any other weekday they see only the every-day menu. Discounted items render `effectivePrice` alongside `price`. Soft-deleted / inactive items vanish.

### Service methods

- [X] T036 [US3] Add `findTodayAvailableForChef` to `<repo>\backend\src\modules\menus\menus.service.ts`:
  ```ts
  import { todaysCairoWeekday } from './today-cairo';

  /**
   * FR-017 today-available read for the customer-facing chef profile.
   * A menu is today-available iff availableAllDays=true OR there is
   * a MenuAvailability row for today's Cairo weekday.
   *
   * Returns menus with their items already included AND filtered to
   * isActive=true (FR-018). Soft-deleted menus and items are
   * filtered automatically by the extended client.
   */
  async findTodayAvailableForChef(chefId: string): Promise<MenuWithActiveItems[]> {
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
  }
  ```
  Add type alias: `type MenuWithActiveItems = Prisma.MenuGetPayload<{ include: { items: true } }>;`

- [X] T037 [US3] Extend `chefs.service` with `findFullProfile(chefId)` — a composer that combines the Phase 3 header read with the Phase 4 today-available menu region. Open `<repo>\backend\src\modules\chefs\chefs.service.ts`. The Phase 3 `findOnePublic(chefId)` (or whatever the Phase 3 read is named — look for the method that powers `GET /chefs/:id`) returns the header. Add:
  ```ts
  import { MenusService } from '../menus/menus.service';
  import { ItemsService, ItemWire } from '../items/items.service';
  // Inject MenusService and ItemsService via the constructor.

  /**
   * Phase 4 composer. Combines the Phase 3 chef header with the
   * today-available menu region (FR-017 / FR-018 / FR-019).
   * Refuses unverified / soft-deleted chefs with 404 CHEF_NOT_FOUND
   * (FR-020) — identical shape to a genuinely missing chef.
   */
  async findFullProfile(chefId: string): Promise<ChefPublicProfileWithMenus> {
    const header = await this.findOnePublic(chefId); // Phase 3 method
    if (!header) {
      throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    }
    const menus = await this.menusService.findTodayAvailableForChef(chefId);
    return {
      ...header,
      menus: menus.map((m) => ({
        id: m.id,
        categoryId: m.categoryId,
        name: m.name as any,
        displayOrder: m.displayOrder,
        items: m.items.map((it) => this.itemsService.toPublicWire(it)),
      })),
    };
  }
  ```
  Inject `MenusService` AND `ItemsService` via the constructor; add both module imports to `<repo>\backend\src\modules\chefs\chefs.module.ts`. The `toPublicWire` is a sibling of `toWire` from T028 that OMITS the chef-only fields (`isActive`, `lastFiniteQuantity` if any). Add it to `items.service.ts`:
  ```ts
  /**
   * Customer-facing wire shape. Omits chef-only fields (isActive).
   */
  toPublicWire(item: Item): PublicItemWire {
    const wire = this.toWire(item);
    const { isActive, ...publicWire } = wire;
    return publicWire as PublicItemWire;
  }

  export type PublicItemWire = Omit<ItemWire, 'isActive'>;
  ```
  Add `ChefPublicProfileWithMenus` interface to `<repo>\backend\src\modules\chefs\dto\chef-public-profile.response.dto.ts` (extend the existing Phase 3 type to include `menus`).

- [X] T038 [US3] Extend the chefs controller to use `findFullProfile`. Open `<repo>\backend\src\modules\chefs\chefs-discovery.controller.ts` (the Phase 3 controller that handles `GET /chefs/:id`). Replace the handler body so it calls `chefsService.findFullProfile(id)` instead of the Phase 3 header-only read. The 404 path is unchanged (Phase 3's `findOnePublic` returns `null` → `findFullProfile` throws `NotFoundException` with `code: 'CHEF_NOT_FOUND'`).

### Mobile

- [X] T039 [P] [US3] Create `<repo>\mobile\components\MenuSectionList.tsx`. The component renders the menu region of a chef profile per the design-system mockup. Contract:
  - props: `{ menus: PublicMenuSection[] }` where `PublicMenuSection = { id: string; name: BilingualText; items: PublicItem[] }`
  - renders one collapsible section per menu (use the design-system collapsible-section primitive); each section's body is a list of `ItemCard` instances; empty `menus` → render the "no items available right now" empty state (FR-019).
  - colors via `useColors()`; layout uses `isRTL`.

- [X] T040 [P] [US3] Extend `<repo>\mobile\services\chefs.ts` (Phase 3 file) with a typed `getPublicProfile(chefId)` that returns the new shape:
  ```ts
  export interface PublicMenuSection {
    id: string;
    categoryId: string;
    name: { en: string; ar: string };
    displayOrder: number;
    items: PublicItem[];
  }
  export type PublicItem = Omit<import('./items').ChefItem, 'isActive'>;
  export interface ChefPublicProfileWithMenus {
    // ... Phase 3 header fields ...
    menus: PublicMenuSection[];
  }
  export const chefsService = {
    // ... Phase 3 methods ...
    getPublicProfile: (chefId: string) =>
      api.get<ChefPublicProfileWithMenus>(`/api/v1/chefs/${chefId}`).then((r) => r.data),
  };
  ```
  If Phase 3's `chefsService` already exposes a public-profile getter, REPLACE its return type with `ChefPublicProfileWithMenus` rather than adding a second method.

- [X] T041 [US3] Extend `<repo>\mobile\app\chef\[id].tsx` (the Phase 3 public chef profile screen) to render the menu region. Below the existing Phase 3 header section, add:
  ```tsx
  import { MenuSectionList } from '../../components/MenuSectionList';
  // inside the screen component:
  const [profile, setProfile] = useState<ChefPublicProfileWithMenus | null>(null);
  // ... existing useEffect that fetches the chef ...
  // replace the existing fetch with chefsService.getPublicProfile(id)

  // in the JSX, after the header block:
  <MenuSectionList menus={profile?.menus ?? []} />
  ```
  Verify with `npx tsc --noEmit` from `<repo>\mobile`. Confirm the screen still renders the Phase 3 header correctly.

**Checkpoint**: At this point, User Story 3 is fully functional. A customer reading a verified chef's profile on a real device sees the today-available menu region with discounted prices and image carousels.

---

## Phase 6: User Story 4 - Customer uses Home and Explore (Priority: P1)

**Goal**: Home renders greeting + open-chefs scroll + category chips + top-rated grid in one round-trip. Tapping a category chip routes to Explore with that filter pre-applied. Explore search debounces and cancels in-flight requests.

**Independent Test**: With at least three Phase 3 verified chefs seeded (two open in different categories, one closed), a signed-in customer opens Home and sees both open chefs in the scroll, the category chip ribbon populated, and at least one chef in the top-rated grid. Tapping a chip lands on Explore pre-filtered.

### Backend

- [X] T042 [US4] Create `<repo>\backend\src\modules\home\home.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { ChefsModule } from '../chefs/chefs.module';
  import { CategoriesModule } from '../categories/categories.module';
  import { UsersModule } from '../users/users.module';
  import { HomeController } from './home.controller';
  import { HomeService } from './home.service';

  @Module({
    imports: [ChefsModule, CategoriesModule, UsersModule],
    controllers: [HomeController],
    providers: [HomeService],
  })
  export class HomeModule {}
  ```

- [X] T043 [US4] Create `<repo>\backend\src\modules\home\home.service.ts`:
  ```ts
  import { Injectable } from '@nestjs/common';
  import { ChefsService } from '../chefs/chefs.service';
  import { CategoriesService } from '../categories/categories.service';
  import { UsersService } from '../users/users.service';

  @Injectable()
  export class HomeService {
    constructor(
      private readonly chefsService: ChefsService,
      private readonly categoriesService: CategoriesService,
      private readonly usersService: UsersService,
    ) {}

    /**
     * FR-021 + FR-022: composes the four Home strips in one round-trip.
     * Never reads prisma.* directly (Constitution Principle III).
     */
    async findHomeForUser(userId: string) {
      const user = await this.usersService.findOneOrThrow(userId);
      const [openChefs, categories, topRated] = await Promise.all([
        this.chefsService.findManyForDiscovery({ isOpen: true, pageSize: 20 } as any),
        this.categoriesService.listActive(),
        this.chefsService.findTopRated(12),
      ]);
      return {
        greeting: { userFirstName: user.firstName ?? user.fullName ?? '' },
        openChefs,
        categories,
        topRated,
      };
    }
  }
  ```
  If `findManyForDiscovery` requires a different shape, adapt the call; the Phase 3 method signature is the source of truth. If `users.service.findOneOrThrow` is named differently, use whatever Phase 1 / 3 exposes.

- [X] T044 [US4] Create `<repo>\backend\src\modules\home\home.controller.ts`:
  ```ts
  import { Controller, Get, Req, UseGuards } from '@nestjs/common';
  import { Request } from 'express';
  import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { HomeService } from './home.service';

  @ApiTags('Home')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Controller('home')
  export class HomeController {
    constructor(private readonly homeService: HomeService) {}

    @Get()
    async getHome(@Req() req: JwtRequest) {
      return this.homeService.findHomeForUser(req.user.sub);
    }
  }
  ```
  The global route prefix `api/v1` is applied by the NestJS bootstrap (`app.setGlobalPrefix('api/v1')`), so the controller uses `'home'` (not `'api/v1/home'`) to avoid a doubled prefix. Mobile clients call `GET /api/v1/home`. Register `HomeModule` in `<repo>\backend\src\app.module.ts`. Confirm with `npx tsc --noEmit`.

### Mobile

- [X] T045 [P] [US4] Create `<repo>\mobile\services\home.ts`:
  ```ts
  import { api } from './api';

  export interface HomePayload {
    greeting: { userFirstName: string };
    openChefs: ChefCard[];
    categories: Category[];
    topRated: ChefCard[];
  }
  export interface ChefCard {
    id: string;
    chefName: string;
    logo: string;
    ratings: string;
    totalReviews: number;
    currentlyOpen: boolean;
    distanceKm?: number;
  }
  export interface Category {
    id: string;
    name: { en: string; ar: string };
    icon: string;
    displayOrder: number;
  }
  export const homeService = {
    get: () => api.get<HomePayload>('/api/v1/home').then((r) => r.data),
  };
  ```

- [X] T046 [P] [US4] ~~Create `<repo>\mobile\hooks\useDebouncedDiscovery.ts`.~~ **Retracted in review fixes**: the Phase 3 explore screen already implements debouncing + a `filterEpochRef` stale-response guard that's more capable than this hook (handles pagination, retry-on-error, and multi-dimensional filter changes). T048 keeps the Phase 3 fetch and the standalone hook is not needed. Original verbatim spec retained below for historical reference only:
  ```ts
  import { useEffect, useRef, useState } from 'react';
  import { api } from '../services/api';
  import type { ChefCard } from '../services/home';

  interface UseDebouncedDiscoveryArgs {
    q: string;
    categoryId?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    enabled?: boolean;
    debounceMs?: number;
  }

  /**
   * FR-024: debounces search input and cancels in-flight requests
   * via AbortController. Returns { chefs, isLoading, error }.
   */
  export function useDebouncedDiscovery({
    q,
    categoryId,
    lat,
    lng,
    radiusKm,
    enabled = true,
    debounceMs = 300,
  }: UseDebouncedDiscoveryArgs) {
    const [chefs, setChefs] = useState<ChefCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
      if (!enabled) return;
      const timer = setTimeout(async () => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setIsLoading(true);
        setError(null);
        try {
          const res = await api.get<ChefCard[]>('/api/v1/chefs', {
            params: { q: q || undefined, categoryId, lat, lng, radiusKm },
            signal: controller.signal as any,
          });
          setChefs(res.data);
        } catch (err) {
          if ((err as any)?.name === 'CanceledError' || (err as any)?.name === 'AbortError') return;
          setError(err);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
      return () => clearTimeout(timer);
    }, [q, categoryId, lat, lng, radiusKm, enabled, debounceMs]);

    return { chefs, isLoading, error };
  }
  ```

- [X] T047 [P] [US4] Fill in the Home screen at `<repo>\mobile\app\(tabs)\index.tsx` (Phase 3 placeholder). Consult the design-system "customer home" mockup. Sketch:
  ```tsx
  import React, { useEffect, useState } from 'react';
  import { ScrollView, View, Text, FlatList, Pressable } from 'react-native';
  import { useRouter } from 'expo-router';
  import { useColors } from '../../hooks/useColors';
  import { useTranslation } from '../../hooks/useTranslation';
  import { homeService, HomePayload } from '../../services/home';

  export default function HomeScreen() {
    const colors = useColors();
    const { t, isRTL } = useTranslation();
    const router = useRouter();
    const [data, setData] = useState<HomePayload | null>(null);

    useEffect(() => {
      homeService.get().then(setData);
    }, []);

    if (!data) return null;
    return (
      <ScrollView style={{ backgroundColor: colors.background }}>
        <Text style={{ padding: 16, color: colors.text, fontSize: 24 }}>
          {t('home.greeting', { name: data.greeting.userFirstName })}
        </Text>
        {/* Open chefs scroll */}
        <Text style={{ paddingHorizontal: 16, color: colors.text }}>{t('home.openChefs')}</Text>
        <FlatList
          horizontal
          data={data.openChefs}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/chef/${item.id}`)} style={{ padding: 12 }}>
              <Text style={{ color: colors.text }}>{item.chefName}</Text>
            </Pressable>
          )}
        />
        {/* Category chips */}
        <Text style={{ paddingHorizontal: 16, color: colors.text }}>{t('home.categories')}</Text>
        <FlatList
          horizontal
          data={data.categories}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(tabs)/explore', params: { categoryId: item.id } })}
              style={{ paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.text }}>{item.name[isRTL ? 'ar' : 'en']}</Text>
            </Pressable>
          )}
        />
        {/* Top-rated grid */}
        <Text style={{ paddingHorizontal: 16, color: colors.text }}>{t('home.topRated')}</Text>
        {/* Render data.topRated as a 2-column grid via design-system grid primitive */}
      </ScrollView>
    );
  }
  ```
  Adjust the JSX to the design-system "customer home" mockup. Confirm with `npx tsc --noEmit`.

- [X] T048 [P] [US4] Extend `<repo>\mobile\app\(tabs)\explore.tsx` (Phase 3 file, exists from US-level wiring of the discovery screen) to:
  - read `useLocalSearchParams<{ categoryId?: string }>()` to honour the pre-filter from Home (T047);
  - use the Phase 3 Explore fetch flow (epoch-guarded `fetchChefs` + cursor pagination) — `useDebouncedDiscovery` (T046) is retained as a standalone hook but the Explore screen keeps the Phase 3 discovery approach because it supports load-more pagination that the hook does not;
  - render a "Clear filter" pill near the search input when `categoryId` is set, which clears the param via `router.setParams({ categoryId: undefined })`.

  Confirm with `npx tsc --noEmit`.

**Checkpoint**: At this point, User Story 4 is fully functional. The customer lands on Home, taps a category chip → lands on Explore pre-filtered, types a search → at most one in-flight request at a time. Backend integration test in T077 below covers the API surface.

---

## Phase 7: User Story 5 - Verified chef maintains catalogue (Priority: P2)

**Goal**: A chef can edit menu / item fields, toggle `Item.isActive`, soft-delete menus / items, bulk-reorder menus and items, and remove individual item images.

**Independent Test**: With a Phase 3 chef + US1 menu + US2 items, the chef can `PATCH /chef/menus/:id`, `DELETE /chef/menus/:id`, `PATCH /chef/items/:id`, `DELETE /chef/items/:id`, `PATCH /chef/menus/reorder`, `PATCH /chef/menus/:menuId/items/reorder`, `DELETE /chef/items/:id/images/:imageKey`. Each refused for cross-chef targets, each idempotent where the spec calls for it.

### DTOs

- [ ] T049 [P] [US5] Create `<repo>\backend\src\modules\menus\dto\update-menu.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import { IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';
  import { MenuName60 } from './bilingual-text.dto';

  export class UpdateMenuDto {
    @IsOptional() @ValidateNested() @Type(() => MenuName60)
    name?: InstanceType<typeof MenuName60>;

    @IsOptional() @IsUUID('4', { message: 'CATEGORY_NOT_FOUND' })
    categoryId?: string;

    @IsOptional() @IsBoolean()
    availableAllDays?: boolean;
  }
  ```
  DO NOT declare `displayOrder` (display order is reorder-endpoint-only — R5).

- [ ] T050 [P] [US5] Create `<repo>\backend\src\modules\menus\dto\reorder-menus.dto.ts`:
  ```ts
  import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

  export class ReorderMenusDto {
    @IsArray()
    @ArrayMinSize(1, { message: 'MENUS_REORDER_NOT_EXACT_SET' })
    @ArrayUnique({ message: 'MENUS_REORDER_NOT_EXACT_SET' })
    @IsUUID('4', { each: true, message: 'MENUS_REORDER_NOT_EXACT_SET' })
    menuIds!: string[];
  }
  ```

- [ ] T051 [P] [US5] Create `<repo>\backend\src\modules\items\dto\update-item.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import {
    IsBoolean,
    IsEnum,
    IsNumberString,
    IsOptional,
    ValidateNested,
  } from 'class-validator';
  import { ItemName60, ItemDescription500 } from '../../menus/dto/bilingual-text.dto';
  import { StockInputDto } from './stock-input.dto';

  export class UpdateItemDto {
    @IsOptional() @ValidateNested() @Type(() => ItemName60)
    name?: InstanceType<typeof ItemName60>;

    @IsOptional() @ValidateNested() @Type(() => ItemDescription500)
    description?: InstanceType<typeof ItemDescription500>;

    @IsOptional() @IsNumberString({ no_symbols: false }, { message: 'ITEM_PRICE_INVALID' })
    price?: string;

    @IsOptional() @IsNumberString({ no_symbols: false }, { message: 'ITEM_DISCOUNT_INVALID' })
    discountValue?: string;

    @IsOptional() @IsEnum(['fixed', 'percent'], { message: 'ITEM_DISCOUNT_INVALID' })
    discountUnit?: 'fixed' | 'percent';

    @IsOptional() @ValidateNested() @Type(() => StockInputDto)
    stock?: StockInputDto;

    @IsOptional() @IsBoolean()
    isActive?: boolean;
  }
  ```
  DO NOT declare `displayOrder` or `images`.

- [ ] T052 [P] [US5] Create `<repo>\backend\src\modules\items\dto\reorder-items.dto.ts`:
  ```ts
  import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

  export class ReorderItemsDto {
    @IsArray()
    @ArrayMinSize(1, { message: 'ITEMS_REORDER_NOT_EXACT_SET' })
    @ArrayUnique({ message: 'ITEMS_REORDER_NOT_EXACT_SET' })
    @IsUUID('4', { each: true, message: 'ITEMS_REORDER_NOT_EXACT_SET' })
    itemIds!: string[];
  }
  ```

### Service methods

- [ ] T053 [US5] Add `updateMenu` + `softDeleteMenu` + `reorderMenus` to `<repo>\backend\src\modules\menus\menus.service.ts`:
  ```ts
  async updateMenu(menuId: string, chefId: string, dto: UpdateMenuDto): Promise<MenuWithAvailability> {
    await this.assertMenuOwnedByChef(menuId, chefId);
    if (dto.categoryId) {
      await this.categoriesService.findOneActiveOrThrow(dto.categoryId);
    }
    const updated = await this.prismaService.menu.update({
      where: { id: menuId },
      data: {
        ...(dto.name ? { name: dto.name as any } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.availableAllDays !== undefined ? { availableAllDays: dto.availableAllDays } : {}),
      },
      include: { availability: true },
    });
    this.menuEventLogger.emit({
      event: 'menu.update', outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menuId,
    });
    return updated;
  }

  async softDeleteMenu(menuId: string, chefId: string): Promise<void> {
    await this.assertMenuOwnedByChef(menuId, chefId);
    await this.prismaService.menu.softDelete({ id: menuId });
    this.menuEventLogger.emit({
      event: 'menu.soft_delete', outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
      targetMenuId: menuId,
    });
  }

  /**
   * FR-002a: atomic dense renumber. The submitted menuIds MUST be
   * an exact cover of the chef's current non-soft-deleted menus.
   */
  async reorderMenus(chefId: string, orderedMenuIds: string[]): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      const currentRows = await tx.menu.findMany({
        where: { chefId, deletedAt: null },
        select: { id: true },
      });
      this.assertExactSet(
        currentRows.map((r) => r.id),
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
    this.menuEventLogger.emit({
      event: 'menu.reorder', outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
    });
  }

  private assertExactSet(current: string[], submitted: string[], errorCode: string): void {
    const currentSet = new Set(current);
    const submittedSet = new Set(submitted);
    if (
      currentSet.size !== submittedSet.size ||
      submitted.length !== submittedSet.size ||
      [...submittedSet].some((id) => !currentSet.has(id))
    ) {
      throw new BadRequestException({ code: errorCode });
    }
  }
  ```
  Add `import { BadRequestException } from '@nestjs/common';` and `import { UpdateMenuDto } from './dto/update-menu.dto';`.

- [ ] T054 [US5] Add `updateItem` + `softDeleteItem` + `reorderItems` + `removeImage` to `<repo>\backend\src\modules\items\items.service.ts`. Append to the class body (in the order shown):
  ```ts
  async updateItem(itemId: string, chefId: string, dto: UpdateItemDto): Promise<ItemWire> {
    const item = await this.findOwnedItemOrThrow(itemId, chefId);
    if (dto.price !== undefined || dto.discountValue !== undefined || dto.discountUnit !== undefined) {
      const next = {
        price: dto.price ?? (item.price as unknown as string),
        discountValue: dto.discountValue ?? (item.discountValue as unknown as string),
        discountUnit: dto.discountUnit ?? (item.discountUnit as 'fixed' | 'percent'),
      };
      this.assertNonNegativeEffectivePrice(next);
    }
    const updated = await this.prismaService.item.update({
      where: { id: itemId },
      data: {
        ...(dto.name ? { name: dto.name as any } : {}),
        ...(dto.description ? { description: dto.description as any } : {}),
        ...(dto.price !== undefined ? { price: new Decimal(dto.price).toFixed(2) } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: new Decimal(dto.discountValue).toFixed(2) } : {}),
        ...(dto.discountUnit !== undefined ? { discountUnit: dto.discountUnit as any } : {}),
        ...(dto.stock !== undefined ? { quantity: stockInputToDb(dto.stock) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    const onlyActive =
      Object.keys(dto).length === 1 && dto.isActive !== undefined;
    this.itemEventLogger.emit({
      event: onlyActive ? 'item.active_toggle' : 'item.update',
      outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
    return this.toWire(updated);
  }

  async softDeleteItem(itemId: string, chefId: string): Promise<void> {
    await this.findOwnedItemOrThrow(itemId, chefId);
    await this.prismaService.item.softDelete({ id: itemId });
    this.itemEventLogger.emit({
      event: 'item.soft_delete', outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
  }

  /**
   * FR-009a: atomic dense renumber inside one transaction. Ownership
   * is re-derived inside the transaction so a stale menuId can't slip
   * past.
   */
  async reorderItems(menuId: string, chefId: string, orderedItemIds: string[]): Promise<void> {
    await this.menusService.assertMenuOwnedByChefPublic(menuId, chefId);
    await this.prismaService.$transaction(async (tx) => {
      const currentRows = await tx.item.findMany({
        where: { menuId, deletedAt: null },
        select: { id: true },
      });
      const currentSet = new Set(currentRows.map((r) => r.id));
      const submittedSet = new Set(orderedItemIds);
      if (
        currentSet.size !== submittedSet.size ||
        orderedItemIds.length !== submittedSet.size ||
        [...submittedSet].some((id) => !currentSet.has(id))
      ) {
        throw new BadRequestException({ code: 'ITEMS_REORDER_NOT_EXACT_SET' });
      }
      for (let i = 0; i < orderedItemIds.length; i++) {
        await tx.item.update({
          where: { id: orderedItemIds[i] },
          data: { displayOrder: i },
        });
      }
    });
    this.itemEventLogger.emit({
      event: 'item.reorder', outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
    });
  }

  /**
   * FR-012a: idempotent per-image remove. The `imageKey` is the
   * storage object key suffix (everything after the bucket name in
   * the public URL). Stable across concurrent edits — does NOT
   * depend on array indices.
   */
  async removeImage(itemId: string, chefId: string, imageKey: string): Promise<ItemWire> {
    const item = await this.findOwnedItemOrThrow(itemId, chefId);
    const remaining = item.images.filter((u) => !u.endsWith(imageKey));
    if (remaining.length === item.images.length) {
      // Idempotent: already gone.
      this.itemEventLogger.emit({
        event: 'item.image_remove', outcome: 'success',
        actorUserId: this.actorContext.getUserId() ?? null,
        actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
        targetItemId: itemId,
      });
      return this.toWire(item);
    }
    const updated = await this.prismaService.item.update({
      where: { id: itemId },
      data: { images: { set: remaining } },
    });
    // Best-effort storage cleanup — mirrors Phase 3 chef-logo replacement.
    this.storage.delete('item-images', imageKey).catch((err) => {
      // Logger.error from a wrapper; do not throw.
      console.error('storage.delete failed', { imageKey, err });
    });
    this.itemEventLogger.emit({
      event: 'item.image_remove', outcome: 'success',
      actorUserId: this.actorContext.getUserId() ?? null,
      actorRole: 'chef', sourceIp: this.actorContext.getSourceIp() ?? null,
      targetItemId: itemId,
    });
    return this.toWire(updated);
  }
  ```
  Add `import { UpdateItemDto } from './dto/update-item.dto';`. Confirm with `npx tsc --noEmit`.

### Controllers (extend US1 / US2 controllers)

- [ ] T055 [US5] Extend `<repo>\backend\src\modules\menus\menus.controller.ts` with the missing verbs. Add methods (alongside the US1 methods):
  ```ts
  @Patch('reorder')
  @HttpCode(204)
  async reorderMenus(@Req() req: Request, @Body() dto: ReorderMenusDto) {
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    await this.menusService.reorderMenus(chef.id, dto.menuIds);
  }

  @Patch(':id')
  async updateMenu(@Req() req: Request, @Param('id') menuId: string, @Body() dto: UpdateMenuDto) {
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    return this.menusService.updateMenu(menuId, chef.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async softDeleteMenu(@Req() req: Request, @Param('id') menuId: string) {
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    await this.menusService.softDeleteMenu(menuId, chef.id);
  }
  ```
  Add imports: `import { Patch } from '@nestjs/common';`, `import { UpdateMenuDto } from './dto/update-menu.dto';`, `import { ReorderMenusDto } from './dto/reorder-menus.dto';`. **CRITICAL**: declare `@Patch('reorder')` BEFORE `@Patch(':id')` so the route resolver matches `/reorder` literally rather than treating `'reorder'` as a UUID path param.

- [ ] T056 [US5] Extend `<repo>\backend\src\modules\items\items.controller.ts` with the missing verbs. Add (alongside the US2 methods):
  ```ts
  @Patch('menus/:menuId/items/reorder')
  @HttpCode(204)
  async reorderItems(
    @Req() req: Request, @Param('menuId') menuId: string, @Body() dto: ReorderItemsDto,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    await this.itemsService.reorderItems(menuId, chef.id, dto.itemIds);
  }

  @Patch('items/:id')
  async updateItem(@Req() req: Request, @Param('id') itemId: string, @Body() dto: UpdateItemDto) {
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    return this.itemsService.updateItem(itemId, chef.id, dto);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async softDeleteItem(@Req() req: Request, @Param('id') itemId: string) {
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    await this.itemsService.softDeleteItem(itemId, chef.id);
  }

  @Delete('items/:id/images')
  @HttpCode(200)
  async removeImage(
    @Req() req: Request,
    @Param('id') itemId: string,
    @Query('key') imageKey: string,
  ) {
    // FR-012a: the image key is a query parameter (?key=...) rather
    // than a path param. The storage object key contains slashes
    // (items/<chefId>/<itemId>/<uuid>.ext) which would otherwise
    // require a NestJS wildcard route or per-route URL-decoding
    // workarounds. A query param sidesteps both — standard URL
    // encoding handles the slashes transparently on every HTTP
    // client.
    if (!imageKey || imageKey.length === 0) {
      throw new BadRequestException({ code: 'IMAGE_KEY_REQUIRED' });
    }
    const chef = await this.chefsService.findOwnedOrThrow(req.user!.sub);
    return this.itemsService.removeImage(itemId, chef.id, imageKey);
  }
  ```
  Add imports: `import { Patch, Query, BadRequestException } from '@nestjs/common';`, `import { UpdateItemDto } from './dto/update-item.dto';`, `import { ReorderItemsDto } from './dto/reorder-items.dto';`. Confirm with `npx tsc --noEmit`.

### Mobile

- [ ] T057 [P] [US5] Extend `<repo>\mobile\services\menus.ts` with the missing methods:
  ```ts
  // Append to the menusService object:
  update: (menuId: string, body: { name?: BilingualText; categoryId?: string; availableAllDays?: boolean }) =>
    api.patch<ChefMenu>(`/api/v1/chef/menus/${menuId}`, body).then((r) => r.data),
  remove: (menuId: string) => api.delete<void>(`/api/v1/chef/menus/${menuId}`),
  reorder: (menuIds: string[]) => api.patch<void>(`/api/v1/chef/menus/reorder`, { menuIds }),
  ```

- [ ] T058 [P] [US5] Extend `<repo>\mobile\services\items.ts` with the missing methods:
  ```ts
  // Append to itemsService:
  update: (
    itemId: string,
    body: Partial<{
      name: BilingualText;
      description: BilingualText;
      price: string;
      discountValue: string;
      discountUnit: 'fixed' | 'percent';
      stock: { isUnlimitedStock: true } | { isUnlimitedStock: false; quantity: number };
      isActive: boolean;
    }>,
  ) => api.patch<ChefItem>(`/api/v1/chef/items/${itemId}`, body).then((r) => r.data),
  remove: (itemId: string) => api.delete<void>(`/api/v1/chef/items/${itemId}`),
  reorder: (menuId: string, itemIds: string[]) =>
    api.patch<void>(`/api/v1/chef/menus/${menuId}/items/reorder`, { itemIds }),
  removeImage: (itemId: string, imageKey: string) =>
    // FR-012a: imageKey goes via `?key=` query param — axios handles
    // URL-encoding of slashes in the value transparently.
    api
      .delete<ChefItem>(`/api/v1/chef/items/${itemId}/images`, { params: { key: imageKey } })
      .then((r) => r.data),
  ```

- [ ] T059 [P] [US5] Extend `MenuEditorSheet` (T025) to support an `editing?: ChefMenu` prop that pre-fills the form and submits via `menusService.update(menuId, body)` instead of `create`. Wire a "Delete menu" action behind a confirm dialog that calls `menusService.remove(menuId)`. Both actions call an `onChanged()` prop so the screen can re-fetch.

- [ ] T060 [P] [US5] Extend `ItemEditorSheet` (T033) symmetrically — `editing?: ChefItem` prop, submit via `itemsService.update`, "Delete item" action calling `itemsService.remove`.

- [ ] T061 [P] [US5] Extend `ItemImagesDialog` (T034) with a per-image remove action. Each image in the carousel gets a small overlay "remove" button (design-system trash icon at top-right of the thumbnail). On press, show a confirm dialog ("Remove this image?") and on confirm call `itemsService.removeImage(itemId, imageKey)`. Derive `imageKey` from the URL — the storage object key is everything after `/storage/v1/object/public/item-images/` in the Supabase URL. Example: for `https://<project>.supabase.co/storage/v1/object/public/item-images/items/<chefId>/<itemId>/<uuid>.<ext>`, `imageKey = items/<chefId>/<itemId>/<uuid>.<ext>`. Helper:
  ```ts
  function imageKeyFromUrl(publicUrl: string): string {
    const marker = '/storage/v1/object/public/item-images/';
    const i = publicUrl.indexOf(marker);
    if (i === -1) throw new Error('unexpected supabase URL shape');
    return publicUrl.slice(i + marker.length);
  }
  ```
  The backend `items.controller` reads the key via `?key=...` query param (T056), so the slash-containing value travels through axios's `params: { key: imageKey }` (T058) and is URL-encoded automatically — no NestJS wildcard route is involved.

- [ ] T062 [P] [US5] Add drag-reorder to the chef-side menu list and item list. Use `react-native-reanimated`'s gesture handler (already in the deps from Phase 0). On reorder commit, call `menusService.reorder(orderedIds)` or `itemsService.reorder(menuId, orderedIds)`. On error (e.g., `MENUS_REORDER_NOT_EXACT_SET` from a stale client view), refresh the list and surface a clear in-app message via `t(...)`. Use the design-system reorder pattern (long-press to enter reorder mode, "Save Order" / "Cancel" buttons).

- [ ] T063 [P] [US5] Create `<repo>\mobile\context\ChefMenuContext.tsx` to hold the chef-side editor's optimistic state (current menu list, in-flight drafts, pending reorder buffer). The context exposes `{ menus, refresh, reorderMenus, ... }`. Wraps the chef tab subtree (`<ChefMenuProvider>` in `app/(chef)/_layout.tsx`).

**Checkpoint**: At this point, User Story 5 is fully functional. A chef can fully edit + soft-delete + reorder + remove individual images. Backend tests in T078 below cover the reorder atomicity.

---

## Phase 8: User Story 6 - Bilingual + RTL parity (Priority: P3)

**Goal**: Every Phase 4 customer-facing AND chef-facing surface renders correctly in both English and Arabic, including RTL layout in Arabic.

**Independent Test**: An Arabic-language customer exercises Home, a chef profile (with at least one discounted item and one out-of-stock item), Explore (search + category filter); every visible string is Arabic with right-to-left layout. An Arabic-language chef exercises the menu editor, item editor, image dialog, day-picker, every validation error — all in Arabic with RTL. Toggling to English re-renders everything in English without an app restart.

- [ ] T064 [P] [US6] Add Phase 4 English i18n keys to `<repo>\mobile\constants\i18n\en.ts`. Append a `phase4` namespace (or merge into the existing `chef.*` / `customer.*` / `errors.*` namespaces — match the file's convention). Required keys at minimum (all referenced by T024 – T063):
  ```
  common.day.sun = "Sun"
  common.day.mon = "Mon"
  common.day.tue = "Tue"
  common.day.wed = "Wed"
  common.day.thu = "Thu"
  common.day.fri = "Fri"
  common.day.sat = "Sat"

  home.greeting = "Hello, {name}"
  home.openChefs = "Open kitchens"
  home.categories = "Browse by cuisine"
  home.topRated = "Top-rated chefs"
  home.empty.noChefs = "No chefs available yet — check back soon."

  chef.menu.title = "My menus"
  chef.menu.create = "Create menu"
  chef.menu.empty = "You have no menus yet. Create your first menu to start adding items."
  chef.menu.row.name = "{name}"
  chef.menu.editor.name.en = "Menu name (English)"
  chef.menu.editor.name.ar = "Menu name (Arabic)"
  chef.menu.editor.category = "Cuisine category"
  chef.menu.editor.availability = "Availability"
  chef.menu.editor.everyDay = "Available every day"
  chef.menu.editor.specificDays = "Specific days"
  chef.menu.editor.submit = "Create menu"
  chef.menu.editor.update = "Save changes"
  chef.menu.editor.delete = "Delete menu"

  chef.item.create = "Add item"
  chef.item.editor.name.en = "Item name (English)"
  chef.item.editor.name.ar = "Item name (Arabic)"
  chef.item.editor.description.en = "Description (English)"
  chef.item.editor.description.ar = "Description (Arabic)"
  chef.item.editor.price = "Price (EGP)"
  chef.item.editor.discount = "Discount"
  chef.item.editor.discountUnit.fixed = "Fixed amount"
  chef.item.editor.discountUnit.percent = "Percent"
  chef.item.editor.stock = "Stock"
  chef.item.editor.stock.unlimited = "Unlimited"
  chef.item.editor.stock.quantity = "Quantity"
  chef.item.images.add = "Add image"
  chef.item.images.remove = "Remove image"
  chef.item.images.full = "You already have the maximum 5 images for this item."

  customer.profile.menu.empty = "No items available right now."
  customer.item.outOfStock = "Out of stock"
  customer.item.discountBadge = "{discount}% off"

  errors.menu.menu_name_required = "Menu name is required in both English and Arabic."
  errors.menu.menu_name_too_long_en = "Menu name (English) must be 60 characters or fewer."
  errors.menu.menu_name_too_long_ar = "Menu name (Arabic) must be 60 characters or fewer."
  errors.menu.category_not_found = "Selected category is no longer available — please pick another."
  errors.menu.menu_availability_invalid_weekday = "Weekday selection is invalid."
  errors.menu.menus_reorder_not_exact_set = "Your menu list changed while reordering. Please retry."
  errors.menu.menu_not_found = "This menu is not available."

  errors.item.item_name_required = "Item name is required in both English and Arabic."
  errors.item.item_name_too_long_en = "Item name (English) must be 60 characters or fewer."
  errors.item.item_name_too_long_ar = "Item name (Arabic) must be 60 characters or fewer."
  errors.item.item_description_required = "Item description is required in both English and Arabic."
  errors.item.item_description_too_long_en = "Item description (English) must be 500 characters or fewer."
  errors.item.item_description_too_long_ar = "Item description (Arabic) must be 500 characters or fewer."
  errors.item.item_price_invalid = "Price must be a positive number with up to 2 decimal places."
  errors.item.item_discount_invalid = "Discount value must be a non-negative number."
  errors.item.item_negative_effective_price = "Discount cannot make the price negative."
  errors.item.item_stock_ambiguous = "Stock setting is inconsistent — pick either 'unlimited' OR a finite count."
  errors.item.item_images_full = "You already have the maximum 5 images for this item."
  errors.item.item_upload_rate_limited = "You're uploading too fast — please retry shortly."
  errors.item.payload_too_large = "Image must be 3 MB or smaller."
  errors.item.unsupported_media_type = "Image must be JPEG, PNG, or WebP."
  errors.item.item_not_found = "This item is not available."
  errors.item.items_reorder_not_exact_set = "Your item list changed while reordering. Please retry."
  ```
  Use the file's existing key-namespacing convention (some projects use dotted strings literally, others nest objects). Match whichever Phase 3 used in `<repo>\mobile\constants\i18n\en.ts`.

- [ ] T065 [P] [US6] Mirror every T064 key into `<repo>\mobile\constants\i18n\ar.ts` with Arabic translations. Keep the keys identical to en.ts (the locale parity check in T084 enforces this). Examples:
  ```
  common.day.sun = "الأحد"
  common.day.mon = "الإثنين"
  ...
  home.greeting = "أهلاً، {name}"
  home.openChefs = "مطابخ مفتوحة"
  home.categories = "تصفّح حسب المطبخ"
  home.topRated = "أعلى تقييمًا"
  ...
  chef.menu.title = "قوائمي"
  ...
  errors.menu.menu_name_too_long_en = "اسم القائمة بالإنجليزية يجب أن يكون 60 حرفًا أو أقل."
  ...
  ```
  Have a native Arabic reviewer pass over the wording before merge — auto-translated strings frequently misuse classical-vs-colloquial register.

- [ ] T066 [US6] Audit every new Phase 4 mobile component for design-system compliance: zero hex literals (search for `#` in the new component files); every visible string sourced via `t(key)`; every `flexDirection` reads from `isRTL`. Run a grep:
  ```powershell
  Select-String -Path "<repo>\mobile\components\MenuSectionList.tsx","<repo>\mobile\components\ItemCard.tsx","<repo>\mobile\components\DayOfWeekPicker.tsx","<repo>\mobile\components\ItemImagesDialog.tsx","<repo>\mobile\components\MenuEditorSheet.tsx","<repo>\mobile\components\ItemEditorSheet.tsx","<repo>\mobile\app\(tabs)\index.tsx","<repo>\mobile\app\(chef)\menu.tsx","<repo>\mobile\app\(chef)\menu\[id].tsx","<repo>\mobile\app\chef\[id].tsx","<repo>\mobile\app\(tabs)\explore.tsx" -Pattern "#[0-9A-Fa-f]{3,8}" -SimpleMatch:$false
  ```
  Expect ZERO matches. Any match is a hex-literal regression — replace with a `useColors()` token.

- [ ] T067 [US6] Manual real-device locale toggle pass. Run quickstart.md Step 8 (Bilingual + RTL parity) on a real iOS device AND a real Android device. Confirm every surface listed in the step renders correctly in both locales.

**Checkpoint**: At this point, User Story 6 is fully functional. The bilingual + RTL contract holds end-to-end across every Phase 4 surface.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Backend integration tests, locale parity check, observability sweep, Swagger doc completeness, IMPLEMENTATION_PLAN housekeeping.

### Backend integration tests

- [ ] T068 [P] Create `<repo>\backend\test\menus.e2e-spec.ts`. Cover: `POST /chef/menus` happy path; `POST /chef/menus` with empty Arabic name → 400 `MENU_NAME_REQUIRED`; `POST /chef/menus` with 61-char English name → 400 `MENU_NAME_TOO_LONG_EN`; `POST /chef/menus` referencing a soft-deleted category → 400 `CATEGORY_NOT_FOUND`; `POST /chef/menus/:id/availability` is idempotent on the composite key; `DELETE /chef/menus/:id/availability/:dayOfWeek` is idempotent. Use the Phase 3 `signedInVerifiedChef()` fixture (if absent, add a small fixture that registers a customer, applies, and has a test admin verify them — mirror Phase 3 fixtures).

- [ ] T069 [P] Create `<repo>\backend\test\menus-availability.e2e-spec.ts`. Use a Jest spy / module mock on `todays-cairo.ts` to pin `todaysCairoWeekday()` to each weekday in turn. For each pinned weekday, assert that `GET /chefs/:id` returns menu sections according to FR-017: `availableAllDays=true` ALWAYS appears; a weekday-specific menu appears IFF the pinned weekday is in its `MenuAvailability` rows. Cover the midnight Cairo boundary case by pinning `new Date('2026-05-19T23:59:59+02:00')` then `new Date('2026-05-20T00:00:01+02:00')`. SC-002 / SC-003.

- [ ] T070 [P] Create `<repo>\backend\test\items.e2e-spec.ts`. Cover ALL of the following:
  - **Create happy path**: `POST /chef/menus/:menuId/items` with a valid body → 201; response carries both `price` and `effectivePrice` as decimal strings; `inStock: true`.
  - **Validation refusals**: empty description → 400 `ITEM_DESCRIPTION_REQUIRED`; 501-char description (English) → 400 `ITEM_DESCRIPTION_TOO_LONG_EN`; `price = '0'` → 400 `ITEM_PRICE_INVALID`; `stock = { isUnlimitedStock: true, quantity: 5 }` → 400 `ITEM_STOCK_AMBIGUOUS`; `stock = { isUnlimitedStock: false }` (missing quantity) → 400 `ITEM_STOCK_AMBIGUOUS`.
  - **Cross-chef refusal**: as chef A, target chef B's item via curl → 404 `ITEM_NOT_FOUND` with the SAME shape as a genuinely missing UUID (SC-014).
  - **Idempotent per-image remove (SC-007a)**: upload one image → `DELETE /chef/items/:id/images?key=<key>` → 200 with `images: []`; immediately repeat the same `DELETE` with the same `key` → 200 with `images: []` (unchanged, no 404, no 400); assert exactly one `item.image_remove / success` log line per call (the second call also emits `success`, NOT `not_found` — the spec explicitly treats already-removed as success). Then upload three images, remove the middle one, assert the remaining two preserve their original relative order in the response's `images` array. Then remove all images, assert the item is still readable on `GET /chefs/:chefId` with an empty `images` array (the customer surface renders the design-system default item placeholder client-side).
  SC-007a, SC-007c, SC-014.

- [ ] T071 [P] Create `<repo>\backend\test\items-effective-price.e2e-spec.ts`. Direct unit test against the `effectivePrice` pure function (not over HTTP):
  ```ts
  describe('effectivePrice', () => {
    it('fixed discount', () => {
      expect(effectivePrice({ price: '60', discountValue: '5', discountUnit: 'fixed' }).toFixed(2)).toBe('55.00');
    });
    it('percent discount', () => {
      expect(effectivePrice({ price: '60', discountValue: '10', discountUnit: 'percent' }).toFixed(2)).toBe('54.00');
    });
    it('clamps negative to zero (fixed > price)', () => {
      expect(effectivePrice({ price: '60', discountValue: '100', discountUnit: 'fixed' }).toFixed(2)).toBe('0.00');
    });
    it('clamps negative to zero (percent > 100)', () => {
      expect(effectivePrice({ price: '60', discountValue: '150', discountUnit: 'percent' }).toFixed(2)).toBe('0.00');
    });
  });
  ```
  Plus over-HTTP tests for create-rejection paths: fixed discount > price → 400 `ITEM_NEGATIVE_EFFECTIVE_PRICE`; percent > 100 → 400 same code. Confirm an item with effective price 0 IS accepted (returns `effectivePrice: "0.00"`). SC-005, SC-006.

- [ ] T072 [P] Create `<repo>\backend\test\items-throttle.e2e-spec.ts`. Seed a verified chef + one menu + **five items** (each with an empty `images` array). Round-robin 25 successive valid image uploads as that chef in under 60 seconds, distributing uploads across the five items so each item ends up with at most 5 images (5 items × 5 images = 25 slots). Use `supertest` in a `for` loop with `uploads[i] = items[i % 5]` to pick the target item. Assert: the first 20 uploads succeed with 201; uploads 21..25 refuse with 429 `ITEM_UPLOAD_RATE_LIMITED`. Sanity-check the Supabase bucket: count is exactly 20 image objects after the test (use the `StorageService` directly or list-bucket). The 5-item round-robin design exists specifically because the FR-012 per-item 5-image cap would otherwise fire (`ITEM_IMAGES_FULL`) before the FR-012b 20/60s throttle (`ITEM_UPLOAD_RATE_LIMITED`) on uploads to a single item, making it impossible to assert the throttle boundary. Also test the per-chef key derivation: a second chef issuing 25 uploads in the same 60-s window observes the same `first 20 succeed, last 5 refused` pattern independently (the two chefs do NOT share the cap), confirming `ChefThrottlerGuard.getTracker()` (T030) keys on `req.user.sub`. SC-007b. Note: the throttle counter in `@nestjs/throttler` is process-local; ensure the test runs against a fresh boot or explicitly resets the throttler storage between tests.

- [ ] T073 [P] Create `<repo>\backend\test\home.e2e-spec.ts`. Seed three verified chefs (two open in different categories, one closed). Issue `GET /home` as a signed-in customer. Assert: response has `greeting.userFirstName` matching the customer; `openChefs` length 2 with both open chefs; `categories` length 8 (the Phase 3 seeded list); `topRated` length 3 (all verified chefs; ordered by `(ratings DESC, verifiedAt DESC, id ASC)`).

- [ ] T074 [P] Create `<repo>\backend\test\public-chef-profile.e2e-spec.ts`. Seed a chef + two menus (one Sunday-only, one every-day) + items (one active, one inactive, one soft-deleted). Pin `todaysCairoWeekday()` to Sunday. Issue `GET /chefs/:id` as a customer. Assert: response has both menu sections; the active+non-soft-deleted item appears; the inactive item does NOT; the soft-deleted item does NOT. Re-pin to Monday; assert only the every-day menu appears. Pin to Friday; assert only the every-day menu. Soft-delete the chef; assert `GET /chefs/:id` returns 404 `CHEF_NOT_FOUND` with no leak. Also test **displayOrder collision tiebreaker (SC-007e)**: bypass the bulk-reorder service and seed two menus directly via raw Prisma (`prisma.menu.create`) with the same `displayOrder = 0` and `createdAt` two seconds apart; assert `GET /chefs/:id` returns the two menu sections in `(displayOrder ASC, createdAt ASC, id ASC)` order — the earlier-`createdAt` menu first, then the later. Repeat the same test for two items inside the same menu sharing `displayOrder = 0`. This exercises the deterministic-tiebreaker rule on pre-reorder / legacy rows that the bulk-reorder code path can't normally produce. SC-008 / SC-009 / SC-007e.

- [ ] T075 [P] Create `<repo>\backend\test\chef-bulk-reorder.e2e-spec.ts`. Seed a chef + three menus + a menu with three items. Cover: `PATCH /chef/menus/reorder` with the full ordered list → 204; verify `displayOrder` rewritten as `0, 1, 2`; `PATCH .../reorder` with one menu ID omitted → 400 `MENUS_REORDER_NOT_EXACT_SET`; with an unknown UUID → 400 same code; with a duplicate UUID → 400 same code. Same for `PATCH /chef/menus/:menuId/items/reorder`. Force a mid-transaction failure (e.g., spy on `tx.menu.update` to throw on the 2nd call) and assert: zero rows updated, the previous `displayOrder` values remain intact. SC-007d.

- [ ] T076 [P] Extend `<repo>\backend\test\http-redaction.e2e-spec.ts` (Phase 2/3 file) with Phase 4 path coverage. For each of `POST /chef/menus`, `POST /chef/menus/:id/availability`, `POST /chef/menus/:menuId/items`, `POST /chef/items/:id/images`, `DELETE /chef/items/:id/images/:imageKey`, `GET /chefs/:id`: issue a request that triggers a 400 / 404 / 415 / 413 / 429, then assert the response body's JSON does NOT contain the strings `latitude`, `longitude`, `coordinates`. Also assert no logged event line (use a stream-captured logger) carries those strings. SC-018 / SC-019.

### Observability and schema sweep

- [ ] T077 [P] Verify the Phase 4 migration is clean. From `<repo>\backend` run `npx prisma migrate status` — must report "Database schema is up to date". Run `npx prisma format` — no diff. Run `npx prisma validate` — must pass.

- [ ] T078 [P] Verify no new `$queryRaw` calls were introduced. From `<repo>` run:
  ```powershell
  Select-String -Path "backend\src\**\*.ts" -Pattern "\`$queryRaw" -SimpleMatch:$false
  ```
  Expected matches: ONE occurrence in `backend\src\modules\health\` (the Phase 0 health probe). If any Phase 4 file appears, REMOVE the call and re-route through the Prisma client / extension methods.

- [ ] T079 [P] Verify the CI hard-delete grep gate passes. From `<repo>\backend` run:
  ```powershell
  bash ./scripts/ci-no-hard-delete.sh
  ```
  Expected: exit 0. The gate's allow-list should include `menuAvailability` (T012). If it complains about `prisma.menuAvailability.delete(...)` in `menus.service.ts`, re-edit the gate per T012.

- [ ] T080 [P] Verify Swagger UI documents every new Phase 4 endpoint. Boot the backend (`docker compose -f docker-compose.dev.yml up backend`), open http://localhost:3000/api/v1/docs, and confirm the **ChefMenus**, **MenuAvailability**, **ChefItems**, **ChefItemImages**, **Home** tags each list every endpoint defined in `contracts/*.openapi.yaml`. Confirm each operation has a request body schema (when applicable), response schemas (200 / 201 / 204 / 400 / 401 / 403 / 404 / 413 / 415 / 429 as appropriate), and bearer auth marked. Use `@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiBearerAuth` decorators on the controller methods if any are missing. If a discrepancy exists between the contract file and the implementation (e.g., `:dayId` UUID vs `:dayOfWeek` int path param per T022's note), update either the contract OR the implementation so they match. Record the resolution as a comment at the top of the contract file.

### Locale parity

- [ ] T081 [P] Run the locale-parity check between en.ts and ar.ts. Add (or update) a small test at `<repo>\mobile\__tests__\i18n-parity.test.ts`:
  ```ts
  import en from '../constants/i18n/en';
  import ar from '../constants/i18n/ar';

  function flatten(obj: any, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null) keys.push(...flatten(v, full));
      else keys.push(full);
    }
    return keys.sort();
  }

  test('en and ar have identical key sets', () => {
    expect(flatten(en)).toEqual(flatten(ar));
  });
  ```
  Run from `<repo>\mobile`: `npx jest i18n-parity`. Expected: PASS. Any failure surfaces a missing key on one side — fill in.

### Documentation housekeeping

- [ ] T082 [P] Update `docs/IMPLEMENTATION_PLAN.md` Phase 4 status line. The plan's Phase 4 section currently lists tasks 4.1 – 4.12. Add a short paragraph at the end of that section noting that the spec + plan + tasks for Phase 4 ship as `specs/005-phase-4-menus/`, that this phase adds zero new dependencies, that the migration is index-only (`0004_item_active_displayorder_indexes`), and that the `effectivePrice` helper is exported from `backend/src/modules/items/effective-price.ts` for Phase 5 / 6 to import. Do NOT renumber other phases.

- [ ] T083 [P] Add a Phase 4 entry to the project README's "Recent changes" section (if the README maintains one). Reference: "Phase 4 ships the chef menu/item editor, today-available customer chef profile (Africa/Cairo wall clock), Home composer, and the server-authoritative `effectivePrice` helper. See `specs/005-phase-4-menus/quickstart.md` for the verification path."

### End-to-end verification

- [ ] T084 Run the full quickstart.md (Steps 1 – 12) on a real iOS device against a real Supabase project. Tick each checkbox in the "Done criteria" section at the bottom of `<repo>\specs\005-phase-4-menus\quickstart.md`. If any step fails, file an issue, fix, re-run.

- [ ] T085 Re-run the full backend integration test suite from `<repo>\backend`:
  ```powershell
  npm run test:e2e
  ```
  Expected: all suites pass — including Phase 0 / 1 / 2 / 3 suites (no regressions). If a Phase 0–3 suite fails, the regression was introduced by Phase 4 and MUST be fixed before declaring done.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3 – 8)**: All depend on Foundational completion.
  - US1 (Phase 3) is the natural MVP — without a menu container, nothing else works.
  - US2 (Phase 4) depends conceptually on US1 (an item needs a menu) but the backend can be implemented in parallel; mobile US2 needs the menu detail screen from US1 to be reachable.
  - US3 (Phase 5) depends on US1 + US2 for meaningful test data, but the backend `findTodayAvailableForChef` + `findFullProfile` can be implemented in parallel.
  - US4 (Phase 6) depends on Phase 3 chef discovery (already shipped) and US1 / US2 for meaningful test data on the chef-profile deep-link from Home.
  - US5 (Phase 7) depends on US1 + US2 (you can't edit something that doesn't exist).
  - US6 (Phase 8) depends on every prior US's components being in place so the i18n audit can sweep them all.
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### User story dependencies

- **US1 (Backend, T017 – T022)**: Independent backend slice — start after Foundational.
- **US1 (Mobile, T023 – T026)**: Depends on US1 backend (the mobile screen calls `menusService.create`).
- **US2 (Backend, T027 – T030)**: Depends on US1 backend (uses `assertMenuOwnedByChefPublic`).
- **US2 (Mobile, T031 – T035)**: Depends on US1 mobile (the chef menu detail screen lands on US1's menu list).
- **US3 (Backend, T036 – T038)**: Depends on US1 + US2 backend (uses both `menus.service` and `items.service`).
- **US3 (Mobile, T039 – T041)**: Depends on US3 backend.
- **US4 (Backend, T042 – T044)**: Depends on Phase 3 chef discovery being unchanged.
- **US4 (Mobile, T045 – T048)**: Depends on US4 backend.
- **US5 (Backend, T049 – T056)**: Depends on US1 + US2 backend.
- **US5 (Mobile, T057 – T063)**: Depends on US1 + US2 + US5 backend.
- **US6 (T064 – T067)**: Depends on every prior US's components.

### Within each user story

- DTOs (parallel) before service methods (sequential within a service).
- Service methods before controllers.
- Controllers + service methods before mobile screens.
- Mobile services before mobile screens.

### Parallel opportunities

- All Foundational tasks marked [P] (T006, T007, T008, T009, T010, T011, T013, T014, T015) can run in parallel.
- Within US1 backend: DTO tasks T017, T018 are parallel; service methods T019, T020, T021 are sequential (same file); controller T022 follows.
- Within US2 backend: DTO T027 + service T028 + service T029 + controller T030 are mostly file-disjoint (T029 modifies the same file as T028 — sequential).
- Across US1 and US2 backend: T017 / T018 / T019 / T020 / T021 / T022 / T027 / T028 / T029 / T030 can interleave by file ownership.
- Mobile tasks marked [P] in any phase can run in parallel.
- Phase 9 polish tasks T068 – T076 are all [P] (different files).

---

## Parallel Example: User Story 1 (Backend)

```bash
# T017 and T018 can be authored in parallel:
Task: "Create create-menu.dto.ts in backend/src/modules/menus/dto/"
Task: "Create add-availability.dto.ts in backend/src/modules/menus/dto/"

# T019, T020, T021 are sequential (all extend menus.service.ts).

# T022 runs after T019–T021.
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 + 3)

The Phase 4 MVP is "a chef has a real catalogue and a customer can read it":

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (menu container exists)
4. Complete Phase 4: User Story 2 (items + images exist)
5. Complete Phase 5: User Story 3 (customer sees the catalogue)
6. **STOP and VALIDATE**: Test US1 + US2 + US3 end-to-end. The chef has a working catalogue; the customer can browse it. Phase 5 (cart) is unblocked at this point.
7. US4 (Home + Explore) and US5 (chef catalogue maintenance) are valuable but not blocking for the next phase's start.
8. US6 (bilingual + RTL) is a polish slice but a constitutional requirement.

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. + US1 → Chef can create a menu container.
3. + US2 → Chef can populate the catalogue with items + photos.
4. + US3 → Customer can browse the catalogue (MVP demo).
5. + US4 → Customer can find chefs from Home and Explore.
6. + US5 → Chef can maintain the catalogue (edit, reorder, soft-delete, remove images).
7. + US6 → Bilingual + RTL parity confirmed.
8. + Polish → Tests green, observability clean, IMPLEMENTATION_PLAN updated.

### Parallel Team Strategy

With multiple developers post-Foundational:

- Developer A: Backend slice (T017 – T030, T036 – T038, T042 – T044, T049 – T056) — the modules
- Developer B: Mobile slice (T023 – T026, T031 – T035, T039 – T041, T045 – T048, T057 – T063) — the screens
- Developer C: i18n + tests + polish (T064 – T085)

Developer A and Developer B sync on the DTO + response shapes from `contracts/*.openapi.yaml` and the `services/menus.ts` + `services/items.ts` files.

---

## Notes

- **[P] tasks** = different files, no dependencies — safe to run in parallel.
- **[Story] label** maps task to specific user story for traceability.
- Each user story is independently completable AND independently testable per its "Independent Test" line.
- **Money math** uses `decimal.js`. NEVER `Number(decimal)`.
- **Bilingual fields** are `{ en, ar }` JSON, capped per locale post-trim.
- **Soft-delete** on `Menu` / `Item` goes through `prismaService.<model>.softDelete({ id })` OUTSIDE transactions; INSIDE a transaction use `tx.<model>.update({ data: { deletedAt: new Date() } })`.
- **MenuAvailability** is hard-deleted by `prisma.menuAvailability.delete(...)` — the one Phase 4 exception to the soft-delete-always rule; T012 updates the CI gate.
- **Display order** is reorder-endpoint-only — no PATCH on `:id` accepts the field.
- **`Item.quantity = -1`** is the unlimited sentinel; database-internal; NEVER on the wire.
- **The today-available filter** uses Africa/Cairo wall clock via `todaysCairoWeekday()`. Pin in tests via the helper's `now` argument.
- **The image-upload throttle** is per-IP (v1) at 20 / 60 s on top of Phase 1's default. A future patch could swap to a per-chef ThrottlerStorage if abuse is observed.
- Verify tests pass before declaring a phase done.
- Commit after each task or logical group.
- Stop at any checkpoint to validate independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
