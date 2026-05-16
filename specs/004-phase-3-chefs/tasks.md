---
description: "Phase 3 Categories, Chef Application & Verification — implementation tasks"
---

# Tasks: Categories, Chef Application & Verification

**Input**: Design documents from `/specs/004-phase-3-chefs/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓ (3 OpenAPI files), quickstart.md ✓
**Branch**: `004-phase-3-chefs`
**Repo root**: `<repo>` = `C:\Users\faragelo\Desktop\nafas`

> **Implementer guidance**: Each task is atomic and self-contained.
> File paths are repo-relative. Where a file's full content matters,
> the content is inlined verbatim — copy it directly. Where a
> decision is non-obvious, the task points at the decision in
> `research.md` (R1–R8). Where an endpoint contract matters, the
> task points at one of the three files under `contracts/`. Run
> shell commands exactly as written. The user is on Windows + PowerShell;
> use PowerShell syntax (`$env:VAR`, backtick line continuation,
> `Test-Path`). If a command fails, do NOT improvise — re-read the
> task and the referenced artifact.
>
> **Five clarifications were integrated into the spec** (see
> `spec.md#Clarifications`):
> 1. Chef logo / banner uploads accept JPEG / PNG / WebP, ≤ 5 MB.
> 2. Discovery default radius 15 km, hard cap 50 km.
> 3. 24-h cooldown after a rejection or revocation before re-apply.
> 4. When no radius applies, sort is open-first then
>    verified-newest-first within each group.
> 5. Admin revocation soft-deletes the chef row AND atomically
>    reverts `User.role` from `chef` back to `customer`.
>
> **Phase 0 / Phase 1 / Phase 2 invariants this phase MUST preserve**:
> - All `Chef` and `Category` reads go through
>   `prismaService.extended.<model>.*` (default `deletedAt: null`
>   filter) — **with one named exception**: the cooldown gate in
>   `chef-application.service.assertEligibleToApply` reads the bare
>   `prismaService.chef.findFirst({ where: { userId } })` because it
>   needs to see rejected / revoked rows (research R4). The
>   deviation is commented at the call site.
> - All cross-module data access goes through the owning module's
>   service (Constitution Principle III). Phase 3 introduces:
>   - `menus.service.hasMenuInCategory(chefId, categoryId)` /
>     `categoriesForChef(chefId)` — the **only** way Phase 3 reads
>     `Menu`.
>   - `users.service.setRole(userId, nextRole)` — the **only**
>     way Phase 3 mutates `User.role` (research R6).
>   - `notifications.service.create(userId, type, titleJson, bodyJson, data?)`
>     — the **only** way Phase 3 writes `Notification`.
>   - `storage.service.upload(bucket, path, buffer, mimeType)` — the
>     **only** way Phase 3 writes to Supabase Storage.
> - Soft-delete on `Chef` and `Category` goes through
>   `prismaService.chef.softDelete({ id })` /
>   `prismaService.category.softDelete({ id })`. Hard deletes
>   blocked at CI by `backend/scripts/ci-no-hard-delete.sh`.
>   **Exception inside a `prisma.$transaction(async (tx) => …)`**: the
>   transaction client `tx` does not expose the Prisma Client extension
>   methods (`softDelete` is one of them), so a soft-delete *inside* a
>   transaction must be written as
>   `tx.chef.update({ where: { id }, data: { deletedAt: new Date() } })`.
>   This is the form T031 uses for the revocation flow. The CI grep
>   gate only blocks `.delete(` calls; `update`-based soft-delete is
>   safe and intentional inside transactions.
> - `class-validator` + `class-transformer` are wired globally with
>   `whitelist: true, forbidNonWhitelisted: true` from Phase 0;
>   DTOs declare ONLY the fields the contract lets the client send.
> - Money fields are `Decimal(10,2)` delivered as JS strings. Phase 3
>   accepts `minOrderPrice` as `number` in request DTOs (validated
>   `@IsPositive() @IsNumber({ maxDecimalPlaces: 2 })`) and converts
>   to `Prisma.Decimal` before persistence. Never `Number(decimal)`.
> - `mobile/hooks/useColors.ts` is the **only** place hex literals
>   are allowed in the mobile app (Phase 2 convention). All new
>   Phase 3 mobile components consume colors via `useColors()`.
>
> **One implementation closure from `plan.md`**: the `$queryRaw`
> Haversine exception that `docs/IMPLEMENTATION_PLAN.md` task 3.9
> reserved is **closed** — Phase 3 uses a pure-Prisma bounding-box
> + JS Haversine (research R2) and ships zero new raw-SQL
> exceptions. After Phase 3 lands, that line in IMPLEMENTATION_PLAN
> should be retracted in a follow-up edit (tracked as T100 below).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks → safe to parallelize.
- **[Story]**: Maps to a user story in `spec.md` (`US1`–`US6`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch / dependency / FCM-credential prerequisites. No source files written yet.

- [X] T001 Verify the working directory and branch. From PowerShell at `<repo>`, run `git rev-parse --abbrev-ref HEAD` and confirm it prints `004-phase-3-chefs`. Run `Test-Path specs\004-phase-3-chefs\plan.md` and confirm `True`. Run `Test-Path backend\src\modules\addresses\addresses.controller.ts` and confirm `True` (Phase 2 must be in place — `AddressesController` is a sentinel). Run `Test-Path mobile\components\AddressPickerMap.tsx` and confirm `True` (Phase 2 mobile substrate is in place). Do not proceed unless all four checks pass.

- [X] T002 [P] Install the new backend dependency. From `<repo>\backend` run:
  ```powershell
  npm install firebase-admin
  ```
  Expected outcome: `<repo>\backend\package.json` lists `firebase-admin` under `dependencies`. Do not pin a major version; let npm pick the latest stable.

- [X] T003 Procure the Firebase Cloud Messaging service-account JSON per quickstart Prerequisites. This is a **manual, one-time** procurement. (a) In the Firebase console, open the Nafas project, go to Project Settings → Service accounts, click **Generate new private key**. (b) Save the downloaded JSON to a path *outside* the repo (e.g., `C:\Users\<you>\nafas-secrets\firebase.json`). (c) Add to `<repo>\backend\.env` (gitignored; create if missing) one of:
  ```text
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH=C:\Users\<you>\nafas-secrets\firebase.json
  ```
  or (preferred for CI):
  ```text
  FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
  ```
  (d) Verify `git status` does NOT list `backend\.env` or the JSON path. (e) Append documentation placeholders to `<repo>\backend\.env.example` (after the Phase 1 Twilio block) so future contributors see FCM as a configurable env var:
  ```text
  # Phase 3 — Firebase Cloud Messaging (push notifications for chef state transitions)
  # Procure via Firebase Console → Project Settings → Service accounts → Generate
  # new private key. Use EITHER the inline JSON (preferred for CI) OR the file
  # path; the FcmService prefers KEY over KEY_PATH when both are set.
  FIREBASE_SERVICE_ACCOUNT_KEY=
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH=
  ```
  Expected outcome: backend can read the credential at boot; the secret never enters the repo; `.env.example` documents the new env vars.

- [X] T004 Verify the Phase 0.6 default placeholder assets are reachable from a code constant. Phase 0 established two env vars in `<repo>\backend\.env.example`:
  ```text
  DEFAULT_CHEF_LOGO_URL=""
  DEFAULT_CHEF_BANNER_URL=""
  ```
  and `<repo>\backend\prisma\seed.ts` already reads them to populate `Setting` rows `CHEF_LOGO_PLACEHOLDER` / `CHEF_BANNER_PLACEHOLDER`. Phase 3 reads them via a code constant. Create `<repo>\backend\src\common\storage\chef-defaults.ts` with:
  ```ts
  /**
   * Phase 3 chef-row default placeholders (FR-023 / SC-011).
   *
   * Production: set DEFAULT_CHEF_LOGO_URL / DEFAULT_CHEF_BANNER_URL in
   * backend/.env to the public Supabase Storage URLs that Phase 0.6
   * uploaded to the chef-logos / chef-banners buckets.
   *
   * Dev fallback: a placeholder service so the chef-apply flow still
   * produces a rendering URL when the env vars are blank. Saffron
   * (#D4944A) is the Nafas design-system accent.
   *
   * `||` (not `??`) so an empty-string env value also falls back —
   * `.env.example` declares the vars as `""`.
   */
  const DEV_LOGO_FALLBACK = 'https://placehold.co/400x400/D4944A/FFFFFF.png?text=Chef';
  const DEV_BANNER_FALLBACK = 'https://placehold.co/1200x400/D4944A/FFFFFF.png?text=Nafas';

  export const DEFAULT_CHEF_LOGO_URL =
    process.env.DEFAULT_CHEF_LOGO_URL || DEV_LOGO_FALLBACK;

  export const DEFAULT_CHEF_BANNER_URL =
    process.env.DEFAULT_CHEF_BANNER_URL || DEV_BANNER_FALLBACK;
  ```
  **Critical**: use exactly the env-var names `DEFAULT_CHEF_LOGO_URL` and `DEFAULT_CHEF_BANNER_URL` (no `SUPABASE_` prefix, no other variant) — these are the names Phase 0 wired into `.env.example` and `seed.ts`. Use `||` not `??` because `.env.example` declares the vars as `""` and the fallback must engage on empty strings too. These constants are consumed by `chefs.service.apply` (T023).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared modules, logging, and one-off code that every user story depends on. Complete this phase **before** starting any user-story phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema migration + seed

- [X] T005 Add the `Chef.rejectedAt` and `Chef.verifiedAt` columns to the schema. Open `<repo>\backend\prisma\schema.prisma`. Find the `model Chef { ... }` block. Add these two fields **immediately after** the existing `deletedAt` line, preserving the snake_case `@map(...)` convention:
  ```prisma
    rejectedAt      DateTime?    @map("rejected_at")
    verifiedAt      DateTime?    @map("verified_at")
  ```
  Then find the `model Chef { ... }` closing brace and add this index declaration **immediately before** the `@@map("chefs")` line (or alongside any existing `@@index` lines):
  ```prisma
    @@index([isVerified, latitude, longitude])
  ```
  Find the `enum NotificationType { ... }` block. Add `chef_revoked` as a new value immediately after the existing `chef_rejected` value:
  ```prisma
    chef_rejected
    chef_revoked
    system
  ```
  Save the file. Do NOT change any other line.

- [X] T006 Generate the Prisma migration. From `<repo>\backend` run:
  ```powershell
  npx prisma migrate dev --name 0003_chef_rejection_state
  ```
  Expected outcome: a new directory `<repo>\backend\prisma\migrations\0003_chef_rejection_state\` is created with a `migration.sql` whose contents are equivalent to:
  ```sql
  ALTER TABLE "chefs" ADD COLUMN "rejected_at" TIMESTAMP(3);
  ALTER TABLE "chefs" ADD COLUMN "verified_at" TIMESTAMP(3);
  CREATE INDEX "chefs_is_verified_latitude_longitude_idx" ON "chefs"("is_verified", "latitude", "longitude");
  ALTER TYPE "NotificationType" ADD VALUE 'chef_revoked';
  ```
  Prisma also regenerates the client. Verify with `npx prisma migrate status` — must report "No pending migrations."

- [X] T007 Seed the eight food categories. Open (or create if absent) `<repo>\backend\prisma\seed.ts`. Add or merge in the following block. The UUIDs are pre-generated constants so the seed is idempotent (re-runs are no-ops). The seed runs `prisma.category.upsert` on each row, keyed on `id`:
  ```ts
  // Phase 3 categories seed (FR-025). Each id is pre-generated so re-runs are no-ops.
  const PHASE3_CATEGORIES: Array<{
    id: string;
    name: { en: string; ar: string };
    icon: string;
    displayOrder: number;
  }> = [
    { id: '00000000-0000-4000-8000-000000000c01', name: { en: 'Koshary',   ar: 'كشري'   }, icon: 'coffee',          displayOrder: 0 },
    { id: '00000000-0000-4000-8000-000000000c02', name: { en: 'Mahshi',    ar: 'محشي'   }, icon: 'leaf',            displayOrder: 1 },
    { id: '00000000-0000-4000-8000-000000000c03', name: { en: 'Molokheya', ar: 'ملوخية' }, icon: 'feather',         displayOrder: 2 },
    { id: '00000000-0000-4000-8000-000000000c04', name: { en: 'Hawawshi',  ar: 'حواوشي' }, icon: 'pie-chart',       displayOrder: 3 },
    { id: '00000000-0000-4000-8000-000000000c05', name: { en: 'Sweets',    ar: 'حلويات' }, icon: 'gift',            displayOrder: 4 },
    { id: '00000000-0000-4000-8000-000000000c06', name: { en: 'Feteer',    ar: 'فطير'   }, icon: 'square',          displayOrder: 5 },
    { id: '00000000-0000-4000-8000-000000000c07', name: { en: 'Fattah',    ar: 'فتة'    }, icon: 'layers',          displayOrder: 6 },
    { id: '00000000-0000-4000-8000-000000000c08', name: { en: 'Other',     ar: 'أخرى'   }, icon: 'more-horizontal', displayOrder: 7 },
  ];

  for (const c of PHASE3_CATEGORIES) {
    await prisma.category.upsert({
      where:  { id: c.id },
      create: { id: c.id, name: c.name, icon: c.icon, displayOrder: c.displayOrder, isActive: true },
      update: { name: c.name, icon: c.icon, displayOrder: c.displayOrder, isActive: true, deletedAt: null },
    });
  }
  ```
  If `seed.ts` is missing entirely, create it with the standard Prisma seed boilerplate (`import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); async function main() { ... } main().finally(() => prisma.$disconnect());`) and ensure `<repo>\backend\package.json` contains:
  ```json
  "prisma": { "seed": "ts-node prisma/seed.ts" }
  ```
  Run the seed:
  ```powershell
  npx prisma db seed
  ```
  Expected outcome: 8 rows present in the `categories` table; running it twice is a no-op.

### Shared backend modules

- [X] T008 [P] Create the `StorageModule` wrapping `@supabase/supabase-js`. **First install the dep** — Phase 0 did NOT install this; from `<repo>\backend` run:
  ```powershell
  npm install @supabase/supabase-js
  ```
  Then create directory `<repo>\backend\src\modules\storage\` and write `<repo>\backend\src\modules\storage\storage.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { StorageService } from './storage.service';

  @Module({ providers: [StorageService], exports: [StorageService] })
  export class StorageModule {}
  ```
  Create `<repo>\backend\src\modules\storage\storage.service.ts`:
  ```ts
  import { Injectable, Logger } from '@nestjs/common';
  import { createClient, SupabaseClient } from '@supabase/supabase-js';

  @Injectable()
  export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private readonly client: SupabaseClient;

    constructor() {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_KEY;
      if (!url || !key) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
      }
      this.client = createClient(url, key);
    }

    async upload(
      bucket: string,
      path: string,
      buffer: Buffer,
      mimeType: string,
    ): Promise<string> {
      const { error } = await this.client.storage
        .from(bucket)
        .upload(path, buffer, { contentType: mimeType, upsert: true });
      if (error) {
        this.logger.error(`Supabase upload failed for ${bucket}/${path}: ${error.message}`);
        throw error;
      }
      const { data } = this.client.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }

    async delete(bucket: string, path: string): Promise<void> {
      const { error } = await this.client.storage.from(bucket).remove([path]);
      if (error) {
        this.logger.error(`Supabase delete failed for ${bucket}/${path}: ${error.message}`);
        throw error;
      }
    }
  }
  ```
  Register `StorageModule` in `<repo>\backend\src\app.module.ts` under the `imports: []` array.

- [X] T009 [P] Create the `NotificationsModule` + `FcmService`. Create directory `<repo>\backend\src\modules\notifications\`. Create three files:
  - `<repo>\backend\src\modules\notifications\notifications.module.ts`:
    ```ts
    import { Module } from '@nestjs/common';
    import { PrismaModule } from '../../common/prisma/prisma.module';
    import { NotificationsService } from './notifications.service';
    import { FcmService } from './fcm.service';

    @Module({
      imports: [PrismaModule],
      providers: [NotificationsService, FcmService],
      exports: [NotificationsService],
    })
    export class NotificationsModule {}
    ```
  - `<repo>\backend\src\modules\notifications\fcm.service.ts`:
    ```ts
    import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
    import * as admin from 'firebase-admin';

    @Injectable()
    export class FcmService implements OnModuleInit {
      private readonly logger = new Logger(FcmService.name);
      private initialized = false;

      onModuleInit(): void {
        if (admin.apps.length > 0) {
          this.initialized = true;
          return;
        }
        const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
        try {
          const credential = inlineJson
            ? admin.credential.cert(JSON.parse(inlineJson))
            : keyPath
              ? admin.credential.cert(keyPath)
              : null;
          if (!credential) {
            this.logger.warn('FCM credentials not configured — push delivery disabled.');
            return;
          }
          admin.initializeApp({ credential });
          this.initialized = true;
        } catch (err) {
          this.logger.error(`Failed to initialise firebase-admin: ${(err as Error).message}`);
        }
      }

      async send(fcmToken: string | null, payload: {
        title: string;
        body: string;
        data?: Record<string, string>;
      }): Promise<void> {
        if (!this.initialized || !fcmToken) return;
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: { title: payload.title, body: payload.body },
            data: payload.data,
          });
        } catch (err) {
          this.logger.error(`FCM send failed: ${(err as Error).message}`);
        }
      }
    }
    ```
  - `<repo>\backend\src\modules\notifications\notifications.service.ts`:
    ```ts
    import { Injectable } from '@nestjs/common';
    import { Prisma, NotificationType } from '@prisma/client';
    import { PrismaService } from '../../common/prisma/prisma.service';
    import { FcmService } from './fcm.service';

    type BilingualText = { en: string; ar: string };

    @Injectable()
    export class NotificationsService {
      constructor(
        private readonly prismaService: PrismaService,
        private readonly fcmService: FcmService,
      ) {}

      async create(args: {
        userId: string;
        type: NotificationType;
        title: BilingualText;
        body: BilingualText;
        data?: Record<string, string>;
        tx?: Prisma.TransactionClient;
      }): Promise<void> {
        const client = args.tx ?? this.prismaService;
        await client.notification.create({
          data: {
            userId: args.userId,
            type:   args.type,
            title:  args.title  as unknown as Prisma.InputJsonValue,
            body:   args.body   as unknown as Prisma.InputJsonValue,
            data:   args.data ? (args.data as unknown as Prisma.InputJsonValue) : undefined,
          },
        });
      }

      /** Fire-and-forget — caller awaits but failure logs only (best-effort per FR-009). */
      async dispatchPush(userId: string, payload: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
        const user = await this.prismaService.user.findUnique({
          where: { id: userId },
          select: { fcmToken: true },
        });
        if (!user?.fcmToken) return;
        await this.fcmService.send(user.fcmToken, payload);
      }
    }
    ```
  Register `NotificationsModule` in `<repo>\backend\src\app.module.ts` under `imports: []`.

- [X] T010 [P] Create the `MenusModule` shell. Create directory `<repo>\backend\src\modules\menus\`. Create two files:
  - `<repo>\backend\src\modules\menus\menus.module.ts`:
    ```ts
    import { Module } from '@nestjs/common';
    import { PrismaModule } from '../../common/prisma/prisma.module';
    import { MenusService } from './menus.service';

    @Module({
      imports: [PrismaModule],
      providers: [MenusService],
      exports: [MenusService],
    })
    export class MenusModule {}
    ```
  - `<repo>\backend\src\modules\menus\menus.service.ts`:
    ```ts
    import { Injectable } from '@nestjs/common';
    import { PrismaService } from '../../common/prisma/prisma.service';

    /**
     * Phase 3 shell. Owns the only Phase 3 reads against `Menu`. Phase 4 will
     * expand this module with menu writes; do NOT add controllers / endpoints
     * here until then. See data-model.md "Menu (read-only shell, FR-014 filter only)".
     */
    @Injectable()
    export class MenusService {
      constructor(private readonly prismaService: PrismaService) {}

      /**
       * Note: the Phase 0 `Menu` schema has NO `isActive` flag. "Active"
       * in spec FR-014 means "not soft-deleted", which the extended
       * client already filters automatically. Do not invent an `isActive`
       * predicate here — it will cause a Prisma type error.
       */

      /** FR-014 category-filter membership check. */
      async hasMenuInCategory(chefId: string, categoryId: string): Promise<boolean> {
        const found = await this.prismaService.extended.menu.findFirst({
          where: { chefId, categoryId },
          select: { id: true },
        });
        return found !== null;
      }

      /** Returns the unique non-soft-deleted category IDs the chef currently has menus in. */
      async categoriesForChef(chefId: string): Promise<string[]> {
        const rows = await this.prismaService.extended.menu.findMany({
          where: { chefId },
          select: { categoryId: true },
          distinct: ['categoryId'],
        });
        return rows.map((r) => r.categoryId);
      }

      /** Returns chef IDs that have at least one non-soft-deleted menu in `categoryId`. */
      async chefIdsInCategory(categoryId: string): Promise<string[]> {
        const rows = await this.prismaService.extended.menu.findMany({
          where: { categoryId },
          select: { chefId: true },
          distinct: ['chefId'],
        });
        return rows.map((r) => r.chefId);
      }
    }
    ```
  Register `MenusModule` in `<repo>\backend\src\app.module.ts` under `imports: []`.

- [X] T011 Extend `users.service` with the role-flip chokepoint (research R6). Open `<repo>\backend\src\modules\users\users.service.ts`. Add this method (do NOT modify the constructor or other methods):
  ```ts
  /**
   * Phase 3 R6 chokepoint — the ONLY method that mutates User.role.
   * Callable only from inside the modular monolith (admin.service uses it
   * inside the verify / revoke prisma.$transaction; pass `tx` to participate).
   */
  async setRole(
    userId: string,
    nextRole: Role,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prismaService;
    await client.user.update({
      where: { id: userId },
      data:  { role: nextRole },
    });
  }
  ```
  Add the necessary imports at the top of the file: `import { Prisma, Role } from '@prisma/client';`. If the file already imports from `@prisma/client` (e.g., for `User`), merge the new names into the existing import statement rather than adding a duplicate line. Example merge:
  ```ts
  // Before:
  import { User } from '@prisma/client';
  // After:
  import { Prisma, Role, User } from '@prisma/client';
  ```

### Structured logging + exception filter

- [X] T012 [P] Create the chef-event logger as a sibling of the Phase 1 / Phase 2 loggers. Create `<repo>\backend\src\common\logging\chef-event.logger.ts` with content **identical in shape** to `<repo>\backend\src\common\logging\address-event.logger.ts` (read that file first to mirror the line shape exactly). The new logger MUST expose a class `ChefEventLogger` with one method per outcome the data-model `Observability shape` section names:
  - `applySuccess({ actorUserId, applicationId, sourceIp })`
  - `applyValidationRejected({ actorUserId, sourceIp })`
  - `applyApplicationPending({ actorUserId, applicationId, sourceIp })`
  - `applyAlreadyChef({ actorUserId, chefId, sourceIp })`
  - `applyRejectedCooldownInEffect({ actorUserId, earliestResubmitAt, sourceIp })`
  - `verifySuccess({ actorAdminId, chefId, sourceIp })`
  - `verifyApplicationNotPending({ actorAdminId, chefId, sourceIp })`
  - `rejectSuccess({ actorAdminId, chefId, sourceIp })`
  - `rejectApplicationNotPending({ actorAdminId, chefId, sourceIp })`
  - `revokeSuccess({ actorAdminId, chefId, sourceIp })`
  - `revokeChefNotVerified({ actorAdminId, chefId, sourceIp })`
  - `profileUpdateSuccess({ actorChefId, chefId, sourceIp })`
  - `profileUpdateValidationRejected({ actorChefId, sourceIp })`
  - `profileUpdateNotFound({ actorChefId, sourceIp })`
  - `availabilityToggleSuccess({ actorChefId, chefId, isOpen, sourceIp })`
  - `availabilityToggleNotFound({ actorChefId, sourceIp })`
  - `logoUploadSuccess({ actorChefId, chefId, sourceIp })`
  - `logoUploadUnsupportedMediaType({ actorChefId, mimeType, sourceIp })`
  - `logoUploadPayloadTooLarge({ actorChefId, byteSize, sourceIp })`
  - `bannerUploadSuccess` / `bannerUploadUnsupportedMediaType` / `bannerUploadPayloadTooLarge` — same as logo with `event: 'chef.banner_upload'`.

  Each method internally calls `this.logger.log(JSON.stringify({ event, outcome, timestamp: new Date().toISOString(), correlationId: correlationIdContext.get(), actorId: <fromArgs>, sourceIp, ...targetIds }))`. **Per FR-039, NEVER include `latitude`, `longitude`, `coordinates`, or any coordinate-derived value in any line.** Test by grep after a quickstart run.

- [X] T013 [P] Create the category-event logger sibling. Create `<repo>\backend\src\common\logging\category-event.logger.ts` with the same shape as T012 but smaller surface. Methods:
  - `createSuccess({ actorAdminId, categoryId, sourceIp })`
  - `createValidationRejected({ actorAdminId, sourceIp })`
  - `updateSuccess({ actorAdminId, categoryId, sourceIp })`
  - `updateValidationRejected({ actorAdminId, sourceIp })`
  - `updateNotFound({ actorAdminId, sourceIp })`
  - `deleteSuccess({ actorAdminId, categoryId, sourceIp })`
  - `deleteNotFound({ actorAdminId, sourceIp })`
  - `reorderSuccess({ actorAdminId, itemsCount, sourceIp })`
  - `reorderValidationRejected({ actorAdminId, sourceIp })`
  - `roleRefused({ actorUserId, sourceIp })` — emitted when a non-admin attempts a mutation.

- [X] T014 Register both new loggers in the logging module. Open `<repo>\backend\src\common\logging\logging.module.ts`. Add `ChefEventLogger` and `CategoryEventLogger` to both `providers: []` and `exports: []`. Add the imports at the top.

- [X] T015 Broaden the global `HttpExceptionNormalizerFilter` to cover Phase 3 paths and events. Open `<repo>\backend\src\common\errors\http-exception.filter.ts`. The Phase 2 version already strips `latitude` / `longitude` / `coordinates` from every error response payload (FR-021) and emits structured logs for `/api/v1/addresses/*` paths. **Extend (do not replace) the path-matching block** so that:
  - The same coordinate-redaction walk also applies to `/api/v1/chefs/*`, `/api/v1/chef/*`, and `/api/v1/admin/chefs/*` request paths.
  - Validation rejections (400 from `ValidationPipe`) emit:
    - `ChefEventLogger.applyValidationRejected(...)` when the URL matches `/api/v1/chef/apply`.
    - `ChefEventLogger.profileUpdateValidationRejected(...)` when the URL matches `/api/v1/chef/profile` or `/api/v1/chef/availability`.
    - `CategoryEventLogger.createValidationRejected(...)` / `updateValidationRejected(...)` / `reorderValidationRejected(...)` for the matching `/api/v1/admin/categories[/...]` paths.
  - `NotFoundException`s (404 from service-layer `findOwnedOrThrow`) emit `ChefEventLogger.profileUpdateNotFound(...)` / `availabilityToggleNotFound(...)` / `CategoryEventLogger.updateNotFound(...)` / `deleteNotFound(...)` based on URL pattern.
  - `ForbiddenException`s emitted by `RolesGuard` on `/api/v1/admin/categories*` paths emit `CategoryEventLogger.roleRefused(...)`. The chef-admin endpoints (`/api/v1/admin/chefs/*`) do not have a dedicated `roleRefused` outcome in the chef-event logger — a non-admin caller on those endpoints surfaces as the generic Phase 1 `auth-event.logger` line shape, which is sufficient for the FR-038 audit surface. No additional service-side emission is needed.
  - The single-pass walk that strips `latitude` / `longitude` / `coordinates` runs unchanged regardless of path; Phase 3 just broadens the path allow-list. Do NOT add a new filter class — extend this single one (data-model.md `Observability shape` section).

### Mobile + admin scaffolding (non-blocking; can run in parallel with backend foundational)

- [X] T016 [P] Extend `AuthContext` to surface the user's chef-application state. Open `<repo>\mobile\context\AuthContext.tsx`. The current shape from Phase 1 returns `user, isLoading, signIn, signOut, register` from `useAuth()`. **Add** these to the context value and the `getMe()` post-processing:
  - `pendingApplication: { applicationId: string } | null` — populated from a new field the server-side `GET /auth/me` returns once the user has a pending Chef row. (For now, mock this field as `null` on the response side; the server-side change is T040.)
  - `role: 'admin' | 'customer' | 'chef'` — already on `user.role` from Phase 1; just re-expose for convenience.
  Update the `AuthContextValue` interface and the default value accordingly. Do NOT break existing Phase 1 / Phase 2 consumers — preserve the existing fields.

- [X] T017 [P] Create the `KitchenLocationPicker` mobile component (research R5). Create `<repo>\mobile\components\KitchenLocationPicker.tsx` with this content — it is a thin wrapper that delegates to the Phase 2 `AddressPickerMap`:
  ```tsx
  import React from 'react';
  import { AddressPickerMap } from './AddressPickerMap';

  export interface KitchenLocationPickerProps {
    value: { latitude: number; longitude: number } | null;
    onChange: (next: { latitude: number; longitude: number }) => void;
    /** Optional UX hint: reverse-geocoded street string for the kitchen address. */
    onReverseGeocode?: (street: string) => void;
    testID?: string;
  }

  /**
   * Phase 3 wrapper over the Phase 2 AddressPickerMap. Keeps the chef-apply
   * and chef-profile-editor screens importable from a chef-context-named
   * path. If divergence is ever needed (e.g., delivery-radius circle around
   * the kitchen pin) it lands here, not in AddressPickerMap.
   */
  export const KitchenLocationPicker: React.FC<KitchenLocationPickerProps> = (props) => {
    return <AddressPickerMap {...props} />;
  };
  ```
  No new dependencies needed. No new env vars needed.

- [X] T018 [P] Add the Phase 3 i18n key skeletons in both locales. Open `<repo>\mobile\constants\i18n\en.ts` and `<repo>\mobile\constants\i18n\ar.ts`. Add (or merge into existing nested namespaces) the following key groups. Use the exact keys; Arabic translations may be filled in alongside their English counterparts in the same PR. **Both files MUST carry identical key sets — a missing-key check across locales must report zero asymmetries (quickstart Step 12 done-criteria)**:

  Namespace `chefApply.*`:
  - `chefApply.screenTitle`, `chefApply.locationStep.title`, `chefApply.locationStep.confirmCta`, `chefApply.detailsStep.title`, `chefApply.detailsStep.chefNameLabel`, `chefApply.detailsStep.bioLabel`, `chefApply.detailsStep.minOrderPriceLabel`, `chefApply.detailsStep.submitCta`, `chefApply.validation.chefNameRequired`, `chefApply.validation.bioRequired`, `chefApply.validation.minOrderPricePositive`, `chefApply.validation.coordinatesRequired`.
  - `chefApply.error.alreadyChef`, `chefApply.error.applicationPending`, `chefApply.error.cooldown` (Arabic / English versions including a `{date}` interpolation token for the cooldown timestamp).

  Namespace `pending.*`:
  - `pending.title`, `pending.body`, `pending.signOutCta`.

  Namespace `chefProfile.*`:
  - `chefProfile.editor.title`, `chefProfile.editor.openToggle`, `chefProfile.editor.closeToggle`, `chefProfile.editor.bioLabel`, `chefProfile.editor.minOrderPriceLabel`, `chefProfile.editor.replaceLogo`, `chefProfile.editor.replaceBanner`, `chefProfile.editor.save`, `chefProfile.upload.unsupportedType`, `chefProfile.upload.tooLarge`.

  Namespace `discovery.*`:
  - `discovery.tabTitle`, `discovery.searchPlaceholder`, `discovery.emptyState`, `discovery.openBadge`, `discovery.closedBadge`, `discovery.distanceFormat` (with `{km}` interpolation), `discovery.minOrder` (with `{amount}` interpolation), `discovery.reviewCount` (with `{count}` interpolation).

  Namespace `chefPublicProfile.*`:
  - `chefPublicProfile.aboutHeader`, `chefPublicProfile.categoriesHeader`, `chefPublicProfile.reviewsHeader`, `chefPublicProfile.noReviewsYet`.

  Namespace `notifications.chef.*` (rendered when the in-app notification centre — Phase 8 — surfaces a Phase 3 push):
  - `notifications.chef.verifiedTitle`, `notifications.chef.verifiedBody`, `notifications.chef.rejectedTitle`, `notifications.chef.rejectedBody` (interpolates `{reason}`), `notifications.chef.revokedTitle`, `notifications.chef.revokedBody` (interpolates `{reason}`).

  Namespace `customerTabs.*` / `chefTabs.*` (tab labels):
  - `customerTabs.home`, `customerTabs.explore`, `customerTabs.favorites`, `customerTabs.orders`, `customerTabs.profile`.
  - `chefTabs.dashboard`, `chefTabs.orders`, `chefTabs.menu`, `chefTabs.stats`, `chefTabs.schedule`, `chefTabs.profile`.

  Namespace `common.cooldown.*`:
  - `common.cooldown.title`, `common.cooldown.body` (interpolates `{timestamp}`).

  When in doubt about wording, default to clear, concise marketplace copy; the strings are not load-bearing and can be polished pre-launch.

- [X] T019 [P] Scaffold the admin NextAuth Credentials sign-in. **First install the deps** — Phase 0 scaffolded an empty Next app and did NOT install NextAuth or axios. From `<repo>\admin` run:
  ```powershell
  npm install next-auth axios
  ```
  Then create the directory `<repo>\admin\lib\` (if absent) and write `<repo>\admin\lib\auth.ts`:
  ```ts
  import type { NextAuthOptions } from 'next-auth';
  import CredentialsProvider from 'next-auth/providers/credentials';
  import axios from 'axios';

  export const authOptions: NextAuthOptions = {
    session: { strategy: 'jwt' },
    providers: [
      CredentialsProvider({
        name: 'Nafas Admin',
        credentials: {
          phone:    { label: 'Phone',    type: 'text'     },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          if (!credentials?.phone || !credentials.password) return null;
          try {
            const res = await axios.post(
              `${process.env.BACKEND_URL}/api/v1/auth/sign-in`,
              { phone: credentials.phone, password: credentials.password },
              { timeout: 10_000 },
            );
            const { user, accessToken, refreshToken } = res.data;
            if (user.role !== 'admin') return null;
            return {
              id: user.id,
              role: user.role,
              fullName: user.fullName,
              accessToken,
              refreshToken,
            };
          } catch {
            return null;
          }
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          // NextAuth's `User | AdapterUser` doesn't carry our custom fields,
          // so cast through `unknown` (TypeScript's escape hatch) to extract them.
          const u = user as unknown as { role: string; accessToken: string; refreshToken: string };
          token.role = u.role;
          token.accessToken  = u.accessToken;
          token.refreshToken = u.refreshToken;
        }
        return token;
      },
      async session({ session, token }) {
        (session as { accessToken?: string; role?: string }).accessToken = token.accessToken as string;
        (session as { accessToken?: string; role?: string }).role        = token.role as string;
        return session;
      },
    },
    pages: { signIn: '/sign-in' },
  };
  ```
  Create `<repo>\admin\lib\adminApi.ts`:
  ```ts
  import axios from 'axios';
  import { getSession } from 'next-auth/react';

  export const adminApi = axios.create({
    baseURL: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1`,
    timeout: 10_000,
  });

  adminApi.interceptors.request.use(async (config) => {
    const session = await getSession();
    const token = (session as { accessToken?: string } | null)?.accessToken;
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
    return config;
  });
  ```
  Add `BACKEND_URL=http://localhost:3000` and `NEXT_PUBLIC_BACKEND_URL=http://localhost:3000` to `<repo>\admin\.env.local` (gitignored). Create `<repo>\admin\app\api\auth\[...nextauth]\route.ts`:
  ```ts
  import NextAuth from 'next-auth';
  import { authOptions } from '@/lib/auth';
  const handler = NextAuth(authOptions);
  export { handler as GET, handler as POST };
  ```

**Checkpoint**: All foundational tasks complete. Backend boots with the new modules registered. The migration is applied and seeded. The admin NextAuth surface compiles. User story work can now begin.

---

## Phase 3: User Story 1 - Customer applies to be a chef (Priority: P1) 🎯 MVP slice

**Goal**: A signed-in customer fills out the apply form (including the map-pin drag), submits, and lands on the pending-verification holding screen. Re-opening the app keeps them on the holding screen. Server-side state captures the application and gates re-submits with the 24-h cooldown.

**Independent Test**: A signed-in customer who has never applied opens the apply screen, fills the required fields, submits, and immediately sees the "under review" holding screen. Reopening the app later still shows the holding screen. A second customer's discovery list does NOT return the applicant.

### DTOs (US1 backend)

- [ ] T020 [P] [US1] Create `ApplyChefDto`. Create `<repo>\backend\src\modules\chefs\dto\apply-chef.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import { IsLatitude, IsLongitude, IsNumber, IsPositive, IsString, Length } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';

  export class ApplyChefDto {
    @ApiProperty({ minLength: 1, maxLength: 80 })
    @IsString()
    @Length(1, 80)
    chefName!: string;

    @ApiProperty({ minLength: 1, maxLength: 1000 })
    @IsString()
    @Length(1, 1000)
    bio!: string;

    @ApiProperty({ minimum: -90, maximum: 90 })
    @Type(() => Number)
    @IsLatitude()
    latitude!: number;

    @ApiProperty({ minimum: -180, maximum: 180 })
    @Type(() => Number)
    @IsLongitude()
    longitude!: number;

    @ApiProperty({ exclusiveMinimum: 0, description: 'Decimal with up to 2 places. Example: 50.00' })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    minOrderPrice!: number;
  }
  ```
  Trim transform for `chefName` / `bio` is applied via the existing global `ValidationPipe`'s `transform: true` plus the inherited Phase 1 trim convention. Do NOT add additional `@Transform` decorators here — match the Phase 2 `CreateAddressDto` shape.

- [ ] T021 [P] [US1] Create `ChefPrivateProfileResponseDto`. Create `<repo>\backend\src\modules\chefs\dto\chef.response.dto.ts` — the shape matches `ChefPrivateProfile` in `<repo>\specs\004-phase-3-chefs\contracts\chefs.openapi.yaml`. It carries lat/lng (the chef's own view) and `categoryIds` (always `[]` in Phase 3, populated via `menus.service.categoriesForChef` once menus exist). Field list and types:
  - `id: string` (UUID)
  - `chefName: string`
  - `bio: string`
  - `logo: string` / `banner: string`
  - `isOpen: boolean`
  - `ratings: string` (Decimal stringified)
  - `totalReviews: number`
  - `minOrderPrice: string` (Decimal stringified)
  - `verifiedAt: string | null` (ISO 8601)
  - `latitude: string` / `longitude: string` (Decimal stringified)
  - `categoryIds: string[]`

  Use a helper `static fromEntity(chef, categoryIds)` that builds the DTO from a Prisma `Chef` row plus the category-ID array. The helper calls `.toString()` on every Decimal field — never `Number(decimal)`.

### Chef-application service + controller (US1 backend)

- [ ] T022 [US1] Create the `ChefApplicationService` (cooldown gate + state-machine helper, research R4). Create `<repo>\backend\src\modules\chefs\chef-application.service.ts`:
  ```ts
  import { ConflictException, Injectable } from '@nestjs/common';
  import { PrismaService } from '../../common/prisma/prisma.service';

  const COOLDOWN_MS = 24 * 60 * 60 * 1000;

  type EligibilityRefusal =
    | { code: 'ALREADY_CHEF';                    chefId: string }
    | { code: 'APPLICATION_PENDING';             applicationId: string }
    | { code: 'APPLICATION_COOLDOWN_IN_EFFECT';  earliestResubmitAt: string };

  @Injectable()
  export class ChefApplicationService {
    constructor(private readonly prismaService: PrismaService) {}

    /**
     * Phase 3 R4 cooldown gate. Throws ConflictException with the appropriate
     * structured payload on every non-eligible state. Returns the prior Chef row
     * (or null) so the caller can decide between an in-place update and a fresh
     * create.
     *
     * NOTE: this is the ONLY Phase 3 read that uses the bare prismaService — it
     * must see rejected (rejectedAt != null) and revoked (deletedAt != null)
     * rows that the extended client would hide.
     */
    async assertEligibleToApply(userId: string) {
      const existing = await this.prismaService.chef.findFirst({ where: { userId } });

      if (!existing) return { existing: null };

      if (existing.isVerified && !existing.deletedAt) {
        throw this.conflict({ code: 'ALREADY_CHEF', chefId: existing.id });
      }
      if (!existing.isVerified && !existing.rejectedAt && !existing.deletedAt) {
        throw this.conflict({ code: 'APPLICATION_PENDING', applicationId: existing.id });
      }
      const blocker = existing.deletedAt ?? existing.rejectedAt;
      if (blocker && blocker.getTime() + COOLDOWN_MS > Date.now()) {
        const earliestResubmitAt = new Date(blocker.getTime() + COOLDOWN_MS).toISOString();
        throw this.conflict({ code: 'APPLICATION_COOLDOWN_IN_EFFECT', earliestResubmitAt });
      }
      return { existing };
    }

    private conflict(payload: EligibilityRefusal): ConflictException {
      return new ConflictException(payload);
    }
  }
  ```

- [ ] T023 [US1] Create the `ChefsService` apply method (the only Phase 3 ChefsService method this user story needs). Create `<repo>\backend\src\modules\chefs\chefs.service.ts`. Start with this skeleton — later tasks (T037, T046 etc.) add more methods to the same file:
  ```ts
  import { Injectable } from '@nestjs/common';
  import { Prisma } from '@prisma/client';
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { ChefApplicationService } from './chef-application.service';
  import { ChefEventLogger } from '../../common/logging/chef-event.logger';
  import { ApplyChefDto } from './dto/apply-chef.dto';
  import { ChefPrivateProfileResponseDto } from './dto/chef.response.dto';
  import { DEFAULT_CHEF_LOGO_URL, DEFAULT_CHEF_BANNER_URL } from '../../common/storage/chef-defaults';

  @Injectable()
  export class ChefsService {
    constructor(
      private readonly prismaService: PrismaService,
      private readonly chefApplicationService: ChefApplicationService,
      private readonly chefEventLogger: ChefEventLogger,
    ) {}

    async apply(
      userId: string,
      sourceIp: string,
      dto: ApplyChefDto,
    ): Promise<ChefPrivateProfileResponseDto> {
      const { existing } = await this.chefApplicationService.assertEligibleToApply(userId);

      const data: Prisma.ChefUpdateInput | Prisma.ChefCreateInput = {
        chefName:      dto.chefName,
        bio:           dto.bio,
        latitude:      new Prisma.Decimal(dto.latitude),
        longitude:     new Prisma.Decimal(dto.longitude),
        minOrderPrice: new Prisma.Decimal(dto.minOrderPrice),
        isVerified:    false,
        verifiedAt:    null,
        rejectedAt:    null,
        deletedAt:     null,
      };

      const chef = existing
        ? await this.prismaService.chef.update({
            where: { id: existing.id },
            data,
          })
        : await this.prismaService.chef.create({
            data: {
              ...(data as Prisma.ChefCreateInput),
              user:   { connect: { id: userId } },
              logo:   DEFAULT_CHEF_LOGO_URL,
              banner: DEFAULT_CHEF_BANNER_URL,
            },
          });

      this.chefEventLogger.applySuccess({
        actorUserId:   userId,
        applicationId: chef.id,
        sourceIp,
      });

      return ChefPrivateProfileResponseDto.fromEntity(chef, []);
    }
  }
  ```

- [ ] T024 [US1] Create the `ChefsController` with the apply endpoint. Create `<repo>\backend\src\modules\chefs\chefs.controller.ts`. Start with this skeleton — later tasks (T038, T047) extend the same controller:
  ```ts
  import { Body, Controller, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
  import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  import { RolesGuard } from '../../common/guards/roles.guard';
  import { Roles } from '../../common/decorators/roles.decorator';
  import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
  import { ChefsService } from './chefs.service';
  import { ApplyChefDto } from './dto/apply-chef.dto';
  import { ChefPrivateProfileResponseDto } from './dto/chef.response.dto';

  @ApiTags('ChefApply')
  @ApiBearerAuth()
  @Controller('chef')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class ChefsController {
    constructor(private readonly chefsService: ChefsService) {}

    @Post('apply')
    @HttpCode(201)
    @Roles('customer')
    @ApiOperation({ operationId: 'applyToBeAChef' })
    @ApiResponse({ status: 201, type: ChefPrivateProfileResponseDto })
    async apply(
      @CurrentUser() user: CurrentUserPayload,
      @Ip()         sourceIp: string,
      @Body()       dto: ApplyChefDto,
    ) {
      return this.chefsService.apply(user.sub, sourceIp, dto);
    }
  }
  ```

- [ ] T025 [US1] Create the `ChefsModule`. Create `<repo>\backend\src\modules\chefs\chefs.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { PrismaModule } from '../../common/prisma/prisma.module';
  import { LoggingModule } from '../../common/logging/logging.module';
  import { MenusModule } from '../menus/menus.module';
  import { StorageModule } from '../storage/storage.module';
  import { NotificationsModule } from '../notifications/notifications.module';
  import { UsersModule } from '../users/users.module';
  import { ChefsController } from './chefs.controller';
  import { ChefsService } from './chefs.service';
  import { ChefApplicationService } from './chef-application.service';

  @Module({
    imports: [PrismaModule, LoggingModule, MenusModule, StorageModule, NotificationsModule, UsersModule],
    controllers: [ChefsController],
    providers: [ChefsService, ChefApplicationService],
    exports: [ChefsService, ChefApplicationService],
  })
  export class ChefsModule {}
  ```
  Register `ChefsModule` in `<repo>\backend\src\app.module.ts` under `imports: []`.

### Mobile US1: apply screen, pending screen, route guard

- [ ] T026 [P] [US1] Create the mobile service module for chef-apply. Create `<repo>\mobile\services\chefApply.ts`:
  ```ts
  import { api } from './api';

  export interface ChefApplyPayload {
    chefName: string;
    bio: string;
    latitude: number;
    longitude: number;
    minOrderPrice: number;
  }

  export interface CooldownErrorPayload {
    code: 'APPLICATION_COOLDOWN_IN_EFFECT';
    earliestResubmitAt: string;
  }
  export interface PendingErrorPayload {
    code: 'APPLICATION_PENDING';
    applicationId: string;
  }
  export interface AlreadyChefErrorPayload {
    code: 'ALREADY_CHEF';
    chefId: string;
  }
  export type ApplyErrorPayload = CooldownErrorPayload | PendingErrorPayload | AlreadyChefErrorPayload;

  export async function applyToBeAChef(payload: ChefApplyPayload): Promise<void> {
    await api.post('/chef/apply', payload);
  }
  ```
  The `api` axios instance already handles 401 refresh from Phase 1. Components downstream catch the `409` and read `error.response.data.code` for the discriminator.

- [ ] T027 [P] [US1] Create the chef-apply screen. Create `<repo>\mobile\app\(auth)\chef-apply.tsx`. The screen has two steps; use a `useState<'location' | 'details'>('location')` to switch. **Use the `KitchenLocationPicker` component (T017) on the location step.** Use `t(key)` for every string. Use `useColors()` for every color. Validate locally (chef name 1–80, bio 1–1000, minOrderPrice > 0); show inline errors via the `t('chefApply.validation.*')` keys. On submit, call `applyToBeAChef` (T026) inside a `try { } catch (err) { ... }` and:
  - On 201: navigate to `/(auth)/pending-verification`.
  - On 409 with code `ALREADY_CHEF`: render an alert using `t('chefApply.error.alreadyChef')` and offer "Sign out" CTA.
  - On 409 with code `APPLICATION_PENDING`: navigate to `/(auth)/pending-verification`.
  - On 409 with code `APPLICATION_COOLDOWN_IN_EFFECT`: render an alert using `t('chefApply.error.cooldown', { date: <formatted earliestResubmitAt> })`.
  Reference the `nafas-design-system` skill chef-onboarding mockup for spacing / fonts / button style.

- [ ] T028 [P] [US1] Create the pending-verification holding screen. Create `<repo>\mobile\app\(auth)\pending-verification.tsx`. Render the `t('pending.title')` / `t('pending.body')` copy and a Sign-out CTA (`t('pending.signOutCta')`) that calls `signOut()` from `AuthContext`. Reference the design-system "holding state" mockup. No navigation actions other than sign-out.

- [ ] T029 [US1] Wire the role-driven `RouteGuard` in `_layout.tsx`. Open `<repo>\mobile\app\_layout.tsx`. The Phase 1 implementation routes signed-out → `/(auth)/welcome`. **Add** (do not remove) routing rules for these cases, IN THIS ORDER:
  1. If `user === null` → `/(auth)/welcome` (existing Phase 1 behaviour).
  2. If `user.role === 'admin'` → render a "Use the web dashboard" placeholder + Sign-out CTA (admins do not have a mobile app surface in v1). Implementation note: just route to `/(auth)/welcome` with a brief alert; do NOT add an admin tab bar.
  3. If `pendingApplication` (from `AuthContext` T016) is non-null AND `user.role === 'customer'` → `/(auth)/pending-verification` (FR-031).
  4. If `user.role === 'chef'` → `/(chef)` route group.
  5. Otherwise (customer with no pending application) → `/(tabs)` route group.
  Use the loading state from `AuthContext` to render a splash while `isLoading` is true.

**Checkpoint US1**: A signed-in customer can submit a chef application, lands on the pending screen, and reopening the app keeps them there. The backend logs `chef.apply / success` without any lat/lng. Cooldown / pending / already-chef refusals render localised messages.

---

## Phase 4: User Story 2 - Admin verifies a pending chef application (Priority: P1)

**Goal**: An admin opens the queue, verifies (or rejects with a reason) a pending application; the applicant transitions to the chef role, receives a notification, and on next session refresh lands on the chef tab bar. The admin can also revoke a verified chef (clarification Q5 — same module surface).

**Independent Test**: After US1 has seeded a pending application, an admin verifies it via the dashboard. A second mobile dev client signed in as the applicant moves to the chef tab bar without a sign-out/sign-in cycle. A non-admin caller is refused with `403 FORBIDDEN_ROLE`.

### Admin DTOs + service

- [ ] T030 [P] [US2] Create the admin DTOs. Create `<repo>\backend\src\modules\admin\dto\reject-application.dto.ts`:
  ```ts
  import { IsString, Length } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';
  export class RejectApplicationDto {
    @ApiProperty({ minLength: 1, maxLength: 1000 })
    @IsString()
    @Length(1, 1000)
    reason!: string;
  }
  ```
  And `<repo>\backend\src\modules\admin\dto\revoke-chef.dto.ts` with the same shape and class name `RevokeChefDto`.

- [ ] T031 [US2] Create the `AdminService` (verify / reject / revoke transactions, research R3). Create `<repo>\backend\src\modules\admin\admin.service.ts`:
  ```ts
  import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  import { Role } from '@prisma/client';
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { UsersService } from '../users/users.service';
  import { NotificationsService } from '../notifications/notifications.service';
  import { ChefEventLogger } from '../../common/logging/chef-event.logger';

  @Injectable()
  export class AdminService {
    constructor(
      private readonly prismaService: PrismaService,
      private readonly usersService: UsersService,
      private readonly notificationsService: NotificationsService,
      private readonly chefEventLogger: ChefEventLogger,
    ) {}

    async listPendingApplications(cursor: number, pageSize: number) {
      return this.prismaService.extended.chef.findMany({
        where:   { isVerified: false, rejectedAt: null /* deletedAt:null implicit via extended */ },
        orderBy: { createdAt: 'asc' },
        skip:    cursor,
        take:    pageSize,
        include: { user: { select: { fullName: true, phone: true } } },
      });
    }

    async listVerifiedChefs(cursor: number, pageSize: number, q?: string) {
      return this.prismaService.extended.chef.findMany({
        where: {
          isVerified: true,
          ...(q ? { chefName: { contains: q, mode: 'insensitive' } } : {}),
        },
        orderBy: { verifiedAt: 'desc' },
        skip:    cursor,
        take:    pageSize,
      });
    }

    async verifyApplication(adminId: string, sourceIp: string, chefId: string) {
      try {
        const result = await this.prismaService.$transaction(async (tx) => {
          const chef = await tx.chef.findUnique({ where: { id: chefId } });
          if (!chef) throw new NotFoundException('CHEF_NOT_FOUND');
          if (chef.deletedAt || chef.isVerified || chef.rejectedAt) {
            throw new ConflictException({ code: 'APPLICATION_NOT_PENDING' });
          }
          const updated = await tx.chef.update({
            where: { id: chefId },
            data:  { isVerified: true, verifiedAt: new Date() },
          });
          await this.usersService.setRole(chef.userId, Role.chef, tx);
          await this.notificationsService.create({
            userId: chef.userId,
            type:   'chef_verified',
            title:  { en: 'You are now a Nafas chef', ar: 'أصبحت طاهيًا في نفس' },
            body:   { en: 'Welcome — your kitchen is live on Nafas.', ar: 'مرحبًا، مطبخك الآن متاح على نفس.' },
            data:   { chefId },
            tx,
          });
          return { chef: updated, userId: chef.userId };
        });
        this.chefEventLogger.verifySuccess({ actorAdminId: adminId, chefId, sourceIp });
        await this.notificationsService.dispatchPush(result.userId, {
          title: 'You are now a Nafas chef',
          body:  'Welcome — your kitchen is live on Nafas.',
          data:  { chefId },
        });
        return result.chef;
      } catch (err) {
        if (err instanceof ConflictException) {
          this.chefEventLogger.verifyApplicationNotPending({ actorAdminId: adminId, chefId, sourceIp });
        }
        throw err;
      }
    }

    async rejectApplication(adminId: string, sourceIp: string, chefId: string, reason: string) {
      try {
        const result = await this.prismaService.$transaction(async (tx) => {
          const chef = await tx.chef.findUnique({ where: { id: chefId } });
          if (!chef) throw new NotFoundException('CHEF_NOT_FOUND');
          if (chef.deletedAt || chef.isVerified || chef.rejectedAt) {
            throw new ConflictException({ code: 'APPLICATION_NOT_PENDING' });
          }
          const updated = await tx.chef.update({
            where: { id: chefId },
            data:  { rejectedAt: new Date() },
          });
          await this.notificationsService.create({
            userId: chef.userId,
            type:   'chef_rejected',
            title:  { en: 'Your chef application was not approved', ar: 'لم تتم الموافقة على طلب الانضمام كطاه' },
            body:   { en: reason, ar: reason }, // spec FR-036 — admin reason verbatim in both slots
            data:   { chefId, reason },
            tx,
          });
          return { chef: updated, userId: chef.userId };
        });
        this.chefEventLogger.rejectSuccess({ actorAdminId: adminId, chefId, sourceIp });
        await this.notificationsService.dispatchPush(result.userId, {
          title: 'Your chef application was not approved',
          body:  reason,
          data:  { chefId, reason },
        });
        return result.chef;
      } catch (err) {
        if (err instanceof ConflictException) {
          this.chefEventLogger.rejectApplicationNotPending({ actorAdminId: adminId, chefId, sourceIp });
        }
        throw err;
      }
    }

    async revokeChef(adminId: string, sourceIp: string, chefId: string, reason: string) {
      try {
        const result = await this.prismaService.$transaction(async (tx) => {
          const chef = await tx.chef.findUnique({ where: { id: chefId } });
          if (!chef) throw new NotFoundException('CHEF_NOT_FOUND');
          if (!chef.isVerified || chef.deletedAt) {
            throw new ConflictException({ code: 'CHEF_NOT_VERIFIED' });
          }
          await tx.chef.update({
            where: { id: chefId },
            data:  { deletedAt: new Date(), isVerified: false },
          });
          await this.usersService.setRole(chef.userId, Role.customer, tx);
          await this.notificationsService.create({
            userId: chef.userId,
            type:   'chef_revoked',
            title:  { en: 'Your chef status has been revoked', ar: 'تم إلغاء صفة الطهي الخاصة بك' },
            body:   { en: reason, ar: reason },
            data:   { chefId, reason },
            tx,
          });
          return { userId: chef.userId };
        });
        this.chefEventLogger.revokeSuccess({ actorAdminId: adminId, chefId, sourceIp });
        await this.notificationsService.dispatchPush(result.userId, {
          title: 'Your chef status has been revoked',
          body:  reason,
          data:  { chefId, reason },
        });
      } catch (err) {
        if (err instanceof ConflictException) {
          this.chefEventLogger.revokeChefNotVerified({ actorAdminId: adminId, chefId, sourceIp });
        }
        throw err;
      }
    }
  }
  ```
  **Note**: `tx.chef.update({ data: { deletedAt: new Date(), isVerified: false } })` is the soft-delete inside the transaction. The Phase 0 `softDelete` extension method is also valid here, but inside a transaction the bare `update` is simpler and equivalent — the CI grep gate (`ci-no-hard-delete.sh`) only blocks `.delete(` calls.

- [ ] T032 [US2] Create the `AdminChefsController`. Create `<repo>\backend\src\modules\admin\admin-chefs.controller.ts`:
  ```ts
  import { Body, Controller, Delete, Get, HttpCode, Ip, Param, ParseIntPipe, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
  import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  import { RolesGuard } from '../../common/guards/roles.guard';
  import { Roles } from '../../common/decorators/roles.decorator';
  import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
  import { AdminService } from './admin.service';
  import { RejectApplicationDto } from './dto/reject-application.dto';
  import { RevokeChefDto } from './dto/revoke-chef.dto';

  @ApiTags('AdminChefs')
  @ApiBearerAuth()
  @Controller('admin/chefs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  export class AdminChefsController {
    constructor(private readonly adminService: AdminService) {}

    @Get('pending')
    @ApiOperation({ operationId: 'listPendingApplications' })
    listPending(
      @Query('cursor',   new ParseIntPipe({ optional: true })) cursor   = 0,
      @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 30,
    ) {
      return this.adminService.listPendingApplications(cursor, Math.min(pageSize, 50));
    }

    @Get()
    @ApiOperation({ operationId: 'listVerifiedChefs' })
    listVerified(
      @Query('q')        q?:        string,
      @Query('cursor',   new ParseIntPipe({ optional: true })) cursor   = 0,
      @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 30,
    ) {
      return this.adminService.listVerifiedChefs(cursor, Math.min(pageSize, 50), q);
    }

    @Patch(':id/verify')
    @ApiOperation({ operationId: 'verifyChef' })
    verify(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip()          sourceIp: string,
      @Param('id', new ParseUUIDPipe()) chefId: string,
    ) {
      return this.adminService.verifyApplication(admin.sub, sourceIp, chefId);
    }

    @Patch(':id/reject')
    @ApiOperation({ operationId: 'rejectChefApplication' })
    reject(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip()          sourceIp: string,
      @Param('id', new ParseUUIDPipe()) chefId: string,
      @Body()        dto: RejectApplicationDto,
    ) {
      return this.adminService.rejectApplication(admin.sub, sourceIp, chefId, dto.reason);
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({ operationId: 'revokeChef' })
    revoke(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip()          sourceIp: string,
      @Param('id', new ParseUUIDPipe()) chefId: string,
      @Body()        dto: RevokeChefDto,
    ) {
      return this.adminService.revokeChef(admin.sub, sourceIp, chefId, dto.reason);
    }
  }
  ```

- [ ] T033 [US2] Create the `AdminModule`. Create `<repo>\backend\src\modules\admin\admin.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { PrismaModule } from '../../common/prisma/prisma.module';
  import { LoggingModule } from '../../common/logging/logging.module';
  import { UsersModule } from '../users/users.module';
  import { NotificationsModule } from '../notifications/notifications.module';
  import { AdminChefsController } from './admin-chefs.controller';
  import { AdminService } from './admin.service';

  @Module({
    imports: [PrismaModule, LoggingModule, UsersModule, NotificationsModule],
    controllers: [AdminChefsController],
    providers: [AdminService],
  })
  export class AdminModule {}
  ```
  Register `AdminModule` in `<repo>\backend\src\app.module.ts` under `imports: []`.

### Backend `GET /auth/me` extension to include pending application

- [ ] T034 [US2] Extend `GET /auth/me` to surface the user's pending Chef application. Open `<repo>\backend\src\modules\auth\auth.service.ts` and find the `getMe` (or equivalent) method. In its return shape, **add** a `pendingApplication: { applicationId: string } | null` field, populated by reading `prismaService.extended.chef.findFirst({ where: { userId, isVerified: false, rejectedAt: null } })` (only matches the genuinely pending state — rejected and revoked rows are excluded). Return `null` when no pending row exists.

  Also extend the `MeResponseDto` shape (in the relevant DTO file under `<repo>\backend\src\modules\auth\dto\` or `<repo>\backend\src\modules\users\dto\`) to declare the new optional field. Do not remove or rename any existing field.

### Admin web pages (US2)

- [ ] T035 [P] [US2] Create the admin sign-in page. Create `<repo>\admin\app\(auth)\sign-in\page.tsx` — a simple form with `phone` + `password` inputs that calls `signIn('credentials', { phone, password, callbackUrl: '/dashboard' })` from `next-auth/react`. On failure, render an inline error. Style it against the `nafas-design-system` skill admin layout. Plain Tailwind, no fancy dnd here.

- [ ] T036 [P] [US2] Create the admin layout shell + sidebar. Create `<repo>\admin\components\Sidebar.tsx` listing three sidebar links — **Chef Applications** (`/dashboard/chef-applications`), **Categories** (`/dashboard/categories`), **Chefs** (`/dashboard/chefs`). Use Tailwind tokens that bind to the design-system palette (the admin Tailwind config Phase 0 set up already maps to the design system). Create `<repo>\admin\app\(dashboard)\layout.tsx` that wraps children in a flex layout with `<Sidebar />` on the left and a top header showing the signed-in admin's name and a Sign-out button (calling `signOut({ callbackUrl: '/sign-in' })`). Gate the layout: if the session role is not `admin`, `redirect('/sign-in')` server-side (use Next.js `getServerSession(authOptions)` + `redirect` from `next/navigation`).

- [ ] T037 [US2] Create the admin chef-applications page. Create `<repo>\admin\app\(dashboard)\chef-applications\page.tsx`. The page is a "use client" component that:
  1. Fetches `GET /api/v1/admin/chefs/pending` via `adminApi` (T019) on mount and on refresh.
  2. Renders a table with columns: Applicant Name, Phone, Chef Name, Bio (truncated), Min Order Price, Submitted At, Actions.
  3. Each row has two buttons: **Verify** (opens `ConfirmDialog` — see T038 — with "Are you sure?" copy) and **Reject** (opens a `ConfirmDialog` with a reason textarea, required, 1–1000 chars).
  4. On Verify confirm: `adminApi.patch('/admin/chefs/{id}/verify')`. Refresh the queue. Toast success.
  5. On Reject confirm: `adminApi.patch('/admin/chefs/{id}/reject', { reason })`. Refresh the queue. Toast success.
  6. Handle `409 APPLICATION_NOT_PENDING` by toasting "This application was already acted on by another admin" and refreshing the queue.

- [ ] T038 [P] [US2] Create the reusable `ConfirmDialog` component. Create `<repo>\admin\components\ConfirmDialog.tsx`. Props: `{ open: boolean; title: string; description: string; confirmLabel: string; onConfirm: () => Promise<void>; onClose: () => void; reasonRequired?: boolean }`. When `reasonRequired` is true, render a textarea (1–1000 chars, required) and pass its value to `onConfirm` via a closure. Use Tailwind for styling; no animation library needed.

- [ ] T039 [US2] Create the admin verified-chefs page (with the Revoke action). Create `<repo>\admin\app\(dashboard)\chefs\page.tsx`. The page mirrors T037 but:
  1. Fetches `GET /api/v1/admin/chefs` (the verified-only list).
  2. Each row has a single **Revoke** action that opens `ConfirmDialog` with a reason textarea, required.
  3. On confirm: `adminApi.delete('/admin/chefs/{id}', { data: { reason } })`. Refresh the list. Toast success.
  4. Handle `409 CHEF_NOT_VERIFIED` (e.g., another admin just revoked) by toasting and refreshing.

### Mobile US2: chef tab bar placeholders + role-driven nav switch

- [ ] T040 [P] [US2] Create the chef tab bar layout. Create `<repo>\mobile\app\(chef)\_layout.tsx` with an Expo Router `Tabs` component. Six tabs: dashboard, orders, menu, stats, schedule, profile. Use `t('chefTabs.*')` for tab labels. Use `useColors()` for tint colors. Tab icons via `@expo/vector-icons` Feather set — pick from `bar-chart-2`, `clipboard`, `menu`, `pie-chart`, `calendar`, `user`. Match the design-system "floating pill" chef tab-bar treatment (see the `nafas-design-system` skill mockup).

- [ ] T041 [P] [US2] Create the chef tab placeholders. Create six files, each a minimal screen rendering its own `t(key)` title and a "Coming soon" body. Phase 3 ships only the profile tab as a real screen (T046–T047); the others are placeholders for Phases 4–9:
  - `<repo>\mobile\app\(chef)\dashboard.tsx`
  - `<repo>\mobile\app\(chef)\orders.tsx`
  - `<repo>\mobile\app\(chef)\menu.tsx`
  - `<repo>\mobile\app\(chef)\stats.tsx`
  - `<repo>\mobile\app\(chef)\schedule.tsx`
  Use `<SafeAreaView>`, `<Text>` from React Native, and the `useColors()` hook for background / text colors.

**Checkpoint US2**: An admin verifies a pending application via the dashboard; the applicant sees a chef-tab-bar navigation on next foreground; a `chef_verified` notification record exists; the discovery surface (when US3 lands) returns the chef. Rejection refuses cooldown-violating re-applies on the FR-006 timer. Revocation soft-deletes the chef row, reverts the user role to customer, and emits a `chef_revoked` notification.

---

## Phase 5: User Story 3 - Customer discovers verified chefs (Priority: P1)

**Goal**: Customer's Explore tab lists verified chefs with filters (category, search, geo), opens any chef's public profile, and the public profile carries the chef's data (name, banner, logo, bio, rating, totalReviews, current open/closed state, category chips).

**Independent Test**: With three verified chefs seeded (one open, one closed, one in a different category), discovery surfaces all three, sorts open before closed, and each filter (category / search / radius) narrows the list correctly. The chef public profile renders with all required fields. A pending / rejected / soft-deleted chef is never returned.

### Discovery DTOs + Haversine + service

- [ ] T042 [P] [US3] Create `DiscoveryQueryDto`. Create `<repo>\backend\src\modules\chefs\dto\discovery-query.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

  export class DiscoveryQueryDto {
    @IsOptional() @IsUUID() categoryId?: string;
    @IsOptional() @IsString() @Length(1, 200) q?: string;

    @IsOptional() @Type(() => Number) @IsLatitude()   lat?: number;
    @IsOptional() @Type(() => Number) @IsLongitude()  lng?: number;
    @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(50) radiusKm?: number;

    @IsOptional() @Type(() => Number) @IsInt() @Min(0)             cursor?:   number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)    pageSize?: number;
  }
  ```

- [ ] T043 [P] [US3] Create the pure-JS Haversine helper. Create `<repo>\backend\src\modules\chefs\haversine.ts`:
  ```ts
  /**
   * Haversine great-circle distance in kilometres between two lat/lng pairs.
   * Pure JS, no deps. Used by chefs.service.findManyForDiscovery (research R2)
   * to close the IMPLEMENTATION_PLAN $queryRaw exception.
   */
  export function haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R   = 6371;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  ```

- [ ] T044 [P] [US3] Create `ChefCardResponseDto` + `ChefPublicProfileResponseDto`. Add to `<repo>\backend\src\modules\chefs\dto\chef.response.dto.ts` (same file as T021):
  - `ChefCardResponseDto` — Discovery list shape. Carries everything in `ChefPrivateProfileResponseDto` EXCEPT `latitude` / `longitude`, plus `distanceKm?: number`. **Per FR-039 the public surface NEVER returns lat/lng**; the optional `distanceKm` is the only location-derived value clients receive.
  - `ChefPublicProfileResponseDto` — Identical to `ChefCardResponseDto` plus `categoryIds: string[]`. (The chef's lat/lng remains private even on the public profile detail page.)
  Each has a `static fromEntity(chef, categoryIds?, distanceKm?)` helper that excludes lat/lng from the returned object.

- [ ] T045 [US3] Add discovery + public-profile + reviews methods to `ChefsService`. Open `<repo>\backend\src\modules\chefs\chefs.service.ts` (created at T023). Add these methods (preserve the existing `apply()` method):
  ```ts
  // import additions:
  // import { NotFoundException } from '@nestjs/common';
  // import { DiscoveryQueryDto } from './dto/discovery-query.dto';
  // import { ChefCardResponseDto, ChefPublicProfileResponseDto } from './dto/chef.response.dto';
  // import { MenusService } from '../menus/menus.service';
  // import { haversineKm } from './haversine';
  // and inject `private readonly menusService: MenusService` into the constructor.

  async findManyForDiscovery(query: DiscoveryQueryDto): Promise<ChefCardResponseDto[]> {
    const pageSize = query.pageSize ?? 30;
    const cursor   = query.cursor ?? 0;

    const where: Prisma.ChefWhereInput = { isVerified: true };

    if (query.categoryId) {
      const chefIds = await this.menusService.chefIdsInCategory(query.categoryId);
      if (chefIds.length === 0) return [];
      where.id = { in: chefIds };
    }
    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      where.OR = [
        { chefName: { contains: term, mode: 'insensitive' } },
        { bio:      { contains: term, mode: 'insensitive' } },
      ];
    }

    let radiusKm: number | null = null;
    if (query.lat !== undefined && query.lng !== undefined) {
      radiusKm = Math.min(query.radiusKm ?? 15, 50);
      const latOffset = radiusKm / 111;
      const lngOffset = radiusKm / (111 * Math.cos((query.lat * Math.PI) / 180));
      where.latitude  = { gte: query.lat - latOffset, lte: query.lat + latOffset } as unknown as Prisma.DecimalFilter;
      where.longitude = { gte: query.lng - lngOffset, lte: query.lng + lngOffset } as unknown as Prisma.DecimalFilter;
    }

    const candidates = await this.prismaService.extended.chef.findMany({
      where,
      orderBy: radiusKm === null ? [{ isOpen: 'desc' }, { verifiedAt: 'desc' }] : undefined,
      skip:    cursor,
      take:    pageSize,
    });

    if (radiusKm === null) {
      return candidates.map((c) => ChefCardResponseDto.fromEntity(c));
    }

    const withDistance = candidates
      .map((c) => ({
        chef:       c,
        distanceKm: haversineKm(query.lat!, query.lng!, Number(c.latitude), Number(c.longitude)),
      }))
      .filter((x) => x.distanceKm <= radiusKm!)
      .sort((a, b) => {
        if (a.chef.isOpen !== b.chef.isOpen) return a.chef.isOpen ? -1 : 1;
        return a.distanceKm - b.distanceKm;
      });

    return withDistance.map((x) => ChefCardResponseDto.fromEntity(x.chef, undefined, x.distanceKm));
  }

  async findPublicProfile(chefId: string): Promise<ChefPublicProfileResponseDto> {
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { id: chefId, isVerified: true },
    });
    if (!chef) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    const categoryIds = await this.menusService.categoriesForChef(chefId);
    return ChefPublicProfileResponseDto.fromEntity(chef, categoryIds);
  }

  async findReviewsForChef(chefId: string, cursor = 0, pageSize = 20) {
    // Phase 7 will replace this stub. For Phase 3, confirm the chef exists then return [].
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { id: chefId, isVerified: true },
      select: { id: true },
    });
    if (!chef) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    return [] as Array<{ id: string; userFullName: string; rating: number; body: string; images: string[]; createdAt: string }>;
  }
  ```
  **`Number(c.latitude)` is acceptable here** even though the Phase 0 convention says "never `Number(decimal)`". The latitude / longitude columns are not monetary — they are geographic decimals whose precision needs are well within JS Number range, and the Haversine formula needs `number` not `Decimal`. This is explicitly carved out as the only allowed `Number(decimal)` in Phase 3.

- [ ] T046 [US3] Add discovery + profile endpoints to `ChefsController`. Open `<repo>\backend\src\modules\chefs\chefs.controller.ts` (created at T024). Add a second controller block targeting the public-discovery base path. Because the chef-self endpoints live at `/chef/*` and public discovery lives at `/chefs/*`, the simplest approach is to add a **second controller class** in the same file (or a sibling file `chefs-discovery.controller.ts`). Recommended: create `<repo>\backend\src\modules\chefs\chefs-discovery.controller.ts`:
  ```ts
  import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
  import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  import { ChefsService } from './chefs.service';
  import { DiscoveryQueryDto } from './dto/discovery-query.dto';

  @ApiTags('Discovery')
  @ApiBearerAuth()
  @Controller('chefs')
  @UseGuards(JwtAuthGuard)
  export class ChefsDiscoveryController {
    constructor(private readonly chefsService: ChefsService) {}

    @Get()
    @ApiOperation({ operationId: 'discoverChefs' })
    discover(@Query() query: DiscoveryQueryDto) {
      return this.chefsService.findManyForDiscovery(query);
    }

    @Get(':id')
    @ApiOperation({ operationId: 'getChefPublicProfile' })
    publicProfile(@Param('id', new ParseUUIDPipe()) id: string) {
      return this.chefsService.findPublicProfile(id);
    }

    @Get(':id/reviews')
    @ApiOperation({ operationId: 'getChefReviews' })
    reviews(
      @Param('id', new ParseUUIDPipe()) id: string,
      @Query('cursor',   new ParseIntPipe({ optional: true })) cursor   = 0,
      @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20,
    ) {
      return this.chefsService.findReviewsForChef(id, cursor, Math.min(pageSize, 50));
    }
  }
  ```
  Register the new controller in `chefs.module.ts` (T025) under `controllers: [ChefsController, ChefsDiscoveryController]`.

### Categories public-read endpoint (US3 needs the chip data)

- [ ] T047 [P] [US3] Create the `CategoriesService` with the cached `listActive` method (research R7). Create `<repo>\backend\src\modules\categories\categories.service.ts`:
  ```ts
  import { Injectable } from '@nestjs/common';
  import { PrismaService } from '../../common/prisma/prisma.service';

  const CACHE_TTL_MS = 60_000;

  @Injectable()
  export class CategoriesService {
    constructor(private readonly prismaService: PrismaService) {}

    private cache: { value: unknown[]; ts: number } | null = null;

    async listActive(): Promise<unknown[]> {
      if (this.cache && Date.now() - this.cache.ts < CACHE_TTL_MS) {
        return this.cache.value;
      }
      const rows = await this.prismaService.extended.category.findMany({
        where:   { isActive: true },
        orderBy: { displayOrder: 'asc' },
      });
      this.cache = { value: rows, ts: Date.now() };
      return rows;
    }

    invalidateCache(): void {
      this.cache = null;
    }
  }
  ```
  (T060 / T061 / T062 etc. will add `create`, `update`, `softDelete`, `reorder` to this same file and each will call `this.invalidateCache()` at the end.)

- [ ] T048 [P] [US3] Create the `CategoriesController` with the public-read endpoint. Create `<repo>\backend\src\modules\categories\categories.controller.ts`:
  ```ts
  import { Controller, Get, UseGuards } from '@nestjs/common';
  import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  import { CategoriesService } from './categories.service';

  @ApiTags('Categories')
  @ApiBearerAuth()
  @Controller('categories')
  @UseGuards(JwtAuthGuard)
  export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) {}

    @Get()
    @ApiOperation({ operationId: 'listCategories' })
    list() {
      return this.categoriesService.listActive();
    }
  }
  ```
  (Later, T063 adds the admin-categories controller for mutations. Keep public reads and admin writes in separate controllers — same module though.)

- [ ] T049 [US3] Create the `CategoriesModule`. Create `<repo>\backend\src\modules\categories\categories.module.ts`:
  ```ts
  import { Module } from '@nestjs/common';
  import { PrismaModule } from '../../common/prisma/prisma.module';
  import { LoggingModule } from '../../common/logging/logging.module';
  import { CategoriesController } from './categories.controller';
  import { CategoriesService } from './categories.service';

  @Module({
    imports: [PrismaModule, LoggingModule],
    controllers: [CategoriesController],
    providers: [CategoriesService],
    exports: [CategoriesService],
  })
  export class CategoriesModule {}
  ```
  Register `CategoriesModule` in `<repo>\backend\src\app.module.ts`.

### Mobile US3: discovery list, chef public profile, customer tab bar

- [ ] T050 [P] [US3] Create the mobile chef-discovery service. Create `<repo>\mobile\services\chefs.ts`:
  ```ts
  import { api } from './api';

  export interface ChefCard {
    id: string;
    chefName: string;
    bio: string;
    logo: string;
    banner: string;
    isOpen: boolean;
    ratings: string;
    totalReviews: number;
    minOrderPrice: string;
    verifiedAt: string | null;
    distanceKm?: number;
  }
  export interface ChefPublicProfile extends ChefCard {
    categoryIds: string[];
  }
  export interface DiscoveryQuery {
    categoryId?: string;
    q?:          string;
    lat?:        number;
    lng?:        number;
    radiusKm?:   number;
    cursor?:     number;
    pageSize?:   number;
  }

  export async function discoverChefs(query: DiscoveryQuery): Promise<ChefCard[]> {
    const { data } = await api.get('/chefs', { params: query });
    return data;
  }
  export async function getChefPublicProfile(chefId: string): Promise<ChefPublicProfile> {
    const { data } = await api.get(`/chefs/${chefId}`);
    return data;
  }
  ```

- [ ] T051 [P] [US3] Create the mobile categories service. Create `<repo>\mobile\services\categories.ts`:
  ```ts
  import { api } from './api';

  export interface Category {
    id:           string;
    name:         { en: string; ar: string };
    icon:         string | null;
    displayOrder: number;
    isActive:     boolean;
    createdAt:    string;
    updatedAt:    string;
  }

  export async function listCategories(): Promise<Category[]> {
    const { data } = await api.get('/categories');
    return data;
  }
  ```

- [ ] T052 [P] [US3] Create the customer tab bar layout + placeholder tabs. Create `<repo>\mobile\app\(tabs)\_layout.tsx` with five tabs: home, explore, favorites, orders, profile. Tab labels via `t('customerTabs.*')`. Tab icons via Feather: `home`, `compass`, `heart`, `shopping-bag`, `user`. Then create the placeholder tab screens:
  - `<repo>\mobile\app\(tabs)\index.tsx` (Home placeholder — Phase 4 fills in)
  - `<repo>\mobile\app\(tabs)\favorites.tsx` (Phase 7 placeholder)
  - `<repo>\mobile\app\(tabs)\orders.tsx` (Phase 6 placeholder)
  - `<repo>\mobile\app\(tabs)\profile\index.tsx` — Phase 10 placeholder, BUT include a "Become a chef" CTA that navigates to `/(auth)/chef-apply`. This is the entry point US1 needs.
  Each placeholder uses `useColors()` + `t(key)` + `<SafeAreaView>`.

- [ ] T053 [US3] Create the chef discovery screen (the first **real** customer-facing screen). Create `<repo>\mobile\app\(tabs)\explore.tsx`. Behaviour:
  1. On mount, fetch `listCategories()` (T051) and render category chips horizontally at the top. Selecting one sets `categoryId` filter state; selecting the active one again clears the filter.
  2. Render a search input bound to a `q` state, debounced 400 ms.
  3. Fetch `discoverChefs({ categoryId, q })` and render the result as a vertical list of `<ChefCard>` rows. Each card shows banner (with logo overlapped in the corner), chef name, bio (truncated 2 lines), `t('discovery.openBadge')` or `t('discovery.closedBadge')` pill, `t('discovery.minOrder', { amount: card.minOrderPrice })`, and (when present) `t('discovery.distanceFormat', { km: card.distanceKm.toFixed(1) })`.
  4. On tap, navigate to `/chef/[id]` (T054).
  5. On scroll-end, paginate by re-fetching with `cursor += pageSize`.
  6. Empty state: `t('discovery.emptyState')`.
  Reference the design-system "chef card" preview for layout proportions. Use `useColors()` for every color.

- [ ] T054 [P] [US3] Create the public chef profile screen. Create `<repo>\mobile\app\chef\[id].tsx`. Reads `id` from `useLocalSearchParams()`. Fetches `getChefPublicProfile(id)` (T050) on mount. Layout (top to bottom):
  - Banner image (full-width, tappable to enlarge).
  - Logo (overlapping the banner's bottom edge — match the design-system mockup).
  - Chef name (heading) + Open/Closed pill.
  - Rating + total reviews row: render `{card.ratings}` (a JS string like "4.50") and `t('discovery.reviewCount', { count: card.totalReviews })`. Show "—" when totalReviews is 0 (Phase 7 will populate).
  - Min order price line: `t('discovery.minOrder', { amount: card.minOrderPrice })`.
  - Bio block.
  - Category chips row, derived from `card.categoryIds` joined against the cached `listCategories()` result. Localised name from `name[locale]`. If `categoryIds` is empty (the chef has no menus yet — Phase 4 hasn't landed), render "—".
  - Reviews section: heading + empty state `t('chefPublicProfile.noReviewsYet')` (Phase 7 fills).
  Reference the design-system "chef profile" mockup.

**Checkpoint US3**: A signed-in customer browses verified chefs in the Explore tab, filters by category, searches by name, opens any chef's public profile, and sees their data. Pending / rejected / soft-deleted chefs never appear. The bounding-box discovery query (T045) consumes the new `(is_verified, latitude, longitude)` index.

---

## Phase 6: User Story 4 - Verified chef manages their public profile (Priority: P2)

**Goal**: A verified chef toggles open/closed, edits name / bio / min-order-price / coordinates, and replaces logo + banner. Changes show on the public surface immediately. Wrong file type / oversize file is refused with clear validation.

**Independent Test**: A verified chef toggles open↔closed and edits each of {name, bio, minOrderPrice, logo, banner}. A second customer's discovery surface reflects the new values after a refresh.

### Chef-profile DTOs + service methods

- [ ] T055 [P] [US4] Create `UpdateChefProfileDto` and `UpdateAvailabilityDto`. Create `<repo>\backend\src\modules\chefs\dto\update-chef-profile.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import { IsBoolean, IsLatitude, IsLongitude, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';

  export class UpdateChefProfileDto {
    @IsOptional() @IsString() @Length(1, 80) @ApiProperty({ required: false }) chefName?: string;
    @IsOptional() @IsString() @Length(1, 1000) @ApiProperty({ required: false }) bio?: string;
    @IsOptional() @Type(() => Number) @IsLatitude()  @ApiProperty({ required: false }) latitude?: number;
    @IsOptional() @Type(() => Number) @IsLongitude() @ApiProperty({ required: false }) longitude?: number;
    @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @ApiProperty({ required: false }) minOrderPrice?: number;
  }

  export class UpdateAvailabilityDto {
    @IsBoolean() @ApiProperty() isOpen!: boolean;
  }
  ```

- [ ] T056 [US4] Add `findOwnedOrThrow`, `updateProfile`, `toggleOpen`, `replaceLogo`, `replaceBanner` to `ChefsService`. Open `<repo>\backend\src\modules\chefs\chefs.service.ts`. Add:
  ```ts
  // import additions (merge with existing imports — do not duplicate lines):
  // import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
  // import { Chef } from '@prisma/client';   // <- new; merge into existing `@prisma/client` import if present
  // import { StorageService } from '../storage/storage.service';
  // import { UpdateChefProfileDto, UpdateAvailabilityDto } from './dto/update-chef-profile.dto';
  // and inject `private readonly storageService: StorageService` into the constructor.

  private readonly ACCEPTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  /** Single-find ownership shape per Phase 2 R4 — returns 404 NotFoundException when the chef is not owned by `userId`. */
  async findOwnedOrThrow(userId: string): Promise<Chef> {
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { userId, isVerified: true },
    });
    if (!chef) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    return chef;
  }

  async updateProfile(userId: string, sourceIp: string, dto: UpdateChefProfileDto): Promise<ChefPrivateProfileResponseDto> {
    const chef = await this.findOwnedOrThrow(userId);
    const updated = await this.prismaService.chef.update({
      where: { id: chef.id },
      data: {
        ...(dto.chefName      !== undefined ? { chefName:      dto.chefName }                                 : {}),
        ...(dto.bio           !== undefined ? { bio:           dto.bio }                                      : {}),
        ...(dto.latitude      !== undefined ? { latitude:      new Prisma.Decimal(dto.latitude) }             : {}),
        ...(dto.longitude     !== undefined ? { longitude:     new Prisma.Decimal(dto.longitude) }            : {}),
        ...(dto.minOrderPrice !== undefined ? { minOrderPrice: new Prisma.Decimal(dto.minOrderPrice) }        : {}),
      },
    });
    this.chefEventLogger.profileUpdateSuccess({ actorChefId: userId, chefId: updated.id, sourceIp });
    const categoryIds = await this.menusService.categoriesForChef(updated.id);
    return ChefPrivateProfileResponseDto.fromEntity(updated, categoryIds);
  }

  async toggleOpen(userId: string, sourceIp: string, dto: UpdateAvailabilityDto): Promise<ChefPrivateProfileResponseDto> {
    const chef = await this.findOwnedOrThrow(userId);
    const updated = await this.prismaService.chef.update({
      where: { id: chef.id },
      data:  { isOpen: dto.isOpen },
    });
    this.chefEventLogger.availabilityToggleSuccess({
      actorChefId: userId, chefId: updated.id, isOpen: dto.isOpen, sourceIp,
    });
    const categoryIds = await this.menusService.categoriesForChef(updated.id);
    return ChefPrivateProfileResponseDto.fromEntity(updated, categoryIds);
  }

  async replaceLogo(userId: string, sourceIp: string, file: { mimetype: string; size: number; buffer: Buffer }): Promise<ChefPrivateProfileResponseDto> {
    return this.replaceChefImage(userId, sourceIp, file, 'logo');
  }
  async replaceBanner(userId: string, sourceIp: string, file: { mimetype: string; size: number; buffer: Buffer }): Promise<ChefPrivateProfileResponseDto> {
    return this.replaceChefImage(userId, sourceIp, file, 'banner');
  }

  private async replaceChefImage(
    userId: string,
    sourceIp: string,
    file: { mimetype: string; size: number; buffer: Buffer },
    kind: 'logo' | 'banner',
  ): Promise<ChefPrivateProfileResponseDto> {
    const event = kind === 'logo' ? 'logoUpload' : 'bannerUpload';
    if (!this.ACCEPTED_IMAGE_MIMES.has(file.mimetype)) {
      this.chefEventLogger[`${event}UnsupportedMediaType`]({ actorChefId: userId, mimeType: file.mimetype, sourceIp });
      throw new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    }
    if (file.size > this.MAX_IMAGE_BYTES) {
      this.chefEventLogger[`${event}PayloadTooLarge`]({ actorChefId: userId, byteSize: file.size, sourceIp });
      throw new PayloadTooLargeException({ code: 'PAYLOAD_TOO_LARGE' });
    }
    const chef = await this.findOwnedOrThrow(userId);
    const bucket = kind === 'logo' ? 'chef-logos' : 'chef-banners';
    const ext    = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype === 'image/png' ? 'png' : 'webp';
    const path   = `${chef.id}/${Date.now()}.${ext}`;
    const publicUrl = await this.storageService.upload(bucket, path, file.buffer, file.mimetype);

    const updated = await this.prismaService.chef.update({
      where: { id: chef.id },
      data:  kind === 'logo' ? { logo: publicUrl } : { banner: publicUrl },
    });
    this.chefEventLogger[`${event}Success`]({ actorChefId: userId, chefId: updated.id, sourceIp });
    const categoryIds = await this.menusService.categoriesForChef(updated.id);
    return ChefPrivateProfileResponseDto.fromEntity(updated, categoryIds);
  }
  ```

- [ ] T057 [US4] Add the chef-self endpoints to `ChefsController` (T024). Open `<repo>\backend\src\modules\chefs\chefs.controller.ts`. Add these handlers to the existing controller class:
  ```ts
  // import additions:
  // import { Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
  // import { FileInterceptor } from '@nestjs/platform-express';
  // import { ApiConsumes } from '@nestjs/swagger';
  // import { UpdateChefProfileDto, UpdateAvailabilityDto } from './dto/update-chef-profile.dto';

  @Patch('profile')
  @Roles('chef')
  @ApiOperation({ operationId: 'updateChefProfile' })
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Ip()          sourceIp: string,
    @Body()        dto: UpdateChefProfileDto,
  ) {
    return this.chefsService.updateProfile(user.sub, sourceIp, dto);
  }

  @Patch('availability')
  @Roles('chef')
  @ApiOperation({ operationId: 'toggleChefAvailability' })
  toggleAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Ip()          sourceIp: string,
    @Body()        dto: UpdateAvailabilityDto,
  ) {
    return this.chefsService.toggleOpen(user.sub, sourceIp, dto);
  }

  @Post('logo')
  @Roles('chef')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'replaceChefLogo' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  replaceLogo(
    @CurrentUser()  user: CurrentUserPayload,
    @Ip()           sourceIp: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.chefsService.replaceLogo(user.sub, sourceIp, file);
  }

  @Post('banner')
  @Roles('chef')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'replaceChefBanner' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  replaceBanner(
    @CurrentUser()  user: CurrentUserPayload,
    @Ip()           sourceIp: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.chefsService.replaceBanner(user.sub, sourceIp, file);
  }
  ```
  Note: the `FileInterceptor` limit of 5 MB makes the framework refuse oversize uploads at the multipart parser layer; the service's own size check is defence in depth.

### Mobile US4: chef profile editor

- [ ] T058 [P] [US4] Create the mobile chef-profile service. Create `<repo>\mobile\services\chefProfile.ts`:
  ```ts
  import { api } from './api';
  import type { ChefPublicProfile } from './chefs';

  export interface UpdateChefProfilePayload {
    chefName?:      string;
    bio?:           string;
    latitude?:      number;
    longitude?:     number;
    minOrderPrice?: number;
  }

  export async function updateChefProfile(payload: UpdateChefProfilePayload) {
    const { data } = await api.patch('/chef/profile', payload);
    return data;
  }
  export async function toggleChefAvailability(isOpen: boolean) {
    const { data } = await api.patch('/chef/availability', { isOpen });
    return data;
  }
  export async function replaceLogo(uri: string, mimeType: string) {
    return uploadImage('/chef/logo', uri, mimeType);
  }
  export async function replaceBanner(uri: string, mimeType: string) {
    return uploadImage('/chef/banner', uri, mimeType);
  }

  async function uploadImage(path: string, uri: string, mimeType: string) {
    const form = new FormData();
    // React Native FormData is fine with the { uri, type, name } shape:
    form.append('file', { uri, type: mimeType, name: 'upload' } as unknown as Blob);
    const { data } = await api.post(path, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
  ```

- [ ] T059 [US4] Create the chef profile editor screen. Create `<repo>\mobile\app\(chef)\profile.tsx`. This is the **only real chef-side screen** Phase 3 ships (others are placeholders). Layout (top to bottom):
  1. Header: banner (tappable to replace) + logo overlapping (tappable to replace).
  2. Kitchen-open chip: a segmented control with `t('chefProfile.editor.openToggle')` / `t('chefProfile.editor.closeToggle')`. On change, optimistically toggle then call `toggleChefAvailability` (T058).
  3. Editable fields: chef name, bio (multiline), min order price (numeric keyboard).
  4. Save button calls `updateChefProfile` with whatever fields changed. On success, refresh the local state from the response.
  5. Logo / banner upload buttons use `expo-image-picker` (already in Phase 0 deps) to pick a JPEG / PNG / WebP under 5 MB (validate client-side; the backend re-validates), then `replaceLogo` / `replaceBanner`.
  6. On `415 UNSUPPORTED_MEDIA_TYPE` from the backend, render `t('chefProfile.upload.unsupportedType')`. On `413 PAYLOAD_TOO_LARGE`, render `t('chefProfile.upload.tooLarge')`.
  7. Sign-out CTA at the bottom (calls `signOut()` from `AuthContext`).
  Reference the design-system "chef self-edit" mockup for spacing and field layout.

**Checkpoint US4**: A verified chef edits their public profile, toggles open/closed, and uploads images. The discovery surface reflects each change on the next read.

---

## Phase 7: User Story 5 - Admin curates the food-category catalogue (Priority: P2)

**Goal**: An admin reads, creates, edits, soft-deletes, and bulk-reorders categories via the admin dashboard. The customer-facing list reflects each change on the next read.

**Independent Test**: An admin adds one category, edits one display name, soft-deletes one, and drags to reorder. A second customer device sees the changes on the discovery surface's category chips after a refresh.

### Categories DTOs + admin endpoints

- [ ] T060 [P] [US5] Create the category mutation DTOs. Create `<repo>\backend\src\modules\categories\dto\create-category.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import { IsInt, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';

  class CategoryNameDto {
    @IsString() @Length(1, 80) @ApiProperty() en!: string;
    @IsString() @Length(1, 80) @ApiProperty() ar!: string;
  }

  export class CreateCategoryDto {
    @ValidateNested() @Type(() => CategoryNameDto) @ApiProperty({ type: CategoryNameDto }) name!: CategoryNameDto;
    @IsOptional() @IsString() @Length(1, 40) @ApiProperty({ required: false }) icon?: string;
    @IsInt() @Min(0) @ApiProperty({ minimum: 0 }) displayOrder!: number;
  }
  ```
  Create `<repo>\backend\src\modules\categories\dto\update-category.dto.ts` with the same `name` / `icon` / `displayOrder` fields but all marked `@IsOptional()`. Create `<repo>\backend\src\modules\categories\dto\reorder-categories.dto.ts`:
  ```ts
  import { Type } from 'class-transformer';
  import { ArrayMinSize, ArrayUnique, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';

  class ReorderItemDto {
    @IsUUID() @ApiProperty({ format: 'uuid' }) id!: string;
    @IsInt() @Min(0)  @ApiProperty({ minimum: 0 }) displayOrder!: number;
  }
  export class ReorderCategoriesDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayUnique((item: ReorderItemDto) => item.id)
    @ValidateNested({ each: true })
    @Type(() => ReorderItemDto)
    @ApiProperty({ type: [ReorderItemDto] })
    items!: ReorderItemDto[];
  }
  ```
  Note: `class-validator` ships `@ArrayUnique(identifier?)` as a built-in decorator. For an array of objects, pass a key-extractor: `@ArrayUnique((item: ReorderItemDto) => item.id)`. Apply it on `items` to enforce that each category ID appears at most once in the reorder payload. No custom decorator is needed.

- [ ] T061 [US5] Add mutation methods to `CategoriesService`. Open `<repo>\backend\src\modules\categories\categories.service.ts` (T047). Add:
  ```ts
  // import additions:
  // import { NotFoundException } from '@nestjs/common';
  // import { Prisma } from '@prisma/client';

  async create(data: { name: { en: string; ar: string }; icon?: string; displayOrder: number }) {
    const created = await this.prismaService.category.create({
      data: {
        name: data.name as unknown as Prisma.InputJsonValue,
        icon: data.icon,
        displayOrder: data.displayOrder,
        isActive: true,
      },
    });
    this.invalidateCache();
    return created;
  }

  async update(id: string, patch: { name?: { en?: string; ar?: string }; icon?: string; displayOrder?: number }) {
    const existing = await this.prismaService.extended.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });

    let mergedName = existing.name as unknown as { en: string; ar: string };
    if (patch.name) mergedName = { ...mergedName, ...patch.name };

    const updated = await this.prismaService.category.update({
      where: { id },
      data: {
        ...(patch.name         !== undefined ? { name:         mergedName as unknown as Prisma.InputJsonValue } : {}),
        ...(patch.icon         !== undefined ? { icon:         patch.icon }                                    : {}),
        ...(patch.displayOrder !== undefined ? { displayOrder: patch.displayOrder }                            : {}),
      },
    });
    this.invalidateCache();
    return updated;
  }

  async softDelete(id: string) {
    const existing = await this.prismaService.extended.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    await this.prismaService.category.softDelete({ id });
    this.invalidateCache();
  }

  async reorder(items: Array<{ id: string; displayOrder: number }>) {
    await this.prismaService.$transaction(
      items.map((i) =>
        this.prismaService.category.update({ where: { id: i.id }, data: { displayOrder: i.displayOrder } }),
      ),
    );
    this.invalidateCache();
    return this.listActive();
  }
  ```

- [ ] T062 [US5] Create the admin-categories controller. Create `<repo>\backend\src\modules\categories\admin-categories.controller.ts`:
  ```ts
  import { Body, Controller, Delete, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
  import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
  import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  import { RolesGuard } from '../../common/guards/roles.guard';
  import { Roles } from '../../common/decorators/roles.decorator';
  import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
  import { CategoriesService } from './categories.service';
  import { CategoryEventLogger } from '../../common/logging/category-event.logger';
  import { CreateCategoryDto } from './dto/create-category.dto';
  import { UpdateCategoryDto } from './dto/update-category.dto';
  import { ReorderCategoriesDto } from './dto/reorder-categories.dto';

  @ApiTags('Categories')
  @ApiBearerAuth()
  @Controller('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  export class AdminCategoriesController {
    constructor(
      private readonly categoriesService: CategoriesService,
      private readonly categoryEventLogger: CategoryEventLogger,
    ) {}

    @Post()
    @ApiOperation({ operationId: 'createCategory' })
    async create(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip() sourceIp: string,
      @Body() dto: CreateCategoryDto,
    ) {
      const created = await this.categoriesService.create(dto);
      this.categoryEventLogger.createSuccess({ actorAdminId: admin.sub, categoryId: created.id, sourceIp });
      return created;
    }

    @Patch(':id')
    @ApiOperation({ operationId: 'updateCategory' })
    async update(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip() sourceIp: string,
      @Param('id', new ParseUUIDPipe()) id: string,
      @Body() dto: UpdateCategoryDto,
    ) {
      const updated = await this.categoriesService.update(id, dto);
      this.categoryEventLogger.updateSuccess({ actorAdminId: admin.sub, categoryId: id, sourceIp });
      return updated;
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({ operationId: 'softDeleteCategory' })
    async remove(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip() sourceIp: string,
      @Param('id', new ParseUUIDPipe()) id: string,
    ) {
      await this.categoriesService.softDelete(id);
      this.categoryEventLogger.deleteSuccess({ actorAdminId: admin.sub, categoryId: id, sourceIp });
    }

    @Patch('reorder')
    @ApiOperation({ operationId: 'reorderCategories' })
    async reorder(
      @CurrentUser() admin: CurrentUserPayload,
      @Ip() sourceIp: string,
      @Body() dto: ReorderCategoriesDto,
    ) {
      const result = await this.categoriesService.reorder(dto.items);
      this.categoryEventLogger.reorderSuccess({ actorAdminId: admin.sub, itemsCount: dto.items.length, sourceIp });
      return result;
    }
  }
  ```
  Register `AdminCategoriesController` in `categories.module.ts` (T049) under `controllers: [CategoriesController, AdminCategoriesController]`.

### Admin web US5: categories page

- [ ] T063 [US5] Create the admin categories page with drag-reorder. Create `<repo>\admin\app\(dashboard)\categories\page.tsx`. The page is a "use client" component. On mount, `adminApi.get('/categories')` for the active list. Layout:
  1. Header with a **+ Add Category** button that opens a modal form (name.en, name.ar, icon, displayOrder).
  2. A list rendered via the `SortableCategoryList` component (T064). Each row has the category's `name.en` / `name.ar`, icon glyph, Edit button (opens modal), Delete button (opens `ConfirmDialog`).
  3. On row drop after a drag: collect the new ordering and call `adminApi.patch('/admin/categories/reorder', { items: [{ id, displayOrder }] })`. On success, toast "Reorder saved" and refetch.
  4. On create / update / delete: call the matching admin endpoint, refetch.

- [ ] T064 [P] [US5] Create the `SortableCategoryList` dnd component. Create `<repo>\admin\components\SortableCategoryList.tsx`. Use `@dnd-kit/core` + `@dnd-kit/sortable` (already installed in Phase 0). Props: `{ items: Array<{ id: string; nameEn: string; nameAr: string; icon: string | null }>; onReorder: (items: Array<{ id: string; displayOrder: number }>) => Promise<void>; onEdit: (id: string) => void; onDelete: (id: string) => void }`. Standard dnd-kit sortable pattern — refer to the dnd-kit docs (`useSortable`, `SortableContext`, `DndContext`). After drop, compute the new ordering as `[...items].map((it, idx) => ({ id: it.id, displayOrder: idx }))` and pass to `onReorder`.

**Checkpoint US5**: Admin creates, edits, soft-deletes, and reorders categories via the dashboard. The customer's discovery surface reflects each change on the next read. The reorder is atomic — a forced mid-reorder failure leaves the customer-facing list fully-old or fully-new.

---

## Phase 8: User Story 6 - Bilingual + RTL parity (Priority: P3)

**Goal**: Verify every Phase 3 customer-facing mobile surface renders correctly in both English and Arabic with right-to-left layout. Verify every Phase 3 notification body / title is bilingual.

**Independent Test**: A customer with Arabic in-app language exercises every Phase 3 surface (apply, holding, discovery, chef profile, chef profile editor, kitchen toggle, image upload dialog, validation errors, notification renders). Every visible string is Arabic with right-to-left layout.

### Verification + missing-key check

- [ ] T065 [P] [US6] Add an automated missing-i18n-key check. Create `<repo>\mobile\scripts\check-i18n-keys.ts`:
  ```ts
  /**
   * Asserts mobile/constants/i18n/en.ts and mobile/constants/i18n/ar.ts
   * carry identical key sets. Exits non-zero on any asymmetric key.
   * Run via: npx ts-node mobile/scripts/check-i18n-keys.ts
   */
  import { en } from '../constants/i18n/en';
  import { ar } from '../constants/i18n/ar';

  function flatten(obj: unknown, prefix = ''): string[] {
    if (obj === null || typeof obj !== 'object') return [];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      return typeof v === 'object' && v !== null ? flatten(v, path) : [path];
    });
  }

  const enKeys = new Set(flatten(en));
  const arKeys = new Set(flatten(ar));
  const missingInAr = [...enKeys].filter(k => !arKeys.has(k));
  const missingInEn = [...arKeys].filter(k => !enKeys.has(k));
  if (missingInAr.length || missingInEn.length) {
    console.error('i18n asymmetry detected:');
    console.error('  Missing in ar.ts:', missingInAr);
    console.error('  Missing in en.ts:', missingInEn);
    process.exit(1);
  }
  console.log(`✓ Both locales carry ${enKeys.size} keys.`);
  ```
  Run it once now (`cd mobile; npx ts-node scripts/check-i18n-keys.ts`); fix any missing keys.

- [ ] T066 [US6] Walk through each Phase 3 customer-facing mobile surface in both English and Arabic, **on a real device**. The list (per spec FR-034): chef-apply (both location and details steps), pending-verification, customer tab bar, explore (discovery), chef public profile, chef tab bar, chef profile editor, kitchen toggle, image upload dialog, every validation error you can trigger, the in-app render of `chef_verified` / `chef_rejected` / `chef_revoked` notifications (if reachable through the Phase 8 surface; otherwise this verification waits for Phase 8). Confirm: every string is localised, no English fallback leaks in Arabic mode, layout direction matches the locale (`isRTL`), and the design-system mockups are honoured. Note any drift in this task's comment thread and fix in a follow-up.

**Checkpoint US6**: Both locales are key-symmetric. Every Phase 3 customer-facing mobile surface renders correctly in Arabic with right-to-left layout.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Tests, hardening, docs, and tidying — affects multiple user stories.

### Backend integration tests

- [ ] T067 [P] Create the chef-apply + chef-self-mutation integration test. Create `<repo>\backend\test\chefs.e2e-spec.ts`. Suites and cases:
  - "POST /chef/apply" — happy path: signed-in customer with no prior application submits a complete body, response is 201, `Chef` row in pending state, `chef.apply / success` log line is emitted with no lat/lng.
  - "POST /chef/apply" — `400 VALIDATION_ERROR` for: missing chefName, missing bio, missing latitude, missing longitude, missing minOrderPrice, non-positive minOrderPrice, extra undocumented field.
  - "POST /chef/apply" — `409 APPLICATION_PENDING` when re-submitted while pending.
  - "POST /chef/apply" — `409 ALREADY_CHEF` when caller is already verified (set up via the test admin fixture verifying first).
  - "POST /chef/apply" — `409 APPLICATION_COOLDOWN_IN_EFFECT` when called within 24 h of a rejection. Set up by inserting `rejectedAt = now() - 1h` directly via the test Prisma client.
  - "POST /chef/apply" — re-apply succeeds after the cooldown elapses (insert `rejectedAt = now() - 25h`). The `Chef` row is updated in place; `rejectedAt` and `deletedAt` are null afterwards.
  - **"PATCH /chef/profile"** — **FR-024 / SC-012 ownership check across two verified chefs**. Seed two verified chefs (chef-A and chef-B) via the `verifiedChef` fixture from T073. Authenticate as chef-A and `PATCH /api/v1/chef/profile` with a valid body — the endpoint is path-less, so this targets chef-A's own row and should succeed with 200. Then **directly call `prisma.chef.update({ where: { id: chefB.id }, data: { chefName: 'hacked' } })` cannot be reached over the HTTP surface** because `/chef/profile` does not accept a chef id; the ownership check is implicit in `findOwnedOrThrow(userId)`. Add a regression assertion instead: after chef-A's PATCH, fetch chef-B's profile via the test prisma client and assert chef-B's row is unchanged. (The endpoint shape closes the cross-owner attack at the protocol layer — there is no way to address another chef's row from a chef-authenticated request.)
  - **"DELETE /chef/profile target enumeration"** — assert that no Phase 3 chef-self endpoint accepts a chef id in the path or body. Confirm with a string grep of `<repo>\backend\src\modules\chefs\chefs.controller.ts` that no `@Param('id')` is present on any handler decorated with `@Roles('chef')`. This guarantees the FR-024 ownership-by-construction contract.

  Use the Phase 1 / Phase 2 test bootstrap (`createApp()`, signed-in-customer fixture).

- [ ] T068 [P] Create the admin-chefs integration test. Create `<repo>\backend\test\admin-chefs.e2e-spec.ts`. Suites and cases:
  - "PATCH /admin/chefs/:id/verify" — happy path: admin verifies a pending Chef, response is 200, `Chef.isVerified=true`, `User.role=chef`, a `chef_verified` Notification exists. The Phase 3 log line `chef.verify / success` is emitted.
  - "PATCH /admin/chefs/:id/verify" — `409 APPLICATION_NOT_PENDING` when the chef is already verified, rejected, or soft-deleted.
  - "PATCH /admin/chefs/:id/verify" — `403 FORBIDDEN_ROLE` for a non-admin caller.
  - "PATCH /admin/chefs/:id/reject" — happy path: reason captured in the Notification body (en + ar both equal to the admin-typed reason). `Chef.rejectedAt` set. `User.role` unchanged.
  - "DELETE /admin/chefs/:id" — happy path: chef soft-deleted, `User.role` reverted to `customer`, `chef_revoked` Notification exists.
  - "DELETE /admin/chefs/:id" — `409 CHEF_NOT_VERIFIED` against a pending / rejected / already-revoked chef.
  - **"PATCH /admin/chefs/:id/reject — extra-field rejection"** — send `{ reason: 'valid reason', extra: 'field' }`. Assert `400 VALIDATION_ERROR`. (SC-018 explicit coverage.)
  - **"DELETE /admin/chefs/:id — extra-field rejection"** — send `{ reason: 'valid reason', extra: 'field' }`. Assert `400 VALIDATION_ERROR`. (SC-018 explicit coverage.)
  - **"PATCH /admin/chefs/:id/verify — extra-field rejection"** — verify has no body, but Nest's global pipe still rejects an unexpected body. Send `{ extra: 'field' }`. Assert `400 VALIDATION_ERROR`. (SC-018 explicit coverage.)

- [ ] T069 [P] Create the concurrent-verify race test. Create `<repo>\backend\test\concurrency-verify.e2e-spec.ts`. Seed one pending application. Issue two `PATCH /admin/chefs/:id/verify` requests in parallel (`Promise.all`). Assert exactly one returns 200, the other returns `409 APPLICATION_NOT_PENDING`. Assert the resulting database state: `Chef.isVerified=true` (exactly one update), one `User.role=chef`, exactly one `chef_verified` Notification row.

- [ ] T070 [P] Create the discovery integration test. Create `<repo>\backend\test\discovery.e2e-spec.ts`. Seed eight verified chefs at distributed lat/lng points around a test centre (30.0444, 31.2357) using a helper `seedManyChefs(N, centre, categoryDistribution)` from the test fixtures (T076). Cases:
  - List all → 8 chefs, open-first then verified-newest-first.
  - Category filter narrows to chefs whose seeded menu carries that category (uses `seedMenu(chef, category)` from fixtures).
  - Search filter `q='Umm'` narrows by name / bio substring.
  - Radius filter `lat, lng, radiusKm=10` excludes chefs outside the 10 km circle; sort is closest-first.
  - Default radius 15 km applies when only `lat, lng` are supplied.
  - `radiusKm=80` is clamped to 50 km at the service layer.
  - Pending / rejected / soft-deleted chefs (seeded explicitly) NEVER appear in any response.
  - `distanceKm` is populated only when the radius filter applies.
  - **FR-029 soft-deleted-category continuity**: seed one chef whose only active menu references a category that the admin then soft-deletes. After the soft-delete: (a) `GET /categories` no longer returns the category; (b) `GET /chefs?categoryId=<soft-deleted>` returns an empty list (the deleted category cannot be supplied as a filter from the customer surface anyway, but the test forces it directly); (c) `GET /chefs` (no `categoryId` filter) still returns the chef — the chef's discoverability is unaffected by the category soft-delete; (d) the chef's public profile still lists the (now-orphaned) categoryId in `categoryIds` because `menus.service.categoriesForChef` doesn't filter on Category soft-delete (the Menu row is what determines membership). This last point preserves Menu audit history per FR-029.

- [ ] T071 [P] Create the categories integration test. Create `<repo>\backend\test\categories.e2e-spec.ts`. Cases:
  - `GET /categories` returns the eight seeded categories with both `name.en` and `name.ar` populated, ordered by `displayOrder`.
  - `POST /admin/categories` creates a new category; subsequent `GET /categories` includes it after cache invalidation (no waiting needed since the same service invalidates the cache synchronously).
  - `PATCH /admin/categories/:id` updates a category.
  - `DELETE /admin/categories/:id` soft-deletes it; subsequent `GET /categories` excludes it.
  - `PATCH /admin/categories/reorder` with a valid body updates all referenced rows atomically.
  - Atomicity test: simulate a mid-reorder failure by passing an item with an unknown UUID. Assert the entire reorder is rolled back (no displayOrder changes are committed). The test name "atomic reorder" is referenced by quickstart Step 8.
  - Role refusal: non-admin caller on any mutation endpoint → `403 FORBIDDEN_ROLE`.

- [ ] T072 Extend the existing `http-redaction.e2e-spec.ts` to cover the chef paths. Open `<repo>\backend\test\http-redaction.e2e-spec.ts`. Add cases that send a `POST /chef/apply` with out-of-range `latitude: 999`, inspect the response body, and assert neither `latitude` nor `longitude` nor any nested `coordinates` property appears anywhere in the payload. Same for `PATCH /chef/profile`. Confirm the existing Phase 2 address-path cases still pass.

### Test fixtures

- [ ] T073 Create the Phase 3 test fixtures. Add to the test fixtures file (typically `<repo>\backend\test\fixtures.ts` or similar — match the existing project pattern):
  - `signedInAdmin()` — registers + signs in a user, then directly mutates `User.role = 'admin'` via `prisma.user.update`. Returns the session.
  - `pendingApplication(user, overrides?)` — calls the real `POST /chef/apply` flow.
  - `verifiedChef(user, overrides?)` — calls `pendingApplication` then has the test admin verify it.
  - `rejectedApplication(user, overrides?)` — same but admin rejects with a synthetic reason "test rejection".
  - `revokedChef(user, overrides?)` — same but admin revokes with reason "test revocation".
  - `seedCategories()` — re-runs the seed against the test database in a clean state.
  - `seedMenu(chef, category)` — inserts a Menu row directly with `chefId, categoryId, name: { en: 'Test Menu', ar: 'قائمة اختبار' }`. (The Phase 0 `Menu` schema has no `isActive` flag — "active" means "not soft-deleted" automatically via the extended client.)
  - `seedManyChefs(N, centre, categoryDistribution?)` — bulk seeds N verified chefs at points distributed around the centre coordinate.
  All fixtures live under `test/` only; no production code path inserts a Menu or seeds an admin without going through the intended Phase 4 / Phase 13 paths.

### Quickstart + docs

- [ ] T074 Run the Phase 3 quickstart end-to-end on a real device. Open `<repo>\specs\004-phase-3-chefs\quickstart.md` and execute every step in order. Tick each "**Verify**" line as you go. Failures = task incomplete; investigate and fix the underlying code (don't relax the quickstart).

- [ ] T075 Update `<repo>\CLAUDE.md` with the Phase 3 conventions. Append a new section under the `<!-- MANUAL ADDITIONS START -->` marker (after the Phase 2 conventions section):
  ```markdown
  ## Phase 3 conventions (do not regress)

  - The Phase 3 cooldown gate in `ChefApplicationService.assertEligibleToApply`
    is the ONLY Phase 3 code path that reads the bare `prismaService.chef.*`
    client. The deviation is named in research R4 and commented at the call
    site; every other Phase 3 read on a soft-delete entity goes through
    `prismaService.extended.<model>.*`.
  - Role transitions (customer → chef on verify, chef → customer on revoke)
    happen exclusively in `users.service.setRole(userId, nextRole, tx?)` and
    are called from `admin.service` inside the same `prisma.$transaction`
    that writes the Chef state change and the Notification row. NO other
    Phase 3 code writes `User.role` (research R6).
  - `notifications.service.create({ userId, type, title, body, data?, tx? })`
    is the ONLY way Phase 3 code writes a Notification row. The `tx` parameter
    lets the call participate in a surrounding `prisma.$transaction`.
    Push delivery is best-effort (`dispatchPush(...)`) after the transaction
    commits — failure logs but never throws.
  - `storage.service.upload(bucket, path, buffer, mimeType)` is the ONLY way
    Phase 3 code writes to Supabase Storage. Chef logo / banner uploads
    accept JPEG / PNG / WebP, ≤ 5 MB (validated by the service AND by the
    `FileInterceptor({ limits: { fileSize: 5 * 1024 * 1024 } })` on the
    controller).
  - The chef-discovery query (`chefs.service.findManyForDiscovery`) uses a
    pure-Prisma bounding-box pre-filter + in-JS Haversine sort (research R2).
    Phase 3 ships ZERO new `$queryRaw` exceptions. The Haversine-via-raw-SQL
    exception that `docs/IMPLEMENTATION_PLAN.md` task 3.9 had reserved is
    retracted by Phase 3.
  - Default radius 15 km, hard cap 50 km on the chef-discovery surface
    (spec FR-016 clarification Q2). The cap is enforced server-side
    (`Math.min(query.radiusKm ?? 15, 50)`); the client cannot widen past 50.
  - 24-hour cooldown after a rejection or revocation before a fresh
    `POST /chef/apply` is accepted. Cooldown source-of-truth is
    `Chef.rejectedAt` (after rejection) or `Chef.deletedAt` (after
    revocation). Computing `earliestResubmitAt` server-side is non-negotiable
    (Constitution Principle II).
  - The `HttpExceptionNormalizerFilter` now scrubs `latitude` / `longitude` /
    `coordinates` from error responses on `/api/v1/chefs/*`, `/api/v1/chef/*`,
    `/api/v1/admin/chefs/*` in addition to the Phase 2 address paths.
    `ChefEventLogger` / `CategoryEventLogger` siblings to the Phase 1 / Phase 2
    loggers emit the FR-038 events.
  - The admin web dashboard surfaces ship English-only (spec FR-036) — a
    deliberate v1 scope decision. Free-text admin input that is later shown
    to a customer (rejection / revocation reasons) is stored verbatim and
    rendered to the customer as-is; the platform does not translate
    admin-typed text.
  ```

- [ ] T076 [P] Retract the `$queryRaw` Haversine exception from the implementation plan. Open `<repo>\docs\IMPLEMENTATION_PLAN.md`. Find task 3.9's exception note:
  > **Constitution exception note** (Task 3.9): Haversine distance ranking inside Postgres requires raw SQL. We accept a narrow `$queryRaw` exception scoped to the chef-discovery query, isolated to one repository method, with a unit test proving the contract. Recorded in Complexity Tracking.

  Replace it with:
  > **Constitution exception note** (Task 3.9): **Retracted by Phase 3.** The chef-discovery query uses a pure-Prisma bounding-box pre-filter + in-JS Haversine sort (Phase 3 research R2). No `$queryRaw` exception is needed; the only `$queryRaw` in the codebase remains the Phase 0 health probe.

  Also update Open Items §A4: change the line "Prisma `$queryRaw` exception register" to note that Phase 3 closed the planned Haversine carve-out without adding one.

**Final checkpoint**: All tests pass. Quickstart end-to-end clean. `CLAUDE.md` updated. `IMPLEMENTATION_PLAN.md` updated. No new `$queryRaw` calls in the codebase. Both i18n locales key-symmetric. The CI grep gate `ci-no-hard-delete.sh` remains green (no new `prisma.chef.delete` / `prisma.category.delete` calls).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Independent. T001 verifies prereqs; T002 / T003 / T004 are non-source one-time setup.
- **Foundational (Phase 2)**: Depends on Phase 1. Blocks every user-story phase.
- **User Story 1 (Phase 3)**: Depends on Phase 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2. Independent of Phase 3 in code (the admin queue reads pending applications, but US2 can be tested independently with the T073 `pendingApplication` fixture seeding a row directly).
- **User Story 3 (Phase 5)**: Depends on Phase 2. Independent of US1 / US2 in code, but practically needs the T073 `verifiedChef` fixture to seed real data.
- **User Story 4 (Phase 6)**: Depends on Phase 2 and on US3 (`ChefsService` shares the file across phases). Practically, US4 changes are additive to `chefs.service.ts`.
- **User Story 5 (Phase 7)**: Depends on Phase 2 and on US3 (`CategoriesService` shares the file). Additive only.
- **User Story 6 (Phase 8)**: Depends on the i18n key skeletons added during foundational T018. Verification work.
- **Polish (Phase 9)**: Depends on every user story being implementation-complete.

### Within Each User Story

- DTOs before services.
- Services before controllers.
- Backend before mobile (mobile services consume the live endpoints).
- Within the mobile work: AuthContext extension and the route guard before any new screen (screens read from `AuthContext`).

### Parallel Opportunities

- All `[P]` tasks within Phase 2 (Foundational) — T008, T009, T010, T012, T013, T016, T017, T018, T019 — are independent files and can run in parallel.
- The five mobile services in `<repo>\mobile\services\` (T026, T050, T051, T058) are independent files.
- The Phase 9 test files (T067 – T072) are independent files.
- The two new admin pages (T037, T039, T063) are independent files and can be built by different developers in parallel.

---

## Parallel Example: User Story 1

```text
# All [P] DTOs and infrastructure for US1 together:
Task T020 [P] [US1] Create ApplyChefDto in backend/src/modules/chefs/dto/apply-chef.dto.ts
Task T021 [P] [US1] Create ChefPrivateProfileResponseDto in backend/src/modules/chefs/dto/chef.response.dto.ts
Task T026 [P] [US1] Create the mobile chef-apply service in mobile/services/chefApply.ts
Task T027 [P] [US1] Create the chef-apply screen in mobile/app/(auth)/chef-apply.tsx
Task T028 [P] [US1] Create the pending-verification holding screen in mobile/app/(auth)/pending-verification.tsx

# Then sequential:
Task T022 [US1] Create ChefApplicationService (depends on the DTOs)
Task T023 [US1] Create ChefsService.apply method (depends on T022)
Task T024 [US1] Create ChefsController with apply endpoint
Task T025 [US1] Create ChefsModule and register it
Task T029 [US1] Wire the RouteGuard in mobile/app/_layout.tsx
```

---

## Implementation Strategy

### MVP slice (User Story 1 + foundational enabling pieces)

1. Phase 1 Setup (T001 – T004).
2. Phase 2 Foundational (T005 – T019) — all of it.
3. Phase 3 User Story 1 (T020 – T029).
4. **STOP and VALIDATE**: a signed-in customer can submit a complete application and land on the pending screen. Test on a real device. Demo if ready.

### Incremental delivery (recommended)

1. Complete the MVP slice above.
2. Add Phase 4 US2 — admin can verify the application end-to-end (T030 – T041). Demo.
3. Add Phase 5 US3 — customer can discover the new chef (T042 – T054). Demo.
4. Add Phase 6 US4 — chef can edit their profile + upload images (T055 – T059). Demo.
5. Add Phase 7 US5 — admin can curate categories (T060 – T064). Demo.
6. Add Phase 8 US6 — verify bilingual + RTL parity end-to-end (T065 – T066).
7. Add Phase 9 — tests, hardening, docs (T067 – T076). Ship.

### Parallel team strategy

After Phase 2 (Foundational) completes:

- **Developer A**: US1 (apply flow) + US3 (discovery) — same `chefs.service.ts` file. Sequential within developer.
- **Developer B**: US2 (admin workflow) + US5 (categories curation) — separate modules. Parallel-friendly.
- **Developer C**: US4 (chef profile editor) — depends on US3 landing first because `chefs.service.ts` is shared.

---

## Notes

- [P] tasks = different files, no dependencies. Different developers can work simultaneously.
- [Story] label maps to spec.md user stories US1 – US6 for traceability.
- Each user story is independently completable and independently testable.
- Verify tests fail before implementing (for the test tasks in Phase 9, if practising strict TDD).
- Commit after each task or logical group (the `speckit-git-commit` hook can be used after each `/speckit-*` step).
- Stop at any checkpoint to validate the story independently.
- Avoid: cross-story dependencies that break independence; same-file edits without an explicit dependency note in this document.
- The "cheaper model" implementer should: read the referenced inline code snippets verbatim, copy them as-is, only deviate when a compile error forces them to (e.g., a slightly different import path because Phase 0 named a file differently). If a deviation is needed, leave a comment in the file: `// Phase 3 task TXXX inline snippet deviated because <reason>.`
