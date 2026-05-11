---
description: "Phase 2 Saved Delivery Addresses with Map Picker — implementation tasks"
---

# Tasks: Saved Delivery Addresses with Map Picker

**Input**: Design documents from `/specs/003-phase-2-addresses/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Branch**: `003-phase-2-addresses`
**Repo root**: `<repo>`

> **Implementer guidance**: Each task is atomic and self-contained.
> File paths are absolute or repo-relative. Where a file's full
> content matters, the content is inlined verbatim — copy it
> directly. Where a decision is non-obvious, the task points at the
> decision in `research.md` (R1–R7). Where an endpoint contract
> matters, the task points at `contracts/addresses.openapi.yaml`.
> Run commands exactly as written. If a command fails, do NOT
> improvise — re-read the task and the referenced artifact, then
> ask for help.
>
> **Two clarifications were integrated into the spec** (see
> `spec.md#Clarifications`):
> 1. Address-mutation events emit structured logs (FR-019) matching
>    the Phase 1 FR-020 line shape, on success and failure paths
>    alike.
> 2. Customer coordinates (`latitude`, `longitude`,
>    `coordinates.*`) MUST NOT appear in any log line, in any
>    client-visible error response, or in any operator diagnostic
>    surface (FR-021).
>
> **Phase 0 / Phase 1 invariants this phase MUST preserve**:
> - All `UserAddress` reads go through
>   `prismaService.extended.userAddress.*` (the default
>   `deletedAt: null` filter is what implements SC-009).
> - All `Order` reads from outside `OrdersModule` go through
>   `OrdersService` (Constitution Principle III). Phase 2 ships the
>   shell with one method, `hasActiveOrderForAddress`. Never import
>   `prisma.order` from `addresses/`.
> - Soft-delete on `UserAddress` goes through
>   `prismaService.userAddress.softDelete({ where })`. Hard
>   `prisma.userAddress.delete(...)` is blocked at CI by
>   `backend/scripts/ci-no-hard-delete.sh`.
> - `class-validator` + `class-transformer` are wired globally with
>   `whitelist: true, forbidNonWhitelisted: true` from Phase 0;
>   DTOs declare ONLY the fields the spec lets the client send.
> - All money math in Phase 2 is N/A (no money flows here).
>
> **One implementation deviation from `plan.md`**: `plan.md` says
> the Phase 1 `auth-event.logger.ts` will be generalised to a
> per-namespace logger. To minimise churn in Phase 1 code paths,
> tasks T006 below ship a **sibling** `address-event.logger.ts`
> mirroring the same line shape rather than renaming the existing
> file. Both loggers stamp the same envelope keys
> (`event`, `outcome`, `actorId`, `sourceIp`, `correlationId`,
> `timestamp`); a future cleanup phase MAY merge them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks → safe to parallelize.
- **[Story]**: Maps to a user story in `spec.md` (`US1`–`US4`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch / dependency / API-key prerequisites. No source
files written yet.

- [X] T001 Verify the working directory and branch. From PowerShell at `<repo>`, run `git rev-parse --abbrev-ref HEAD` and confirm it prints `003-phase-2-addresses`. Run `Test-Path specs\003-phase-2-addresses\plan.md` and confirm `True`. Run `Test-Path backend\src\modules\auth\auth.controller.ts` and confirm `True` (Phase 1 must be in place — the auth controller is a sentinel for it). Run `Test-Path mobile\context\AuthContext.tsx` and confirm `True` (Phase 1 mobile substrate is in place). Do not proceed unless all four checks pass.

- [X] T002 [P] Install the new mobile dependency. From `<repo>\mobile` run:
  ```powershell
  npx expo install expo-location
  ```
  Expected outcome: `<repo>\mobile\package.json` lists `expo-location` under `dependencies` at whatever version `expo install` pins for SDK 54. Do not override the pinned version.

- [X] T003 Procure the Google Maps API keys per research R2. This is a **manual, one-time** procurement. (a) In the Nafas Google Cloud project, enable **Maps SDK for iOS** and **Maps SDK for Android** (do NOT enable Geocoding API — research R1 uses `expo-location.reverseGeocodeAsync` instead). (b) Create one API key per platform; restrict the iOS key to the iOS bundle ID and the Android key to the Android package name + the debug + release SHA-1 fingerprints. (c) Add to `<repo>\mobile\.env` (create the file if missing; it is gitignored):
  ```text
  GOOGLE_MAPS_API_KEY_IOS=...
  GOOGLE_MAPS_API_KEY_ANDROID=...
  ```
  (d) Verify `git status` does NOT list `mobile\.env` as a tracked file. If it does, add `mobile/.env` to `<repo>\.gitignore` and commit the gitignore change separately.

  Expected outcome: two keys in `mobile\.env`; gitignore covers the file; iOS and Android keys are platform-restricted in the Cloud Console.

- [X] T004 Configure `mobile\app.config.ts` to read the keys from the environment. Open `<repo>\mobile\app.config.ts`. Add (or merge) these slots into the exported config:
  ```ts
  ios: {
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
    },
  },
  android: {
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
      },
    },
  },
  ```
  If the file already has `ios` / `android` blocks, merge the `config` slots into them; do not replace existing fields. **Never inline a literal key string in this file.** Expected outcome: `npx tsc --noEmit` from `<repo>\mobile` returns 0 with no type errors. `npx expo config --type prebuild --json` (run from `<repo>\mobile`) prints the resolved config with the two key strings populated when the env vars are set.

- [X] T005 Sanity-check the Phase 0 / Phase 1 invariants are still green BEFORE you write Phase 2 code. From `<repo>\backend` run, in order:
  ```powershell
  npm run lint
  npm run build
  npx prisma generate
  npx prisma migrate status
  bash scripts/ci-no-hard-delete.sh
  npm test
  ```
  Expected outcome: each of the six commands returns 0. `prisma migrate status` MUST report no schema drift. The CI grep gate MUST report zero `prisma.<model>.delete(` calls on soft-delete entities. The Phase 1 test suite MUST be green. If any check fails, stop — Phase 2 cannot start on a broken Phase 1 base.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that every Phase 2 user
story depends on. **No user-story task may begin until Phase 2 is
complete.**

- [X] T006 Create `<repo>\backend\src\common\logging\address-event.logger.ts` mirroring the Phase 1 `auth-event.logger.ts` shape. Full file content:
  ```ts
  import { Injectable, Logger } from '@nestjs/common';
  import { correlationStorage } from './correlation-id.context';

  export type AddressEventType =
    | 'address.create'
    | 'address.update'
    | 'address.delete';

  export type AddressEventOutcome =
    | 'success'
    | 'validation_rejected'
    | 'not_found'
    | 'in_use';

  export interface AddressEventInput {
    event: AddressEventType;
    outcome: AddressEventOutcome;
    actorId?: string;
    addressId?: string;
    extra?: Record<string, string | number | boolean | null>;
  }

  /**
   * Emits one structured JSON line per address-mutation event (FR-019).
   * Per FR-021 / SC-011 the line MUST NEVER carry latitude, longitude,
   * or any coordinate-derived value. The `extra` field is typed as
   * primitive scalars only; never pass an object containing
   * coordinates.
   */
  @Injectable()
  export class AddressEventLogger {
    private readonly log = new Logger('AddressEvent');

    emit(input: AddressEventInput) {
      const store = correlationStorage.getStore();
      const payload = {
        event: input.event,
        outcome: input.outcome,
        actorId: input.actorId ?? null,
        addressId: input.addressId ?? null,
        sourceIp: store?.sourceIp ?? 'unknown',
        correlationId: store?.correlationId ?? 'unknown',
        timestamp: new Date().toISOString(),
        ...(input.extra ?? {}),
      };
      this.log.log(JSON.stringify(payload));
    }
  }
  ```
  Then register the new logger as a provider in `<repo>\backend\src\common\logging\logging.module.ts`. Open the file, add `AddressEventLogger` to the `providers` and `exports` arrays alongside `AuthEventLogger`. Expected outcome: `npm run build` succeeds; `AddressEventLogger` is importable from elsewhere via `import { AddressEventLogger } from '../../common/logging/address-event.logger'`.

- [X] T007 Extend `<repo>\backend\src\common\errors\http-exception.filter.ts` with TWO additions per research R6 + the C1 fix from `/speckit-analyze`: (a) a coordinate-scrubber pass over the normalised error body, and (b) FR-019 emission for `address.* / {validation_rejected, not_found}` outcomes when the request path is under `/api/v1/addresses/*`. Both responsibilities live here because (i) controller-level filters bypass the global filter (so a per-controller `AddressEventFilter` would also bypass the scrubber), and (ii) the same Phase 1 chokepoint already emits `auth.password_validation` and `auth.rate_limit` for analogous before-controller triggers — we extend the established pattern.

  Step 1 — inject the new logger. Open the file and update the constructor:
  ```ts
  import { AddressEventLogger } from '../logging/address-event.logger';
  ```
  ```ts
  constructor(
    private readonly authEvents: AuthEventLogger,
    private readonly addressEvents: AddressEventLogger,
  ) {}
  ```
  (Rename the existing `events` member to `authEvents` everywhere it is referenced inside the file. There should be exactly two existing `this.events.emit(...)` call sites — both for auth events.)

  Step 2 — invoke the scrubber AFTER `normalize` returns and BEFORE the side-effects block. Replace the line `const normalized = this.normalize(exception, status, raw);` with:
  ```ts
  const normalized = this.normalize(exception, status, raw);
  this.scrubCoordinates(normalized as unknown as Record<string, unknown>);
  ```

  Step 3 — emit the FR-019 outcome. After the existing auth-event side-effects block and BEFORE `res.status(status).json(normalized);`, insert:
  ```ts
  // FR-019 emission for address-path errors. Single chokepoint per the
  // C1 fix from /speckit-analyze; see plan.md Summary §6.
  if (req.url?.startsWith('/api/v1/addresses')) {
    const method = req.method;
    const event =
      method === 'POST' ? 'address.create'
      : method === 'PATCH' ? 'address.update'
      : method === 'DELETE' ? 'address.delete'
      : null;
    if (event) {
      const outcome =
        normalized.code === 'VALIDATION_ERROR'
          ? ('validation_rejected' as const)
          : status === HttpStatus.NOT_FOUND
            ? ('not_found' as const)
            : null;
      if (outcome) {
        const userSub = (req as Request & { user?: { sub?: string } }).user?.sub;
        // Address ID may be in the URL for PATCH/DELETE: /api/v1/addresses/:id
        const segs = req.url.split('?')[0].split('/');
        const addressId = segs.length >= 5 ? segs[4] : undefined;
        this.addressEvents.emit({
          event,
          outcome,
          actorId: userSub,
          addressId,
        });
      }
    }
  }
  ```

  Step 4 — add the scrubber method below `codeFromStatus`:
  ```ts
  /**
   * Defence-in-depth for FR-021 / SC-012: walk the normalised error
   * body depth-first and delete any `latitude`, `longitude`, or
   * `coordinates` property — at any nesting depth, including inside
   * `details` and inside arrays. Property-name match is exact and
   * case-sensitive (the DTOs use these exact names; no fuzzy match).
   */
  private scrubCoordinates(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) this.scrubCoordinates(child);
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      delete obj.latitude;
      delete obj.longitude;
      delete obj.coordinates;
      for (const key of Object.keys(obj)) {
        this.scrubCoordinates(obj[key]);
      }
    }
  }
  ```

  Step 5 — register `AddressEventLogger` as a global provider so the filter can inject it. The Phase 1 wiring registers `HttpExceptionNormalizerFilter` as `APP_FILTER` in some root module (look for the existing registration; it is likely in `app.module.ts` or a `LoggingModule`). Confirm `AddressEventLogger` (added in T006) is exported by `LoggingModule` and that `LoggingModule` is imported wherever the filter provider lives. If the filter is provided directly in `app.module.ts`, ensure `LoggingModule` is also imported there.

  Expected outcome: `npm run build` from `<repo>\backend` succeeds. The filter is a single class with two new methods (`scrubCoordinates`) and the new emission block. No `AddressEventFilter` file is introduced — that approach was retired by the C1 finding because controller-level filters do not delegate to global filters in NestJS.

- [X] T008 [P] Create `<repo>\backend\test\http-redaction.spec.ts` to verify both new responsibilities of the global filter. Full file content:
  ```ts
  import { Test } from '@nestjs/testing';
  import {
    ArgumentsHost,
    BadRequestException,
    HttpException,
    NotFoundException,
  } from '@nestjs/common';
  import { HttpExceptionNormalizerFilter } from '../src/common/errors/http-exception.filter';
  import { AuthEventLogger } from '../src/common/logging/auth-event.logger';
  import { AddressEventLogger } from '../src/common/logging/address-event.logger';

  function makeHost(req: { url: string; method: string; user?: { sub: string } }): ArgumentsHost {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    return {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
    } as unknown as ArgumentsHost & { __res: typeof res };
  }

  describe('HttpExceptionNormalizerFilter (FR-019 / FR-021 / R6)', () => {
    let filter: HttpExceptionNormalizerFilter;
    let addressEvents: { emit: jest.Mock };

    beforeEach(async () => {
      addressEvents = { emit: jest.fn() };
      const mod = await Test.createTestingModule({
        providers: [
          HttpExceptionNormalizerFilter,
          { provide: AuthEventLogger, useValue: { emit: jest.fn() } },
          { provide: AddressEventLogger, useValue: addressEvents },
        ],
      }).compile();
      filter = mod.get(HttpExceptionNormalizerFilter);
    });

    function run(exc: HttpException, req = { url: '/x', method: 'POST' }) {
      const host = makeHost(req);
      const res = (host.switchToHttp().getResponse() as unknown) as {
        status: jest.Mock;
        json: jest.Mock;
      };
      filter.catch(exc, host);
      return res.json.mock.calls[0][0];
    }

    describe('coordinate scrubber (FR-021 / R6)', () => {
      it('strips top-level latitude/longitude', () => {
        const body = run(
          new HttpException({ code: 'X', message: 'm', latitude: 30, longitude: 31 }, 400),
        );
        expect(body).not.toHaveProperty('latitude');
        expect(body).not.toHaveProperty('longitude');
      });

      it('strips nested coordinates inside details', () => {
        const body = run(
          new HttpException(
            { code: 'X', message: 'm', details: { coordinates: { latitude: 1, longitude: 2 }, k: 'v' } },
            400,
          ),
        );
        expect(body.details).not.toHaveProperty('coordinates');
        expect(body.details.k).toBe('v');
      });

      it('strips inside arrays of nested errors', () => {
        const body = run(
          new HttpException(
            { code: 'X', message: 'm', details: { fields: [{ latitude: 1 }, { other: 'y' }] } },
            400,
          ),
        );
        expect(body.details.fields[0]).not.toHaveProperty('latitude');
        expect(body.details.fields[1]).toEqual({ other: 'y' });
      });

      it('preserves a body that has no coordinate keys', () => {
        const body = run(new BadRequestException({ code: 'V', message: 'bad' }));
        expect(body.code).toBe('V');
      });
    });

    describe('FR-019 address-path emission (C1 fix)', () => {
      it('emits address.create / validation_rejected on POST /api/v1/addresses 400', () => {
        const validationExc = new BadRequestException({
          message: ['latitude must not be greater than 90'],
        });
        run(validationExc, { url: '/api/v1/addresses', method: 'POST', user: { sub: 'u-1' } });
        expect(addressEvents.emit).toHaveBeenCalledTimes(1);
        const emitted = addressEvents.emit.mock.calls[0][0];
        expect(emitted.event).toBe('address.create');
        expect(emitted.outcome).toBe('validation_rejected');
        expect(emitted.actorId).toBe('u-1');
      });

      it('emits address.update / not_found on PATCH /api/v1/addresses/:id 404', () => {
        const exc = new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'x' });
        run(exc, { url: '/api/v1/addresses/abc-123', method: 'PATCH', user: { sub: 'u-2' } });
        expect(addressEvents.emit).toHaveBeenCalledTimes(1);
        expect(addressEvents.emit.mock.calls[0][0]).toMatchObject({
          event: 'address.update',
          outcome: 'not_found',
          actorId: 'u-2',
          addressId: 'abc-123',
        });
      });

      it('emits address.delete / not_found on DELETE /api/v1/addresses/:id 404', () => {
        const exc = new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'x' });
        run(exc, { url: '/api/v1/addresses/xyz', method: 'DELETE', user: { sub: 'u-3' } });
        expect(addressEvents.emit.mock.calls[0][0]).toMatchObject({
          event: 'address.delete',
          outcome: 'not_found',
          addressId: 'xyz',
        });
      });

      it('does NOT emit for non-address paths', () => {
        run(new BadRequestException('x'), { url: '/api/v1/auth/sign-in', method: 'POST' });
        expect(addressEvents.emit).not.toHaveBeenCalled();
      });

      it('does NOT emit for address GETs (read paths are not in FR-019 scope)', () => {
        run(new NotFoundException('x'), { url: '/api/v1/addresses/abc', method: 'GET' });
        expect(addressEvents.emit).not.toHaveBeenCalled();
      });
    });
  });
  ```
  Expected outcome: from `<repo>\backend` run `npm test -- http-redaction.spec` and all nine cases pass.

- [X] T009 Create the Phase 2 `OrdersModule` shell. Per `plan.md` Summary point 2 and `data-model.md`, this is a one-method module that exists so `AddressesService` honours Constitution Principle III. Phase 6 will expand it. Create two files:

  `<repo>\backend\src\modules\orders\orders.service.ts` (full content):
  ```ts
  import { Injectable } from '@nestjs/common';
  import { OrderStatus } from '@prisma/client';
  import { PrismaService } from '../../common/prisma/prisma.service';

  @Injectable()
  export class OrdersService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * FR-013 in-flight-order safety rail. Returns the ID of one of the
     * customer's orders whose status is NOT terminal and whose
     * addressId matches, or `null` if there is none. Terminal set is
     * { DELIVERED, CANCELLED } per Constitution Principle VI.
     *
     * Reads through `prismaService.extended.order.findFirst` so any
     * future soft-delete on Order is honoured automatically.
     */
    async hasActiveOrderForAddress(
      addressId: string,
      userId: string,
    ): Promise<{ activeOrderId: string } | null> {
      const row = await this.prisma.extended.order.findFirst({
        where: {
          addressId,
          userId,
          status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return row ? { activeOrderId: row.id } : null;
    }
  }
  ```

  `<repo>\backend\src\modules\orders\orders.module.ts` (full content):
  ```ts
  import { Module } from '@nestjs/common';
  import { OrdersService } from './orders.service';

  @Module({
    providers: [OrdersService],
    exports: [OrdersService],
  })
  export class OrdersModule {}
  ```
  Expected outcome: `npm run build` from `<repo>\backend` succeeds. The module ships ZERO controllers, ZERO request paths, ZERO DTOs — Phase 6 owns the public surface.

- [X] T010 Wire `OrdersModule` into `<repo>\backend\src\app.module.ts`. Open the file. Add the import:
  ```ts
  import { OrdersModule } from './modules/orders/orders.module';
  ```
  Add `OrdersModule` to the `imports` array of the root `AppModule` (placement order is not significant; group alphabetically next to `AuthModule`, `HealthModule`, `UsersModule`, etc.). **Do NOT add `AddressesModule` yet** — that arrives in T015. Expected outcome: `npm run build` succeeds; the boot logs (`docker compose -f docker-compose.dev.yml up backend`) list `OrdersModule` among the registered modules.

- [X] T011 [P] Seed Phase 2 i18n keys in BOTH `<repo>\mobile\constants\i18n\en.ts` and `<repo>\mobile\constants\i18n\ar.ts`. Add these keys (paste exactly; do not invent variants). Both languages are inlined below — paste each block under the appropriate locale's existing root object as a new `addresses` namespace.

  English values to merge into `en.ts`:
  ```ts
  addresses: {
    list: {
      title: 'My addresses',
      empty: {
        title: 'No saved addresses yet',
        body: 'Add a delivery address so chefs know where to send your food.',
      },
      addCta: 'Add address',
    },
    form: {
      label: 'Label',
      labelPlaceholder: 'e.g., home',
      streetName: 'Street name',
      streetNamePlaceholder: 'Optional — drag the pin to fill automatically',
      moreDetailsToggle: 'More details (optional)',
      building: 'Building',
      floor: 'Floor',
      apartment: 'Apartment',
      notes: 'Notes for the chef',
      save: 'Save',
      cancel: 'Cancel',
    },
    picker: {
      pinAccessibility: 'Map pin — drag the map to position',
      useMyLocationCta: 'Use my location',
      permissionDeniedHint: 'Location permission is off; drag the map to position the pin.',
    },
    edit: {
      title: 'Edit address',
      delete: 'Delete address',
    },
    deleteConfirm: {
      title: 'Delete this address?',
      body: 'You can add it again later.',
      confirm: 'Delete',
      cancel: 'Cancel',
    },
    inUse: {
      title: 'Address is in use',
      body: 'This address is attached to an order in progress. Finish or cancel the order first.',
      viewOrderCta: 'View that order',
      ok: 'OK',
    },
    validation: {
      labelRequired: 'Please give the address a label.',
      labelTooLong: 'Label is too long (max 80 characters).',
      streetTooLong: 'Street name is too long (max 200 characters).',
      coordinatesInvalid: 'Pick a valid pin location on the map.',
    },
  },
  ```

  Arabic values to merge into `ar.ts`:
  ```ts
  addresses: {
    list: {
      title: 'عناويني',
      empty: {
        title: 'لا توجد عناوين محفوظة بعد',
        body: 'أضف عنوان توصيل ليعرف الطهاة أين يرسلون طعامك.',
      },
      addCta: 'إضافة عنوان',
    },
    form: {
      label: 'الاسم',
      labelPlaceholder: 'مثال: المنزل',
      streetName: 'اسم الشارع',
      streetNamePlaceholder: 'اختياري — اسحب الدبوس ليُعبأ تلقائيًا',
      moreDetailsToggle: 'تفاصيل إضافية (اختياري)',
      building: 'العمارة',
      floor: 'الدور',
      apartment: 'الشقة',
      notes: 'ملاحظات للطاهي',
      save: 'حفظ',
      cancel: 'إلغاء',
    },
    picker: {
      pinAccessibility: 'دبوس الخريطة — اسحب الخريطة لتحديد الموقع',
      useMyLocationCta: 'استخدم موقعي',
      permissionDeniedHint: 'إذن الموقع مغلق؛ اسحب الخريطة لتحديد موقع الدبوس.',
    },
    edit: {
      title: 'تعديل العنوان',
      delete: 'حذف العنوان',
    },
    deleteConfirm: {
      title: 'هل تريد حذف هذا العنوان؟',
      body: 'يمكنك إضافته مرة أخرى لاحقًا.',
      confirm: 'حذف',
      cancel: 'إلغاء',
    },
    inUse: {
      title: 'العنوان قيد الاستخدام',
      body: 'هذا العنوان مرتبط بطلب جارٍ. أنهِ الطلب أو ألغِه أولًا.',
      viewOrderCta: 'عرض الطلب',
      ok: 'حسنًا',
    },
    validation: {
      labelRequired: 'الرجاء إعطاء العنوان اسمًا.',
      labelTooLong: 'الاسم طويل جدًا (الحد الأقصى 80 حرفًا).',
      streetTooLong: 'اسم الشارع طويل جدًا (الحد الأقصى 200 حرف).',
      coordinatesInvalid: 'اختر موقعًا صالحًا للدبوس على الخريطة.',
    },
  },
  ```
  Expected outcome: from `<repo>\mobile` run `npx tsc --noEmit` and confirm no errors. T032 (US4) will run a parity script across both locale files; key sets MUST be identical.

- [X] T011a [P] Create the `useColors()` hook required by Constitution Principle V (no hex literals in components). Create `<repo>\mobile\hooks\useColors.ts` with full content:
  ```ts
  import { useMemo } from 'react';

  /**
   * Brand palette tokens from the nafas-design-system skill. This file
   * is the ONLY place hex literals are allowed in the mobile app —
   * components consume tokens via the hook (Constitution Principle V).
   *
   * Source: nafas-design-system mockups (terracotta primary,
   * saffron accent, earthy warm neutrals).
   */
  export interface NafasColors {
    primary: string;        // terracotta — primary CTAs, pin
    primaryText: string;    // text on `primary` background
    accent: string;         // saffron — secondary highlights
    danger: string;         // destructive CTAs, error text
    warningSurface: string; // surface for callouts (e.g., in-use modal)
    warningBorder: string;
    background: string;     // app background
    surface: string;        // card / row background
    text: string;           // primary text
    muted: string;          // secondary text, hints
    border: string;         // 1px hairline borders
    inputBorder: string;    // form input borders
  }

  const TOKENS: NafasColors = {
    primary: '#C4622D',
    primaryText: '#FFFFFF',
    accent: '#D4944A',
    danger: '#A33333',
    warningSurface: '#FFF3E0',
    warningBorder: '#C4622D',
    background: '#FAF6F2',
    surface: '#FFFFFF',
    text: '#1F1A17',
    muted: '#7A6E66',
    border: '#D7CFC8',
    inputBorder: '#CCCCCC',
  };

  export function useColors(): NafasColors {
    return useMemo(() => TOKENS, []);
  }
  ```
  Expected outcome: `npx tsc --noEmit` from `<repo>\mobile` returns 0. Every Phase 2 component (T018, T019, T020, T027) consumes this hook — the components contain ZERO hex literals.

**Checkpoint**: Phase 2 foundation is complete. T006–T011 must all be
done before any user-story task starts.

---

## Phase 3: User Story 1 — A customer saves their first delivery address by dropping a pin on the map (Priority: P1) 🎯 MVP

**Goal**: Signed-in customer reaches the addresses screen, drops a
pin on the map, optionally edits the auto-populated street name,
gives the address a label, and saves. The address appears in the
saved list and survives an app restart.

**Independent Test**: A customer who registered via the Phase 1
flow opens **Profile → Addresses**, drops a pin, saves, kills and
reopens the app, returns to **Profile → Addresses**, and sees the
address still listed unchanged.

**Maps to**: spec.md User Story 1, FR-001 through FR-009, FR-015,
FR-018, FR-019, FR-021. SCs delivered: SC-001, SC-002, SC-003,
SC-006 (partial), SC-008, SC-010, SC-011 (partial create event),
SC-012 (partial create-error redaction).

### Backend (CRUD foundation: list + create)

- [X] T012 [P] [US1] Create `<repo>\backend\src\modules\addresses\dto\create-address.dto.ts`. Full content:
  ```ts
  import {
    IsLatitude,
    IsLongitude,
    IsOptional,
    IsString,
    Length,
  } from 'class-validator';
  import { Transform } from 'class-transformer';
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

  export class CreateAddressDto {
    @ApiProperty({ minLength: 1, maxLength: 80, example: 'home' })
    @IsString()
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @Length(1, 80)
    label!: string;

    @ApiProperty({ minLength: 0, maxLength: 200 })
    @IsString()
    @Length(0, 200)
    streetName!: string;

    @ApiPropertyOptional({ maxLength: 80 })
    @IsOptional()
    @IsString()
    @Length(0, 80)
    building?: string;

    @ApiPropertyOptional({ maxLength: 20 })
    @IsOptional()
    @IsString()
    @Length(0, 20)
    floor?: string;

    @ApiPropertyOptional({ maxLength: 20 })
    @IsOptional()
    @IsString()
    @Length(0, 20)
    apartment?: string;

    @ApiProperty({ minimum: -90, maximum: 90, example: 30.0444 })
    @IsLatitude()
    latitude!: number;

    @ApiProperty({ minimum: -180, maximum: 180, example: 31.2357 })
    @IsLongitude()
    longitude!: number;

    @ApiPropertyOptional({ maxLength: 500 })
    @IsOptional()
    @IsString()
    @Length(0, 500)
    notes?: string;
  }
  ```
  Expected outcome: TS compiles. The DTO declares ONLY the fields the spec lets the client send; `userId`, `id`, timestamps are absent (`forbidNonWhitelisted: true` will reject any client that sends them — SC-008).

- [X] T013 [P] [US1] Create `<repo>\backend\src\modules\addresses\dto\address.response.dto.ts`. Full content:
  ```ts
  import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
  import { UserAddress } from '@prisma/client';

  export class AddressResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() label!: string;
    @ApiProperty() streetName!: string;
    @ApiPropertyOptional({ nullable: true }) building!: string | null;
    @ApiPropertyOptional({ nullable: true }) floor!: string | null;
    @ApiPropertyOptional({ nullable: true }) apartment!: string | null;
    @ApiProperty({ description: 'Decimal latitude as JS string (Phase 0 convention).' })
    latitude!: string;
    @ApiProperty({ description: 'Decimal longitude as JS string.' })
    longitude!: string;
    @ApiPropertyOptional({ nullable: true }) notes!: string | null;
    @ApiProperty({ format: 'date-time' }) createdAt!: string;
    @ApiProperty({ format: 'date-time' }) updatedAt!: string;

    static from(row: UserAddress): AddressResponseDto {
      return {
        id: row.id,
        label: row.label,
        streetName: row.streetName,
        building: row.building,
        floor: row.floor,
        apartment: row.apartment,
        latitude: row.latitude.toString(),
        longitude: row.longitude.toString(),
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }
  }
  ```
  Expected outcome: TS compiles. Decimal values are stringified per the Phase 0 convention recorded in `CLAUDE.md`. Soft-delete fields are NOT exposed.

- [X] T014 [US1] Create `<repo>\backend\src\modules\addresses\addresses.service.ts`. This task ships ONLY `list` and `create` (and a shared `findOwnedOrThrow` helper used by later tasks). `update` and `softDelete` arrive in T025 / T027. Full content:
  ```ts
  import { Injectable, NotFoundException } from '@nestjs/common';
  import { PrismaService } from '../../common/prisma/prisma.service';
  import { AddressEventLogger } from '../../common/logging/address-event.logger';
  import { OrdersService } from '../orders/orders.service';
  import { CreateAddressDto } from './dto/create-address.dto';
  import { AddressResponseDto } from './dto/address.response.dto';

  @Injectable()
  export class AddressesService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly events: AddressEventLogger,
      private readonly orders: OrdersService, // unused in this task; required by T027.
    ) {}

    async list(userId: string): Promise<AddressResponseDto[]> {
      const rows = await this.prisma.extended.userAddress.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(AddressResponseDto.from);
    }

    async create(userId: string, dto: CreateAddressDto): Promise<AddressResponseDto> {
      const row = await this.prisma.userAddress.create({
        data: {
          userId,
          label: dto.label,
          streetName: dto.streetName,
          building: dto.building ?? null,
          floor: dto.floor ?? null,
          apartment: dto.apartment ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          notes: dto.notes ?? null,
        },
      });
      this.events.emit({
        event: 'address.create',
        outcome: 'success',
        actorId: userId,
        addressId: row.id,
      });
      return AddressResponseDto.from(row);
    }

    /**
     * Single-find shape per research R4 / FR-015. A null result becomes
     * 404 ADDRESS_NOT_FOUND — same response as a genuinely missing ID,
     * so an attacker cannot distinguish "exists but not yours" from
     * "does not exist".
     */
    async findOwnedOrThrow(id: string, userId: string) {
      const row = await this.prisma.extended.userAddress.findFirst({
        where: { id, userId },
      });
      if (!row) {
        throw new NotFoundException({
          code: 'ADDRESS_NOT_FOUND',
          message: 'Address not found.',
        });
      }
      return row;
    }
  }
  ```
  Expected outcome: TS compiles. The constructor injects `OrdersService` even though `list`/`create` do not call it — keeps the constructor stable across T027.

- [X] T015 [US1] Create `<repo>\backend\src\modules\addresses\addresses.controller.ts`. This task ships ONLY `GET /addresses` and `POST /addresses`. `PATCH` and `DELETE` arrive in T028 / T029. Full content:
  ```ts
  import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    UseGuards,
  } from '@nestjs/common';
  import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
  import { Request } from 'express';
  import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
  import { AddressesService } from './addresses.service';
  import { AddressResponseDto } from './dto/address.response.dto';
  import { CreateAddressDto } from './dto/create-address.dto';

  interface JwtRequest extends Request {
    user: { sub: string };
  }

  @ApiTags('Addresses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Controller('api/v1/addresses')
  export class AddressesController {
    constructor(private readonly svc: AddressesService) {}

    @Get()
    list(@Req() req: JwtRequest): Promise<AddressResponseDto[]> {
      return this.svc.list(req.user.sub);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(
      @Req() req: JwtRequest,
      @Body() dto: CreateAddressDto,
    ): Promise<AddressResponseDto> {
      return this.svc.create(req.user.sub, dto);
    }
  }
  ```
  Expected outcome: TS compiles. The controller is THIN — every line either binds the route or forwards to the service.

- [X] T016 [US1] Create `<repo>\backend\src\modules\addresses\addresses.module.ts`. Full content:
  ```ts
  import { Module } from '@nestjs/common';
  import { LoggingModule } from '../../common/logging/logging.module';
  import { OrdersModule } from '../orders/orders.module';
  import { AddressesController } from './addresses.controller';
  import { AddressesService } from './addresses.service';

  @Module({
    imports: [LoggingModule, OrdersModule],
    controllers: [AddressesController],
    providers: [AddressesService],
  })
  export class AddressesModule {}
  ```
  Then wire `AddressesModule` into `<repo>\backend\src\app.module.ts`'s `imports` array (alphabetical placement). Expected outcome: `npm run build` succeeds; backend boot logs list `AddressesModule`. Swagger UI at `/api/v1/docs` lists the **Addresses** tag with two endpoints.

### Mobile (services + screens for US1)

- [X] T017 [P] [US1] Create `<repo>\mobile\services\addresses.ts`. This task ships ONLY `list` and `create`; `update` and `delete` arrive in T030. Full content:
  ```ts
  import { api } from './api';

  export interface Address {
    id: string;
    label: string;
    streetName: string;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    latitude: string;   // decimal-as-string per Phase 0 convention
    longitude: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }

  export interface CreateAddressInput {
    label: string;
    streetName: string;
    building?: string;
    floor?: string;
    apartment?: string;
    latitude: number;
    longitude: number;
    notes?: string;
  }

  export const addressesService = {
    async list(): Promise<Address[]> {
      const { data } = await api.get<Address[]>('/api/v1/addresses');
      return data;
    },
    async create(input: CreateAddressInput): Promise<Address> {
      const { data } = await api.post<Address>('/api/v1/addresses', input);
      return data;
    },
  };
  ```
  Expected outcome: `npx tsc --noEmit` from `<repo>\mobile` returns 0.

- [X] T018 [P] [US1] Create `<repo>\mobile\components\AddressPickerMap.tsx` per research R3. The component is a controlled fixed-pin-over-draggable-map. Full content:
  ```tsx
  import React, { useEffect, useMemo, useRef } from 'react';
  import { StyleSheet, View } from 'react-native';
  import MapView, { Region } from 'react-native-maps';
  import * as Location from 'expo-location';
  import { useT } from '../context/LanguageContext';
  import { useColors } from '../hooks/useColors';

  interface Coords {
    latitude: number;
    longitude: number;
  }

  interface Props {
    value: Coords | null;
    onChange: (next: Coords) => void;
    onReverseGeocode?: (street: string) => void;
    initialRegion?: Region;
    testID?: string;
  }

  // Cairo fallback per R3 (FR-007 "sensible default region").
  const CAIRO: Region = {
    latitude: 30.0444,
    longitude: 31.2357,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  export function AddressPickerMap({
    value,
    onChange,
    onReverseGeocode,
    initialRegion,
    testID,
  }: Props) {
    const t = useT();
    const colors = useColors();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const mapRef = useRef<MapView>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Seed initial region: explicit prop > saved value > device location > Cairo.
    useEffect(() => {
      if (initialRegion || value) return;
      let cancelled = false;
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted' || cancelled) return;
          const here = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            // 4-second timeout per R3 — getCurrentPositionAsync supports
            // mayShowUserSettingsDialog but not a top-level timeout; we
            // race against a manual one.
          });
          if (cancelled) return;
          mapRef.current?.animateToRegion(
            {
              latitude: here.coords.latitude,
              longitude: here.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            500,
          );
        } catch {
          /* swallow per FR-007 — Cairo fallback already in initialRegion below. */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [initialRegion, value]);

    const handleRegionChangeComplete = (region: Region) => {
      const next = { latitude: region.latitude, longitude: region.longitude };
      onChange(next);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!onReverseGeocode) return;
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await Location.reverseGeocodeAsync(next);
          const first = results[0];
          if (!first) return;
          // Compose a "street" string from the parts the geocoder returns.
          const parts = [first.street, first.district, first.city].filter(Boolean);
          if (parts.length) onReverseGeocode(parts.join(', '));
        } catch {
          /* FR-006: silently absorb. */
        }
      }, 500);
    };

    const startRegion: Region =
      initialRegion ??
      (value
        ? { ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }
        : CAIRO);

    return (
      <View style={styles.wrap} testID={testID}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={startRegion}
          onRegionChangeComplete={handleRegionChangeComplete}
        />
        <View
          pointerEvents="none"
          style={styles.pinWrap}
          accessibilityLabel={t('addresses.picker.pinAccessibility')}
        >
          <View style={styles.pin} />
        </View>
      </View>
    );
  }

  function makeStyles(colors: ReturnType<typeof useColors>) {
    return StyleSheet.create({
      wrap: { width: '100%', height: 320, position: 'relative' },
      map: { width: '100%', height: '100%' },
      pinWrap: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginLeft: -12,
        marginTop: -24,
        width: 24,
        height: 24,
      },
      pin: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.primary,
        borderWidth: 3,
        borderColor: colors.surface,
      },
    });
  }
  ```
  Note: `useT()` is the Phase 1 hook from `LanguageContext` (Phase 1 uses an export named `useT`; if your Phase 1 implementation exports a different name, adjust the import). `useColors()` was introduced in T011a; it is the ONLY place hex literals live (Constitution Principle V). Expected outcome: `npx tsc --noEmit` from `<repo>\mobile` returns 0; the file contains no hex literal anywhere.

- [X] T019 [US1] Create `<repo>\mobile\app\(tabs)\profile\addresses.tsx` (the LIST screen). This screen is the entry point for both US1 (empty state + add CTA) and US2 (populated list). Full content:
  ```tsx
  import React, { useCallback, useMemo } from 'react';
  import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
  import { Link, useFocusEffect, useRouter } from 'expo-router';
  import { addressesService, Address } from '../../../services/addresses';
  import { useT, useIsRTL } from '../../../context/LanguageContext';
  import { useColors } from '../../../hooks/useColors';

  export default function AddressesScreen() {
    const t = useT();
    const isRTL = useIsRTL();
    const colors = useColors();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const router = useRouter();
    const [items, setItems] = React.useState<Address[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const refresh = useCallback(async () => {
      setError(null);
      try {
        setItems(await addressesService.list());
      } catch (e) {
        setError(t('common.networkError'));
      }
    }, [t]);

    useFocusEffect(
      useCallback(() => {
        refresh();
      }, [refresh]),
    );

    if (items === null) {
      return (
        <View style={styles.center}><ActivityIndicator /></View>
      );
    }

    if (items.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('addresses.list.empty.title')}</Text>
          <Text style={styles.emptyBody}>{t('addresses.list.empty.body')}</Text>
          <Link href="/(tabs)/profile/addresses/new" asChild>
            <Pressable style={styles.cta}>
              <Text style={styles.ctaText}>{t('addresses.list.addCta')}</Text>
            </Pressable>
          </Link>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      );
    }

    return (
      <View style={styles.wrap}>
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(tabs)/profile/addresses/${item.id}`)}
              style={[styles.row, isRTL && styles.rowRtl]}
            >
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.street}>{item.streetName || '—'}</Text>
            </Pressable>
          )}
        />
        <Link href="/(tabs)/profile/addresses/new" asChild>
          <Pressable style={styles.cta}>
            <Text style={styles.ctaText}>{t('addresses.list.addCta')}</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  function makeStyles(colors: ReturnType<typeof useColors>) {
    return StyleSheet.create({
      center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
      emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
      emptyBody: { fontSize: 14, color: colors.muted, textAlign: 'center' },
      wrap: { flex: 1, padding: 16, backgroundColor: colors.background },
      row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' },
      rowRtl: { flexDirection: 'row-reverse' },
      label: { fontSize: 16, fontWeight: '600', color: colors.text },
      street: { fontSize: 14, color: colors.muted, marginInlineStart: 12 },
      cta: { alignSelf: 'center', marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
      ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
      error: { color: colors.danger, marginTop: 12 },
    });
  }
  ```
  Replace the `useT` / `useIsRTL` import path if your Phase 1 LanguageContext exports differ (check `<repo>\mobile\context\LanguageContext.tsx` for the exact hook names and adjust). The `t('common.networkError')` key is assumed to exist from Phase 1; if not, add it to both locales. Expected outcome: `npx tsc --noEmit` returns 0; the screen renders the empty state on a dev client when no addresses exist; the file contains zero hex literals.

- [X] T020 [US1] Create `<repo>\mobile\app\(tabs)\profile\addresses\new.tsx` (the ADD screen). Full content:
  ```tsx
  import React, { useMemo, useState } from 'react';
  import { Alert, Pressable, StyleSheet, Text, TextInput, ScrollView } from 'react-native';
  import { useRouter } from 'expo-router';
  import { AddressPickerMap } from '../../../../components/AddressPickerMap';
  import { addressesService } from '../../../../services/addresses';
  import { useT } from '../../../../context/LanguageContext';
  import { useColors } from '../../../../hooks/useColors';

  export default function NewAddressScreen() {
    const t = useT();
    const colors = useColors();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const router = useRouter();
    const [label, setLabel] = useState('');
    const [streetName, setStreetName] = useState('');
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [saving, setSaving] = useState(false);

    const onSave = async () => {
      if (!label.trim()) {
        Alert.alert(t('addresses.validation.labelRequired'));
        return;
      }
      if (!coords) {
        Alert.alert(t('addresses.validation.coordinatesInvalid'));
        return;
      }
      setSaving(true);
      try {
        await addressesService.create({
          label: label.trim(),
          streetName,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        router.back();
      } catch {
        Alert.alert(t('common.networkError'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <AddressPickerMap
          value={coords}
          onChange={setCoords}
          onReverseGeocode={setStreetName}
        />
        <Text style={styles.hint}>{t('addresses.picker.permissionDeniedHint')}</Text>

        <Text style={styles.label}>{t('addresses.form.label')}</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder={t('addresses.form.labelPlaceholder')}
          maxLength={80}
        />

        <Text style={styles.label}>{t('addresses.form.streetName')}</Text>
        <TextInput
          style={styles.input}
          value={streetName}
          onChangeText={setStreetName}
          placeholder={t('addresses.form.streetNamePlaceholder')}
          maxLength={200}
        />

        <Pressable
          style={[styles.cta, saving && styles.ctaDisabled]}
          onPress={onSave}
          disabled={saving}
        >
          <Text style={styles.ctaText}>{t('addresses.form.save')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  function makeStyles(colors: ReturnType<typeof useColors>) {
    return StyleSheet.create({
      wrap: { padding: 16, gap: 8, backgroundColor: colors.background },
      hint: { fontSize: 12, color: colors.muted, marginTop: 8 },
      label: { fontSize: 14, fontWeight: '600', marginTop: 12, color: colors.text },
      input: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface },
      cta: { marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
      ctaDisabled: { opacity: 0.6 },
      ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
    });
  }
  ```
  Expected outcome: `npx tsc --noEmit` returns 0; the screen renders the map and form on a dev client; the file contains zero hex literals.

### Backend integration tests for US1

- [ ] T021 [US1] Create `<repo>\backend\test\addresses.e2e-spec.ts` covering US1's happy path. The fixture set MUST be reused by US2 / US3 / Polish, so seed helpers go into a shared file. First create `<repo>\backend\test\helpers\address.fixtures.ts`:
  ```ts
  import { OrderStatus, PaymentMethod, PrismaClient, Role, UserAddress } from '@prisma/client';
  import { hashSync } from 'bcrypt';

  export interface SeededCustomer {
    id: string;
    phone: string;
    accessToken: string;
  }

  export async function seedCustomer(prisma: PrismaClient, signAccess: (userId: string) => string): Promise<SeededCustomer> {
    const phone = `+201${Math.floor(100000000 + Math.random() * 900000000)}`;
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash: hashSync('password1234', 12),
        fullName: 'Test Customer',
        role: Role.CUSTOMER,
        phoneVerified: true,
      },
    });
    return { id: user.id, phone, accessToken: signAccess(user.id) };
  }

  export async function seedAddress(prisma: PrismaClient, userId: string, overrides: Partial<UserAddress> = {}): Promise<UserAddress> {
    return prisma.userAddress.create({
      data: {
        userId,
        label: 'home',
        streetName: '15 Tahrir St',
        latitude: 30.0444,
        longitude: 31.2357,
        ...overrides,
      },
    });
  }

  export async function seedActiveOrder(prisma: PrismaClient, userId: string, addressId: string, chefId: string) {
    return prisma.order.create({
      data: {
        userId,
        chefId,
        addressId,
        paymentMethod: PaymentMethod.CASH,
        status: OrderStatus.PENDING,
        subtotal: 100, deliveryFee: 10, serviceFee: 5, total: 115,
      },
    });
  }

  export async function seedTerminalOrder(prisma: PrismaClient, userId: string, addressId: string, chefId: string) {
    return prisma.order.create({
      data: {
        userId,
        chefId,
        addressId,
        paymentMethod: PaymentMethod.CASH,
        status: OrderStatus.DELIVERED,
        subtotal: 100, deliveryFee: 10, serviceFee: 5, total: 115,
      },
    });
  }
  ```
  Adjust the `Order` fixture's required fields if `prisma migrate status` shows different non-null columns; consult `<repo>\backend\prisma\schema.prisma` for the exact `Order` model. The `chefId` is needed by FK; `seedActiveOrder` / `seedTerminalOrder` will be exercised in T036 — make sure they exist now.

  Also add a log-line capture helper to `<repo>\backend\test\helpers\address.fixtures.ts` (per M3 from `/speckit-analyze`):
  ```ts
  import { Logger } from '@nestjs/common';

  /**
   * Patches NestJS Logger.log to capture every emitted line for the
   * duration of a test. Call `restore()` in afterEach. Used by US1
   * and US2 specs to assert FR-019 line shape and the FR-021 no-coords
   * invariant.
   */
  export function captureLogs() {
    const captured: string[] = [];
    const orig = Logger.prototype.log;
    Logger.prototype.log = function (msg: unknown, ...rest: unknown[]) {
      captured.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
      return orig.call(this, msg as string, ...(rest as []));
    };
    return {
      lines: captured,
      addressEvents(): Array<Record<string, unknown>> {
        return captured
          .map((s) => { try { return JSON.parse(s); } catch { return null; } })
          .filter((j): j is Record<string, unknown> => !!j && typeof (j as { event?: unknown }).event === 'string' && String((j as { event?: unknown }).event).startsWith('address.'));
      },
      restore() { Logger.prototype.log = orig; },
    };
  }

  /** Asserts no captured line contains a coordinate substring (FR-021 / SC-011). */
  export function assertNoCoordsInLogs(lines: string[]): void {
    for (const line of lines) {
      if (/\b(latitude|longitude|coordinates)\b/.test(line)) {
        throw new Error(`FR-021 violation: log line contains coordinate field: ${line}`);
      }
    }
  }
  ```

  Then create the test file proper, `<repo>\backend\test\addresses.e2e-spec.ts`. Spec the following blocks:
  - Boot the test app via `Test.createTestingModule` reusing the `AppModule` like Phase 1 e2e specs do.
  - In `beforeEach`, set up `const cap = captureLogs();` and in `afterEach` call `cap.restore();`. Every test below MUST also call `assertNoCoordsInLogs(cap.lines)` at the end.
  - **describe('US1 — POST /addresses')**:
    - It seeds a customer, sends a valid `POST /api/v1/addresses` body with a label, street, latitude, longitude, asserts 201, asserts the response body has `id`, `label`, `streetName`, `latitude` (string), `longitude` (string), no `userId` field. Asserts `cap.addressEvents()` contains exactly one entry of shape `{ event: 'address.create', outcome: 'success', actorId: <userId>, addressId: <returned.id> }` and no `latitude`/`longitude` keys (SC-011).
    - It refuses a `POST` with an extra `userId` field with 400 `VALIDATION_ERROR` (SC-008). Asserts `cap.addressEvents()` contains exactly one `{ event: 'address.create', outcome: 'validation_rejected' }` line (SC-011).
    - It refuses a `POST` with `latitude: 999` (out-of-range), inspects the response body, asserts there is no `latitude` and no `longitude` anywhere in it (SC-012). Asserts `cap.addressEvents()` contains the `validation_rejected` line and `assertNoCoordsInLogs(cap.lines)` passes.
    - It refuses an unauthenticated `POST` with 401 (Phase 1 guard contract). No address-event line emits (the `JwtAuthGuard` rejects before the filter sees an `address` path mapping; verify by `expect(cap.addressEvents()).toHaveLength(0)`).
  - **describe('US1 — GET /addresses')**:
    - It seeds two customers, three addresses on customer A, one on customer B; `GET /api/v1/addresses` as A returns exactly the three; as B returns exactly the one (FR-015). Read paths emit no FR-019 line (verify `cap.addressEvents()` is empty post-call).

  Expected outcome: from `<repo>\backend` run `npm test -- addresses.e2e-spec` and all cases pass.

**Checkpoint**: User Story 1 is fully functional. A customer can add
their first address via the map picker, the address survives a
restart, the empty list renders before the first save, and the
`address.create / success` log line emits with no coordinates in it.

---

## Phase 4: User Story 2 — A customer maintains their list of delivery addresses (Priority: P1)

**Goal**: Signed-in customer can edit any saved address (label,
street name, pin location, optional fields) and delete any saved
address. Both operations persist across app restarts. Deletion is
already wired through the FR-013 in-flight-order check via
`OrdersService.hasActiveOrderForAddress`; with no active orders
seeded, the check always returns null, so deletion succeeds. US3
will exercise the refusal branch.

**Independent Test**: A customer with at least two saved addresses
edits one (label + pin) and deletes another. Both changes are
visible immediately and after a restart. The deleted entry no
longer appears in any list.

**Maps to**: spec.md User Story 2, FR-010 through FR-014, FR-016,
FR-019, FR-021. SCs delivered: SC-004, SC-009, SC-011 (update +
delete events), SC-012 (update-error redaction).

### Backend (PATCH + DELETE)

- [X] T022 [P] [US2] Create `<repo>\backend\src\modules\addresses\dto\update-address.dto.ts`. Use `class-validator` `@IsOptional()` on every field; the DTO is a partial of `CreateAddressDto`'s validation rules. Full content:
  ```ts
  import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
  import { CreateAddressDto } from './create-address.dto';

  // PartialType marks every field of CreateAddressDto as optional and
  // copies the validation decorators. Result: the same per-field rules
  // apply when present, but every field MAY be omitted.
  export class UpdateAddressDto extends PartialType(CreateAddressDto) {
    // No additional fields. Sending `userId`, `id`, `createdAt`, etc.
    // is refused by the global `forbidNonWhitelisted: true` pipe.
    @ApiPropertyOptional({ description: 'Sub-typed for Swagger only.' })
    private readonly _swaggerMarker?: undefined;
  }
  ```
  The `_swaggerMarker` line keeps Swagger from emitting an empty schema; it is harmless. Expected outcome: TS compiles.

- [X] T023 [US2] Extend `AddressesService` (in `<repo>\backend\src\modules\addresses\addresses.service.ts`) with `update` and `softDelete`. Add:
  ```ts
  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    await this.findOwnedOrThrow(id, userId);
    const row = await this.prisma.userAddress.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.streetName !== undefined && { streetName: dto.streetName }),
        ...(dto.building !== undefined && { building: dto.building ?? null }),
        ...(dto.floor !== undefined && { floor: dto.floor ?? null }),
        ...(dto.apartment !== undefined && { apartment: dto.apartment ?? null }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
      },
    });
    this.events.emit({
      event: 'address.update',
      outcome: 'success',
      actorId: userId,
      addressId: id,
    });
    return AddressResponseDto.from(row);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    await this.findOwnedOrThrow(id, userId);

    // FR-013 in-flight-order safety rail.
    const active = await this.orders.hasActiveOrderForAddress(id, userId);
    if (active) {
      this.events.emit({
        event: 'address.delete',
        outcome: 'in_use',
        actorId: userId,
        addressId: id,
      });
      throw new ConflictException({
        code: 'ADDRESS_IN_USE',
        message: 'Address is in use by an order in progress.',
        activeOrderId: active.activeOrderId,
      });
    }

    await this.prisma.userAddress.softDelete({ where: { id } });
    this.events.emit({
      event: 'address.delete',
      outcome: 'success',
      actorId: userId,
      addressId: id,
    });
  }
  ```
  Add the imports at the top of the file:
  ```ts
  import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  import { UpdateAddressDto } from './dto/update-address.dto';
  ```
  Note 1: `findOwnedOrThrow` already throws `404 ADDRESS_NOT_FOUND` for missing-or-foreign rows, satisfying SC-006. The `address.update / not_found` and `address.delete / not_found` log lines are emitted by an exception filter in T026 (the controller-level path); the service does not emit on failure here because the throw happens before any side effect.

  Note 2: `prismaService.userAddress.softDelete` is the Phase 0 extension model method — confirm it exists in `<repo>\backend\src\common\prisma\prisma.service.ts` before running the build. If it does not, the Phase 0 contract is broken and Phase 2 cannot proceed.

  Expected outcome: `npm run build` succeeds.

- [ ] T024 **[VOIDED by the C1 fix from `/speckit-analyze`]** [US2] No work to do. The `validation_rejected` and `not_found` outcomes for `/api/v1/addresses/*` paths are emitted by the extended global `HttpExceptionNormalizerFilter` (T007 in this revised tasks.md), NOT by a controller-level filter. Reason: NestJS controller-level filters do not delegate to global filters — once a controller filter handles an exception, the global filter is bypassed, which would defeat the FR-021 coordinate scrubber and the response normalisation. T007 already inlines the path-matching emission. Skip this task; do NOT create `address-event.filter.ts`. (The task ID is preserved so cross-references in plan.md / data-model.md / commits remain stable.)

- [X] T025 [US2] Extend `<repo>\backend\src\modules\addresses\addresses.controller.ts` with `PATCH /addresses/:id` and `DELETE /addresses/:id`. Do NOT add any `@UseFilters` decorator — the FR-019 `validation_rejected` / `not_found` outcomes are emitted by the extended global filter (T007), not by a controller-level filter (per the C1 fix that voided T024). Add the imports:
  ```ts
  import { Delete, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
  import { UpdateAddressDto } from './dto/update-address.dto';
  ```
  Add the methods inside the class body:
  ```ts
  @Patch(':id')
  update(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.svc.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: JwtRequest, @Param('id') id: string): Promise<void> {
    return this.svc.softDelete(req.user.sub, id);
  }
  ```
  Expected outcome: `npm run build` succeeds; the Swagger UI now lists four endpoints under the **Addresses** tag.

### Mobile (edit screen, delete confirm, services completion)

- [X] T026 [P] [US2] Extend `<repo>\mobile\services\addresses.ts` with `update` and `delete`. Append:
  ```ts
  export interface UpdateAddressInput {
    label?: string;
    streetName?: string;
    building?: string;
    floor?: string;
    apartment?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  }

  export interface AddressInUseError {
    code: 'ADDRESS_IN_USE';
    message: string;
    activeOrderId: string;
  }

  // Append inside the addressesService object:
  ```
  Then add to the existing object literal:
  ```ts
  async update(id: string, input: UpdateAddressInput): Promise<Address> {
    const { data } = await api.patch<Address>(`/api/v1/addresses/${id}`, input);
    return data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/api/v1/addresses/${id}`);
  },
  ```
  Expected outcome: `npx tsc --noEmit` returns 0.

- [X] T027 [US2] Create `<repo>\mobile\app\(tabs)\profile\addresses\[id].tsx` (the EDIT screen with delete CTA). The screen is structurally similar to T020 with these differences: it loads the address by ID on mount, pre-populates the form, calls `update` on save, and exposes a `Delete` button that confirms and calls `delete`. On `409 ADDRESS_IN_USE`, the Delete handler shows the in-use modal (T037) instead of the network-error toast. Full content:
  ```tsx
  import React, { useEffect, useMemo, useState } from 'react';
  import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
  import { useLocalSearchParams, useRouter } from 'expo-router';
  import axios from 'axios';
  import { AddressPickerMap } from '../../../../components/AddressPickerMap';
  import { addressesService, Address, AddressInUseError } from '../../../../services/addresses';
  import { useT } from '../../../../context/LanguageContext';
  import { useColors } from '../../../../hooks/useColors';

  export default function EditAddressScreen() {
    const t = useT();
    const colors = useColors();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [loaded, setLoaded] = useState<Address | null>(null);
    const [label, setLabel] = useState('');
    const [streetName, setStreetName] = useState('');
    const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [inUse, setInUse] = useState<AddressInUseError | null>(null);

    useEffect(() => {
      (async () => {
        const all = await addressesService.list();
        const found = all.find((a) => a.id === id);
        if (!found) {
          router.back();
          return;
        }
        setLoaded(found);
        setLabel(found.label);
        setStreetName(found.streetName);
        setCoords({ latitude: parseFloat(found.latitude), longitude: parseFloat(found.longitude) });
      })();
    }, [id, router]);

    if (!loaded || !coords) {
      return <View style={styles.center}><ActivityIndicator /></View>;
    }

    const onSave = async () => {
      if (!label.trim()) { Alert.alert(t('addresses.validation.labelRequired')); return; }
      setBusy(true);
      try {
        await addressesService.update(loaded.id, {
          label: label.trim(),
          streetName,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        router.back();
      } catch {
        Alert.alert(t('common.networkError'));
      } finally { setBusy(false); }
    };

    const onDeleteConfirmed = async () => {
      setBusy(true);
      try {
        await addressesService.delete(loaded.id);
        router.back();
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.code === 'ADDRESS_IN_USE') {
          setInUse(e.response.data as AddressInUseError);
        } else {
          Alert.alert(t('common.networkError'));
        }
      } finally { setBusy(false); }
    };

    const onDelete = () => {
      Alert.alert(
        t('addresses.deleteConfirm.title'),
        t('addresses.deleteConfirm.body'),
        [
          { text: t('addresses.deleteConfirm.cancel'), style: 'cancel' },
          { text: t('addresses.deleteConfirm.confirm'), style: 'destructive', onPress: onDeleteConfirmed },
        ],
      );
    };

    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <AddressPickerMap value={coords} onChange={setCoords} onReverseGeocode={setStreetName} />

        <Text style={styles.label}>{t('addresses.form.label')}</Text>
        <TextInput style={styles.input} value={label} onChangeText={setLabel} maxLength={80} />

        <Text style={styles.label}>{t('addresses.form.streetName')}</Text>
        <TextInput style={styles.input} value={streetName} onChangeText={setStreetName} maxLength={200} />

        <Pressable style={[styles.cta, busy && styles.disabled]} onPress={onSave} disabled={busy}>
          <Text style={styles.ctaText}>{t('addresses.form.save')}</Text>
        </Pressable>

        <Pressable style={[styles.danger, busy && styles.disabled]} onPress={onDelete} disabled={busy}>
          <Text style={styles.dangerText}>{t('addresses.edit.delete')}</Text>
        </Pressable>

        {inUse ? (
          <View style={styles.inUseBox}>
            <Text style={styles.inUseTitle}>{t('addresses.inUse.title')}</Text>
            <Text style={styles.inUseBody}>{t('addresses.inUse.body')}</Text>
            <Pressable
              style={styles.cta}
              onPress={() => router.push(`/(tabs)/orders/${inUse.activeOrderId}`)}
            >
              <Text style={styles.ctaText}>{t('addresses.inUse.viewOrderCta')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryCta} onPress={() => setInUse(null)}>
              <Text>{t('addresses.inUse.ok')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  function makeStyles(colors: ReturnType<typeof useColors>) {
    return StyleSheet.create({
      center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
      wrap: { padding: 16, gap: 8, backgroundColor: colors.background },
      label: { fontSize: 14, fontWeight: '600', marginTop: 12, color: colors.text },
      input: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface },
      cta: { marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
      secondaryCta: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
      ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
      disabled: { opacity: 0.6 },
      danger: { marginTop: 12, borderWidth: 1, borderColor: colors.danger, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
      dangerText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
      inUseBox: { marginTop: 24, padding: 16, borderRadius: 8, backgroundColor: colors.warningSurface, borderColor: colors.warningBorder, borderWidth: 1, gap: 8 },
      inUseTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
      inUseBody: { fontSize: 14, color: colors.text },
    });
  }
  ```
  The deep-link target `/(tabs)/orders/${inUse.activeOrderId}` does not exist until Phase 6 — that is acceptable; the link silently no-ops on a non-matching route, and Phase 6 will provide the route. Expected outcome: `npx tsc --noEmit` returns 0; the file contains zero hex literals.

### Backend tests for US2

- [ ] T028 [US2] Extend `<repo>\backend\test\addresses.e2e-spec.ts` with US2 cases. Reuse the `captureLogs()` helper from T021. Every test in this block also asserts `cap.addressEvents()` contains exactly one line of the expected `(event, outcome)` shape, never carrying `latitude` / `longitude` / `coordinates` (SC-011 + FR-021):
  - **describe('US2 — PATCH /addresses/:id')**:
    - It seeds two addresses on customer A; PATCH on the first changes the label only; the response shows the new label and the unchanged street/coords. Asserts `address.update / success` line emitted.
    - It refuses PATCH on customer A's address when authenticated as customer B with 404 ADDRESS_NOT_FOUND (FR-015 / SC-006). Asserts `address.update / not_found` line emitted.
    - It refuses PATCH with `latitude: 999` with 400 VALIDATION_ERROR; response body asserted to contain neither `latitude` nor `longitude` (SC-012). Asserts `address.update / validation_rejected` line emitted.
    - **PATCH allowed during in-flight order (FR-011 — M2 from `/speckit-analyze`)**: Seeds an address on customer A AND an active order (`status: PENDING`) referencing that address (use `seedChef` + `seedActiveOrder` from T029 — note that this case forces the implementer to land T029 before T028 finalises; mark T028 as depending on T029 in the Dependencies section). Sends a PATCH that changes `label`. Asserts 200, asserts the row's new label is persisted via a follow-up GET. This guards against a future regression that would mistakenly extend the FR-013 safety rail to PATCH.
  - **describe('US2 — DELETE /addresses/:id')** (no active orders seeded; FR-013 always returns null in this block):
    - It seeds one address on customer A; DELETE returns 204; subsequent GET /addresses returns an empty list. Asserts `address.delete / success` line emitted.
    - It refuses DELETE of an already-soft-deleted address with 404 (SC-009 — the read filter is exercised end-to-end on this surface). Asserts `address.delete / not_found` line emitted.
    - It refuses DELETE on customer A's address when authenticated as customer B with 404 (FR-015 / SC-006). Asserts `address.delete / not_found` line emitted.

  Expected outcome: `npm test -- addresses.e2e-spec` passes ALL US1 + US2 cases. Every captured `address.*` line has been asserted; `assertNoCoordsInLogs(cap.lines)` passes for every test.

**Checkpoint**: User Stories 1 AND 2 are both fully functional and
independently testable. The customer can add, list, edit, and
delete addresses; the FR-013 path is wired but not yet exercised
with seeded orders.

---

## Phase 5: User Story 3 — The platform protects an in-flight order from losing its delivery target (Priority: P2)

**Goal**: When the customer attempts to delete an address that is
referenced by an order in non-terminal status, the platform refuses
with `409 ADDRESS_IN_USE` carrying the `activeOrderId` deep-link
hint. The address remains saved. After the order moves to a
terminal status, the same delete attempt succeeds. The mobile
client surfaces the refusal as a clear modal with a "view that
order" CTA.

**Independent Test**: A customer places an order on address A
(simulated via the Phase 5 test fixture; Phase 6 has not landed).
Attempting to delete A while the order status is non-terminal
returns 409 and the address remains. Flipping the order's status to
DELIVERED and retrying succeeds.

**Maps to**: spec.md User Story 3, FR-013, FR-019. SCs delivered:
SC-005, SC-011 (delete in_use event).

> **Note**: This phase ships ZERO new production code. The DELETE
> path (T023) and mobile in-use UI (T027) already wire the FR-013
> contract. Phase 5 adds **only fixtures and tests** that exercise
> the wired path.

- [ ] T029 [US3] Add a `seedChef` helper to `<repo>\backend\test\helpers\address.fixtures.ts` so `seedActiveOrder` / `seedTerminalOrder` have a valid chef FK. **Precondition (L3 from `/speckit-analyze`)**: from `<repo>\backend` first run `npx prisma migrate status` and confirm zero drift, then open `<repo>\backend\prisma\schema.prisma` and locate `model Chef`; cross-check the non-null fields against the helper below. If the schema requires more non-null columns than the helper sets (e.g., `logo`, `banner`, `isOpen` defaulting), extend the `data: { ... }` object before continuing — a missing non-null FK or required field will fail the seed at runtime, not at TS compile. Append:
  ```ts
  import { Chef } from '@prisma/client';

  export async function seedChef(prisma: PrismaClient): Promise<Chef> {
    // Chef has a 1:1 to User, so seed a User with role CHEF first.
    const user = await prisma.user.create({
      data: {
        phone: `+201${Math.floor(100000000 + Math.random() * 900000000)}`,
        passwordHash: hashSync('password1234', 12),
        fullName: 'Test Chef',
        role: Role.CHEF,
        phoneVerified: true,
      },
    });
    return prisma.chef.create({
      data: {
        userId: user.id,
        chefName: 'Test Kitchen',
        bio: 'Seed',
        latitude: 30.0,
        longitude: 31.2,
        minOrderPrice: 50,
        isVerified: true,
      },
    });
  }
  ```
  Adjust the field set if `Chef` requires more non-null columns; consult `<repo>\backend\prisma\schema.prisma`. Expected outcome: TS compiles.

- [ ] T030 [US3] Extend `<repo>\backend\test\addresses.e2e-spec.ts` with US3 cases under a new `describe('US3 — DELETE refused by in-flight order')` block. Reuse the `captureLogs()` helper from T021's helpers:
  - It seeds customer A, an address on A, a chef, and an active order linking the two; DELETE on the address returns 409 with body `{ code: 'ADDRESS_IN_USE', activeOrderId: <orderId> }`. A subsequent GET /addresses still includes the address (SC-005, FR-013). Asserts `cap.addressEvents()` contains exactly one `{ event: 'address.delete', outcome: 'in_use', actorId, addressId }` line; `assertNoCoordsInLogs(cap.lines)` passes.
  - It seeds customer A, an address on A, a chef, and a terminal (DELIVERED) order linking the two; DELETE on the address returns 204 (User Story 3 acceptance scenario 2). Asserts the captured line is `address.delete / success`.
  - It seeds an active order, attempts DELETE, captures the 409 response body, and asserts the body contains `activeOrderId` but **does NOT contain** `latitude`, `longitude`, or `coordinates` (SC-012 — the redaction filter pass T007 step 4 strips these from any error envelope).

  Expected outcome: `npm test -- addresses.e2e-spec` passes all US1 + US2 + US3 cases.

- [ ] T031 [US3] Mobile UI verification of US3 acceptance scenario 3. The modal shipped in T027 is sufficient — this task is a manual on-device check during the Phase 6 quickstart, NOT a code task. Add a TODO comment in `[id].tsx` (the edit screen): `// US3 acceptance scenario 3 — verified manually per quickstart Step 6.` Expected outcome: comment present; nothing else changes.

**Checkpoint**: User Story 3 is verified. The DELETE path refuses
in-flight orders, the address remains saved on refusal, and the
modal points the customer at the active order.

---

## Phase 6: User Story 4 — Bilingual + RTL parity on every Phase 2 surface (Priority: P3)

**Goal**: 100% of strings on the Phase 2 surfaces (list, add, edit,
delete confirmation, in-use refusal, every validation message) are
localised in both English and Arabic. The Arabic version renders
right-to-left end-to-end. The language toggle from Phase 1 is
honoured without an app restart.

**Independent Test**: A customer with the in-app language set to
Arabic walks through the US1 + US2 + US3 flows; every visible string
is in Arabic and the layout is right-to-left. Toggling to English
and re-entering the surfaces flips both without a restart.

**Maps to**: spec.md User Story 4, FR-017. SC delivered: SC-007.

- [ ] T032 [US4] Audit i18n key parity. Create `<repo>\mobile\scripts\check-i18n-symmetry.ts` (the `mobile/scripts/` folder is created by this task — `mkdir -p mobile/scripts` if absent). The script imports both `constants/i18n/en.ts` and `constants/i18n/ar.ts`, walks the recursive key set depth-first, and prints any key present in one file and not the other. Run it via `npx tsx scripts/check-i18n-symmetry.ts` from `<repo>\mobile`. Expected outcome: zero asymmetric keys printed; exit code 0. If asymmetric keys exist, fix the laggard locale file before continuing. The script is reusable across all later phases — keep it under `mobile/scripts/` so future `/speckit-tasks` runs can invoke it.

- [ ] T033 [US4] On-device RTL pass. Boot the dev client (`npx expo start --dev-client`), set the in-app language to Arabic via the Phase 1 settings surface, then walk through:
  - addresses list (empty + populated states)
  - add-address screen (every form field, validation error, picker hint)
  - edit-address screen (every form field, delete CTA, delete confirm)
  - in-use-by-order modal (trigger via the Phase 5 fixture or a temporary local server-side seed)

  For each surface, verify visually: (a) every label/placeholder/error/CTA reads in Arabic; (b) `flexDirection: 'row'` UI elements render right-to-left (use the address-list row's `rowRtl` style as the canonical example); (c) icons that have an obvious horizontal asymmetry (chevrons, back arrows) mirror correctly. If any string fails, add the missing key to BOTH locale files and re-test. Expected outcome: a screenshot or note for each surface confirming Arabic + RTL parity. Switch the language back to English and confirm every surface flips on the next render (no restart required).

- [ ] T034 [US4] If the validation copy (`addresses.validation.*`) is rendered via `Alert.alert` (per T020 / T027), confirm both `Alert.alert` titles render in the active language. iOS and Android `Alert` accept localised strings as input; nothing OS-level needs changing. Expected outcome: validation alerts in the active language on both platforms.

**Checkpoint**: User Story 4 is verified. Phase 2 contributes zero
hardcoded strings or directional literals to the mobile bundle.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, Swagger annotations, quickstart pass,
contributor-doc updates.

- [ ] T035 [P] Annotate the Phase 2 endpoints in Swagger. In `<repo>\backend\src\modules\addresses\addresses.controller.ts`, add `@ApiOperation`, `@ApiOkResponse` / `@ApiCreatedResponse` / `@ApiNoContentResponse`, `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiNotFoundResponse`, and (on DELETE) `@ApiConflictResponse` decorators on each route handler. Reference `contracts/addresses.openapi.yaml` for the exact response codes per route. Use `AddressResponseDto` as the response type wherever the contract is `Address`. Expected outcome: the Swagger UI at `/api/v1/docs` renders the four endpoints with full request/response detail and the `Address` schema linked from the response.

- [ ] T036 [P] Run the full backend security & observability sweep from `quickstart.md` Step 8. From `<repo>\backend`:
  ```powershell
  npm test -- addresses.e2e-spec
  npm test -- http-redaction.spec
  ```
  Both suites pass. Tail the backend logs while running Steps 3–6 of the quickstart manually on a real device, and confirm:
  - One `address.create / success` line per save.
  - One `address.update / success` line per edit.
  - One `address.delete / success` line per delete (no active orders).
  - One `address.delete / in_use` line per refused delete (active order seeded).
  - One `address.update / not_found` line on a foreign-customer PATCH.
  - Every line carries a non-null `correlationId` and NEVER carries `latitude`, `longitude`, or `coordinates`.

  Expected outcome: every check passes. If any FR-019 line is missing, trace the path: the extended global `HttpExceptionNormalizerFilter` (T007) handles `validation_rejected` and `not_found` outcomes for `/api/v1/addresses/*`, the service emits `success` and `in_use` directly.

- [ ] T036a **Hard manual gate for SC-010** (M4 from `/speckit-analyze`). On a real device with a clean app state: (a) revoke the Nafas app's "Location" permission via the device's system settings; (b) open the Add Address screen — confirm the map renders (centred on Cairo, R3); (c) drag the map to position the pin; (d) type a label; (e) tap Save — confirm 201 and the address appears in the list. Repeat with the permission denied at the OS prompt (cold first-grant flow) on both iOS and Android. Expected outcome: zero blockers across both platforms. SC-010 has no automated coverage; this is the only verification gate. Do NOT skip — the failure mode (modal hang, Save button greyed) is exactly the regression a future refactor of `AddressPickerMap` could re-introduce silently.

- [ ] T037 Run the full Phase 2 quickstart from `quickstart.md` end-to-end on a real device. Tick every box in the Done Criteria section at the bottom of `quickstart.md`. Specifically verify the SC-001 budget: the add-address flow on a real device under 60 seconds. If any step fails, do NOT mark the task done — fix the underlying code and rerun the step.

- [ ] T038 Decide whether to add a Phase 2 conventions block to `<repo>\CLAUDE.md`. The auto-generated section currently lists Phase 0 and Phase 1 conventions only. If you want future agents to inherit the Phase 2 invariants — `OrdersService.hasActiveOrderForAddress` is the canonical Order chokepoint, single-find ownership shape on `UserAddress`, scrubber-redaction in the global filter, namespaced event loggers, `useColors()` is the only place hex literals live, Maps API key custody — append a "Phase 2 conventions (do not regress)" block under the `<!-- MANUAL ADDITIONS START -->` marker mirroring the Phase 0 / Phase 1 blocks. Skip if you prefer to leave CLAUDE.md untouched; the spec dir is the canonical reference either way.

- [ ] T039 Final lint + typecheck across all three workspaces.
  ```powershell
  # Backend:
  cd <repo>\backend; npm run lint; npm run build; npm test
  # Mobile:
  cd <repo>\mobile; npx tsc --noEmit
  # Admin (no Phase 2 changes — sanity check only):
  cd <repo>\admin; npx tsc --noEmit; npm run build
  ```
  Expected outcome: each command returns 0. Specifically, `bash <repo>\backend\scripts\ci-no-hard-delete.sh` reports zero hard-delete calls.

- [ ] T040 Open a PR from `003-phase-2-addresses` to `main`. The PR description includes:
  - A link to `specs/003-phase-2-addresses/spec.md`.
  - The Constitution Check verdicts from `plan.md` (PASS/PASS).
  - A short bullet list of the four endpoints shipped and the three mobile screens.
  - A note that the spec dir number (003) and branch number (004) differ because of a stale `003-phase-2-addresses` branch from a prior attempt; mention whether the stale branch was deleted as part of cleanup.
  - The done criteria from `quickstart.md` ticked.

  Expected outcome: PR opened, CI green on the mobile + backend + admin workflows.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001–T005)**: No dependencies on Phase 2 code. T002, T003, T004 must precede the mobile tasks (T018, T020, T027) that depend on `expo-location` and the Maps key.
- **Foundational (Phase 2, T006–T011a)**: Depends on Setup. **BLOCKS all user stories.** T011a (`useColors()` hook) must complete before any mobile component task (T018, T019, T020, T027).
- **User Story 1 (Phase 3, T012–T021)**: Depends on Foundational complete. P1 — start here for MVP.
- **User Story 2 (Phase 4, T022–T028)**: Depends on Foundational AND on the AddressesService / Controller / Module shells from US1 (T014, T015, T016) — extends them, does not duplicate. **T028 specifically depends on T029** (the FR-011 edit-during-in-flight case requires the `seedChef` + `seedActiveOrder` fixtures defined in T029) — finalise T029 before completing T028.
- **User Story 3 (Phase 5, T029–T031)**: T029 (fixtures) is consumed by T028 (US2 test) AND T030 (US3 tests). Schedule T029 before T028's FR-011 case lands. Adds fixtures + tests only — no new production code.
- **User Story 4 (Phase 6, T032–T034)**: Depends on US1 + US2 (the screens whose Arabic + RTL behaviour US4 verifies are shipped there). Independent of US3.
- **Polish (Phase 7, T035–T040)**: Depends on US1 + US2 + US3 + US4. T036a (SC-010 manual gate) is hard — do not skip.

### Within-Phase Dependencies (Phase 3 / US1)

- T012, T013 are independent ([P] — DTO files, no cross-imports).
- T014 depends on T012 + T013 (service consumes both DTOs).
- T015 depends on T014 (controller calls service).
- T016 depends on T015 (module wires the controller).
- T017, T018 are independent of the backend tasks — mobile services and components.
- T019 depends on T017 (the list screen consumes `addressesService.list`).
- T020 depends on T017 + T018 (the add screen consumes the service and the picker).
- T021 depends on T015 + T016 (e2e test hits the live POST/GET endpoints).

### Within-Phase Dependencies (Phase 4 / US2)

- T022 is independent ([P] — DTO file).
- T023 depends on T014 (extends `AddressesService`) and T022 (consumes `UpdateAddressDto`).
- T024 is **VOIDED** by the C1 fix (no new file shipped).
- T025 depends on T023 (no dependency on T024 since T024 is voided).
- T026 is mobile, independent of T022–T025.
- T027 depends on T026 + T018 + T011a.
- T028 depends on T025 AND T029 (FR-011 test needs the `seedChef` / `seedActiveOrder` fixtures that ship in T029).

### Parallel Opportunities

Within each story phase, all `[P]` tasks can fan out to separate
agents/developers if available. The biggest parallel windows:

- **Foundational**: T008 (filter test) + T011 (i18n seed) + T011a (useColors hook) parallel to T006/T007/T009.
- **US1**: T012 + T013 + T017 + T018 all parallel; T021 (e2e) blocks on T016.
- **US2**: T022 + T026 parallel; T028 (tests) blocks on T025 AND T029 (the chef seed fixture). T024 is voided.
- **US4**: T032 + T033 are sequential (audit before manual sweep) but each can interleave with backend Polish tasks (T035 / T036) which run in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (T001–T005). One developer, ~30 min.
2. Complete Phase 2: Foundational (T006–T011). One developer, ~2 hr.
3. Complete Phase 3: User Story 1 (T012–T021). One developer, ~6 hr.
4. **STOP and VALIDATE**: A signed-in customer adds their first address on a real device and the address persists. Demoable.

### Incremental Delivery

1. MVP → demo / merge.
2. Add User Story 2 (T022–T028). The customer can now manage the
   list (edit + delete). Demoable independently.
3. Add User Story 3 (T029–T031). The FR-013 contract is
   demonstrably enforced. Demoable independently (with a seeded
   active order via the test fixture).
4. Add User Story 4 (T032–T034). Bilingual + RTL parity verified.
5. Polish (T035–T040). Production-ready.

### Parallel Team Strategy

With three developers:

1. All three complete Setup + Foundational together (~2.5 hr).
2. Once foundational is done:
   - Developer A (backend): US1 backend tasks (T012–T016, T021).
   - Developer B (mobile): US1 mobile tasks (T017–T020).
   - Developer C (parallel work): T011 i18n seed + T032 i18n script
     (precondition for US4) + Swagger annotations (T035) wherever
     A's controllers land.
3. After US1 lands, A picks up US2 backend (T022–T025, T028);
   B picks up US2 mobile (T026, T027); C picks up US3 fixtures +
   tests (T029, T030).
4. US4 (T032–T034) is naturally a polish pass any developer can run.

---

## Notes

- `[P]` tasks are different files with no cross-dependency — fan
  out freely.
- `[Story]` labels (`US1`–`US4`) trace the task back to spec.md so
  a partial implementation (e.g., MVP only) can stop at a clean
  checkpoint.
- Tests live with the story they prove. SC-005, SC-011, SC-012 and
  the FR-021 redaction are exercised by the `addresses.e2e-spec.ts`
  + `http-redaction.spec.ts` pair built up across T021, T028, T030.
- Commit after each task or logical group. The
  `speckit.git.commit` `after_implement` hook (optional) will
  prompt automatically.
- Stop at any `**Checkpoint**` to validate independently.
- Avoid: vague tasks ("add map screen"), same-file conflicts on
  parallel branches (the controller and the service grow across
  phases — coordinate when both Phase 3 and Phase 4 contributors
  edit them), cross-story dependencies that break independence
  (US3 deliberately depends on US2's DELETE; that is allowed
  because US3 ships ONLY tests).
