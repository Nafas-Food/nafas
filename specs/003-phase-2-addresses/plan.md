# Implementation Plan: Saved Delivery Addresses with Map Picker

**Branch**: `003-phase-2-addresses` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-phase-2-addresses/spec.md`

## Summary

Phase 2 ships the **delivery-target substrate** that every later
ordering phase reads: a saved-addresses surface for customers, a visual
map-picker UX for choosing coordinates, the FR-013 in-flight-order
safety rail that protects an active delivery's destination from being
silently deleted, and an observability contract (FR-019, FR-021) that
mirrors Phase 1's structured-log discipline while never letting the
customer's lat/lng leak into a log line or an error response.

Concretely it delivers:

1. **One new backend module — `AddressesModule`** — exposing four
   authenticated endpoints (`GET /addresses`, `POST /addresses`,
   `PATCH /addresses/:id`, `DELETE /addresses/:id`), every one
   ownership-checked against the authenticated customer's `sub` claim,
   every `findMany`/`findUnique` going through
   `prismaService.extended.userAddress.*` so soft-deleted rows are
   invisible by construction (FR-016, SC-009).
2. **A minimal `OrdersModule` shell** — a single service method
   `OrdersService.hasActiveOrderForAddress(addressId, userId)` that
   reads `prismaService.extended.order.findFirst({ where: { addressId,
   userId, status: { notIn: ['DELIVERED', 'CANCELLED'] } } })` and
   returns a boolean. `AddressesService` injects `OrdersService` and
   calls this method on every delete (FR-013, SC-005). Phase 6 will
   expand the module with order placement and the full lifecycle; this
   shell exists now so `AddressesModule` honours Constitution
   Principle III (no cross-module Prisma access) from day one.
3. **A new mobile component — `AddressPickerMap`** — built on
   `react-native-maps` (already installed in Phase 0), takes
   coordinates as a controlled value, emits coordinate changes on pin
   drag, optionally seeds the initial pin from the device's last
   known location via `expo-location` (new dep), and triggers a
   reverse-geocoding lookup on every pin movement to pre-fill the
   street-name field (FR-005, FR-006, FR-007).
4. **Three new mobile screens** — `app/(tabs)/profile/addresses.tsx`
   (list), `app/(tabs)/profile/addresses/new.tsx` (add),
   `app/(tabs)/profile/addresses/[id].tsx` (edit) — each consuming
   `t(key)` for every visible string and `isRTL` for layout direction
   per Constitution Principle I and FR-017. The address-selection
   sheet that Phase 5 will wire at checkout is *not* shipped here; its
   read shape is shared with the list screen.
5. **A reverse-geocoding integration** — see research R1; default is
   `expo-location.reverseGeocodeAsync` (no API key, uses the device's
   native geocoder), with the Google Geocoding REST API named in
   `docs/IMPLEMENTATION_PLAN.md` D4c retained as the documented
   fallback if accuracy or platform-consistency proves inadequate at
   verification.
6. **The structured-log surface for address mutations** — ships a
   sibling `common/logging/address-event.logger.ts` that mirrors the
   Phase 1 `auth-event.logger.ts` line shape (a future cleanup phase
   MAY merge the two into one namespaced logger; the sibling
   approach minimises Phase 1 churn). Service-layer success and
   `in_use` outcomes emit directly. The `validation_rejected` and
   `not_found` outcomes are emitted from the existing global
   `HttpExceptionNormalizerFilter` (extended in this phase) because
   their underlying triggers (`ValidationPipe` rejection,
   `NotFoundException` thrown by `findOwnedOrThrow`) are caught
   there before any controller-scoped filter can run — the same
   pattern Phase 1 uses for `auth.password_validation` /
   `auth.rate_limit`. The same global filter also strips `latitude`,
   `longitude`, and `coordinates` from every error-response payload
   before serialisation per FR-021 (research R6) — one chokepoint,
   two responsibilities.
7. **A `useColors()` mobile hook** — introduced in this phase to
   honour Constitution Principle V. All three new mobile screens
   and the new `AddressPickerMap` component consume tokens from
   this hook (no hex literals in components). The hook centralises
   the design-system palette in `mobile/hooks/useColors.ts`; the
   hex constants live there exclusively.
8. **Swagger documentation** for every Phase 2 endpoint, mounted at
   the existing `/api/v1/docs`.

No new schema entities — `UserAddress` was migrated in Phase 0 and is
*populated* for the first time in this phase. FR-013 references
`Order.status` (already migrated; remains unpopulated until Phase 6);
the read path against it is `findFirst` on a status set, no writes.

## Technical Context

**Language/Version**: TypeScript 5.x across all three workspaces
(unchanged from Phase 0 / Phase 1).

**Primary Dependencies** (new in Phase 2, layered on Phase 1):

- Backend: none beyond what Phase 1 installed. The reverse-geocoding
  call lives on the mobile client (R1). The CRUD surface uses
  `class-validator` + `class-transformer` already wired by Phase 0.
- Mobile: `expo-location` (new — required for "centre on device
  location when permission granted" per FR-007 and acceptance scenario
  5 of User Story 1). `react-native-maps` was installed in Phase 0
  task 0.3 and is reused here. No SDK is added for reverse-geocoding
  per R1 (the chosen default is `expo-location.reverseGeocodeAsync`,
  bundled with the existing dep).

**Storage**: PostgreSQL 15 via Supabase (per-contributor projects,
unchanged). Phase 2 reads/writes only the `UserAddress` table (already
migrated in Phase 0) and reads (never writes) the `Order` table for
FR-013. No schema changes — FR-020 forbids introducing a persisted
audit-log entity in Phase 2; if that becomes necessary later, a
constitution amendment is the prerequisite, identical to the Phase 1
posture.

**Testing**:

- Backend: Jest + `@nestjs/testing` + Supertest for integration tests
  against a Supabase test project. The Phase 1 test fixtures
  (registered customer, signed-in session) are reused. Integration
  coverage targets every acceptance scenario in `spec.md` and every
  success criterion that can be exercised in-process (SC-002, SC-004,
  SC-005, SC-006, SC-008, SC-009, SC-011, SC-012). The FR-013 check
  is exercised by seeding a single `Order` row directly with the test
  Prisma client (Phase 6 has not landed; the test fixture stands in
  for the Phase 6 placement flow).
- Mobile: Manual on-device verification per `quickstart.md` covers
  the map picker, the reverse-geocoding pre-fill, the bilingual + RTL
  parity, and the location-permission-denied path. No new automated
  mobile tests are introduced in this phase; the map-picker behaviour
  is intrinsically a UX concern that automated mobile tests on a
  bare-bones Expo project would not meaningfully cover.

**Target Platform**:

- Backend: Linux container (`node:20-slim`), `docker-compose.dev.yml`
  bring-up unchanged.
- Mobile: iOS 15+ / Android API 24+ via Expo SDK 54. Phase 2 is the
  first phase that ships a screen using `react-native-maps`; the
  quickstart confirms the dev-client build picks up the native module
  on both platforms.
- Admin: not exercised in Phase 2.

**Project Type**: Same monorepo with three sibling workspaces. Phase 2
fills two previously empty backend module folders (`addresses/`,
`orders/` — orders ships the shell described in Summary point 2),
introduces three new mobile screens under
`app/(tabs)/profile/addresses/`, one new mobile component, and a new
mobile service module.

**Performance Goals**:

- Add-address flow on a real device under 60 seconds end-to-end
  including map-pin drag and save (SC-001).
- Reverse-geocoding pre-fill appears within 2 seconds of pin movement
  in the typical case where the lookup succeeds (SC-003); a failure
  is silently absorbed and never surfaces a user-visible error.
- The FR-013 in-flight-order check is a single-row `findFirst` on the
  existing `(status)` index (filtered by `addressId` and `userId`),
  expected p95 latency ≪ 50 ms. No dedicated `(addressId, status)`
  composite index is introduced in Phase 2; the lookup is rare enough
  that the existing indexes suffice (see data-model.md).

**Constraints**:

- No new entities (FR-020 + Constitution Principle IV — schema is
  canonical).
- No raw SQL (Constitution Principle IV — Phase 2 introduces no new
  exception; the only `$queryRaw` carve-out remains the Phase 0
  health probe).
- No client-trusted ownership decisions (Constitution Principle II —
  every read/update/delete on `UserAddress` re-derives the owner
  from the verified JWT subject and refuses anything else, FR-015).
- No lat/lng in any observability surface (FR-021). The backend's
  global `HttpExceptionNormalizerFilter` strips `latitude` /
  `longitude` / `coordinates` from any error-response payload before
  serialisation; the FR-019 logger never includes them in its line
  shape.
- The reverse-geocoding lookup MUST NOT block the save flow on
  failure (FR-006). The mobile client absorbs the error silently and
  lets the customer save with whatever street-name text they last
  left in the field.
- All three Phase 2 mobile screens MUST consume `t(key)` and `isRTL`;
  no hardcoded strings or `flexDirection: "row"` literals
  (Constitution Principle I, FR-017).
- The Google Maps API keys procured per implementation-plan D4c are
  stored only in `mobile/app.config.ts` (read from
  `process.env.GOOGLE_MAPS_API_KEY_IOS` and
  `process.env.GOOGLE_MAPS_API_KEY_ANDROID` at config-resolution
  time); each key is restricted to its respective iOS bundle ID or
  Android package name + SHA-1 fingerprint, never committed to the
  repo (R2).
- The `OrdersModule` shell shipped here MUST NOT add any controllers,
  request paths, or DTOs — only the single service method
  `hasActiveOrderForAddress`. Phase 6 owns the public surface.

**Scale/Scope**:

- One new backend module + one tiny shell module + four authenticated
  REST endpoints. Three new mobile screens + one new mobile component
  + one new mobile service module. The mobile i18n surface adds
  approximately 25 keys × two locales = ~50 new translation entries
  in `mobile/constants/i18n/{en,ar}.ts`. No new top-level folders.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

### Initial Gate (pre-research)

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | All three new mobile screens consume `t(key)` and `isRTL` from the Phase 1 `LanguageContext`. The map pin's accessibility label, every form label (Label, Street name, Save, Delete), the empty state, the delete confirmation, and the in-use-by-order refusal dialog are all keyed in both `mobile/constants/i18n/en.ts` and `mobile/constants/i18n/ar.ts`. SC-007 verifies 100% string localisation and end-to-end RTL on a real device. No hardcoded strings or directional literals introduced. |
| II | Server-Authoritative Trust Boundary | PASS | Every read/update/delete on `UserAddress` re-derives the owner from the verified JWT subject and refuses any request whose target row's `userId` differs from `req.user.sub` with a 404 response (FR-015, SC-006 — same shape as not-found, no identifier disclosure). The FR-013 in-flight-order check happens entirely on the backend via `OrdersService.hasActiveOrderForAddress`. Reverse-geocoding is the only client-side computation in this phase, and its result is purely a UX hint — the saved value (FR-008) is whatever text the customer last left in the field. |
| III | Modular Monolith with Strict Module Boundaries | PASS | One new module (`addresses`) and one minimal shell module (`orders`). `AddressesService` calls `OrdersService.hasActiveOrderForAddress` through its injected service interface; it never imports `prisma.order` directly. The `OrdersModule` shell is the canonical home for all Order reads from this point on. No domain logic in `common/`. The `HttpExceptionNormalizerFilter` extension lives in `common/errors/` (infrastructure, not domain). |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | Zero schema changes. Reads on `UserAddress` go through `prismaService.extended.userAddress.*`; deletes go through `prismaService.userAddress.softDelete({ where: { id } })` so the Phase 0 CI grep gate (`backend/scripts/ci-no-hard-delete.sh`) continues to pass. The `Order` read in `OrdersService.hasActiveOrderForAddress` is `prismaService.extended.order.findFirst({ where: { addressId, userId, status: { notIn: [DELIVERED, CANCELLED] } } })` — extended client, so any future soft-delete on `Order` is honoured automatically. FR-020 forbids new entities. |
| V | Design-System-First UI | PASS | All three mobile screens reference the `nafas-design-system` skill before composition. Phase 2 introduces a new `mobile/hooks/useColors.ts` hook that centralises the design-system palette tokens; every component consumes `useColors()` rather than embedding hex literals (the only hex constants in the new code paths live inside `useColors.ts` itself, which is the documented exception per Principle V — "no hex literals **in components**"). The map-picker screen layout follows the "address picker" mockup pattern; the list screen uses the standard list-row design. No hex literals in components, no one-off shadows. |
| VI | Auditable, Reversible Order Lifecycle | PASS | No order-state code ships in Phase 2. The `OrdersModule` shell does not write to `Order`; it reads a status set for the FR-013 check and returns a boolean. Schema slots remain untouched. |
| VII | Scope Discipline & Documented Non-Goals | PASS | Phase 2 explicitly excludes (per spec Assumptions): default-address concept, geographic restriction on saved coordinates, in-flight-edit protection, per-customer cap on saved addresses, and the address-selection sheet at checkout (Phase 5 wires it). The `building`, `floor`, `apartment`, and `notes` fields exist on the `UserAddress` schema and are accepted by the DTO as optional inputs (the schema offers them; not exposing them would be wasteful) but the spec's required minimum is label + street-name + lat/lng — Phase 2 does not promote any of the optional fields to required. |

**Initial gate verdict**: PASS — proceed to Phase 0 research.

### Post-Design Gate (after Phase 1 artifacts)

Re-evaluated after `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md` were produced.

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Bilingual & RTL by Default | PASS | `quickstart.md` exercises both English and Arabic on a real device; `research.md` R3 fixes the AddressPickerMap bilingual + RTL behaviour (the map itself is locale-neutral; only the pin's accessibility label, the form chrome, and the validation copy are translated). The contract spec (`contracts/addresses.openapi.yaml`) returns server-side error *codes* — error messages shown to the user are localised on the client per the precedent set by Phase 1. |
| II | Server-Authoritative Trust Boundary | PASS | The OpenAPI contract describes only the verbs and responses; no client-trusted computations leak through. The error-response normalisation rule (R6) is documented in `contracts/addresses.openapi.yaml`'s schema definitions: every error response references the same `Error` schema shape that Phase 1 published, with no `latitude`/`longitude` fields anywhere. |
| III | Modular Monolith with Strict Module Boundaries | PASS | `data-model.md` and the project tree show `modules/{addresses,orders}` with the boundary explicit: `AddressesService` declares its dependency on `OrdersService` via constructor injection. `OrdersService` exposes a single public method (`hasActiveOrderForAddress`) and contains no controllers in Phase 2. |
| IV | Schema-First, Soft-Delete-Always Data Layer | PASS | `data-model.md` confirms zero new entities. Every read against `UserAddress` documents the `prismaService.extended` path; every delete documents the `softDelete` path. The Phase 0 CI grep gate continues to enforce the soft-delete contract for any future code touching `UserAddress`. |
| V | Design-System-First UI | PASS | `quickstart.md` lists the three address screens and the design-system tokens each consumes; `research.md` R3 cross-references the `nafas-design-system` skill mockups. |
| VI | Auditable, Reversible Order Lifecycle | PASS | Non-applicable; no order-state code in this phase. |
| VII | Scope Discipline & Documented Non-Goals | PASS | The OpenAPI contract intentionally omits any default-address marker, any "select for checkout" verb (Phase 5 owns that), and any geographic-restriction validation. The `OrdersModule` shell carries one method only; Phase 6 will expand the surface. |

**Post-design gate verdict**: PASS — no Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/003-phase-2-addresses/
├── spec.md                          # Feature specification (with 2 clarifications)
├── plan.md                          # This file
├── research.md                      # Phase 0 output: technical decisions
├── data-model.md                    # Phase 1 output: UserAddress + Order usage map
├── quickstart.md                    # Phase 1 output: end-to-end addresses verification path
├── contracts/
│   └── addresses.openapi.yaml       # /addresses CRUD
├── checklists/
│   └── requirements.md              # Authored during /speckit-specify
└── tasks.md                         # Phase 2 output (NOT this command)
```

### Source Code (repository root, additions for Phase 2)

```text
nafas/
├── backend/
│   ├── src/
│   │   ├── app.module.ts                                # +AddressesModule,
│   │   │                                                # +OrdersModule (shell)
│   │   ├── modules/
│   │   │   ├── health/                                  # (Phase 0)
│   │   │   ├── auth/                                    # (Phase 1)
│   │   │   ├── users/                                   # (Phase 1)
│   │   │   ├── twilio/                                  # (Phase 1)
│   │   │   ├── addresses/                               # NEW
│   │   │   │   ├── addresses.module.ts
│   │   │   │   ├── addresses.controller.ts              # GET /addresses,
│   │   │   │   │                                        # POST /addresses,
│   │   │   │   │                                        # PATCH /addresses/:id,
│   │   │   │   │                                        # DELETE /addresses/:id
│   │   │   │   ├── addresses.service.ts                 # list, create, update,
│   │   │   │   │                                        # softDelete (with FR-013
│   │   │   │   │                                        # check via OrdersService)
│   │   │   │   └── dto/
│   │   │   │       ├── create-address.dto.ts
│   │   │   │       ├── update-address.dto.ts
│   │   │   │       └── address.response.dto.ts          # shared response shape
│   │   │   └── orders/                                  # NEW (shell only)
│   │   │       ├── orders.module.ts
│   │   │       └── orders.service.ts                    # hasActiveOrderForAddress
│   │   │                                                # (single method; Phase 6
│   │   │                                                # will expand)
│   │   ├── common/
│   │   │   ├── prisma/                                  # (Phase 0)
│   │   │   ├── admin-context/                           # (Phase 0)
│   │   │   ├── jobs/                                    # (Phase 0)
│   │   │   ├── decorators/                              # (Phase 1)
│   │   │   ├── guards/                                  # (Phase 1)
│   │   │   ├── logging/                                 # (Phase 1, sibling added)
│   │   │   │   ├── correlation-id.middleware.ts
│   │   │   │   ├── auth-event.logger.ts                 # (Phase 1, unchanged)
│   │   │   │   └── address-event.logger.ts              # NEW — sibling
│   │   │   │                                            # mirroring the Phase 1
│   │   │   │                                            # line shape; cleanup
│   │   │   │                                            # may merge later
│   │   │   └── errors/                                  # (Phase 1, extended)
│   │   │       └── http-exception.filter.ts             # +redacts latitude /
│   │   │                                                # longitude / coordinates
│   │   │                                                # from any error payload
│   │   │                                                # +emits FR-019
│   │   │                                                # address.* /
│   │   │                                                # {validation_rejected,
│   │   │                                                # not_found} for
│   │   │                                                # /api/v1/addresses/*
│   │   │                                                # (mirrors Phase 1's
│   │   │                                                # auth.password_validation
│   │   │                                                # / auth.rate_limit
│   │   │                                                # emission pattern)
│   │   └── ...
│   ├── test/                                            # +addresses.e2e-spec.ts
│   │                                                    # +http-redaction.spec.ts
│   ├── package.json                                     # No new deps
│   └── ...
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx                                  # (Phase 1)
│   │   ├── (auth)/                                      # (Phase 1)
│   │   ├── (tabs)/
│   │   │   └── profile/
│   │   │       ├── addresses.tsx                        # NEW (list)
│   │   │       └── addresses/
│   │   │           ├── new.tsx                          # NEW (add)
│   │   │           └── [id].tsx                         # NEW (edit)
│   ├── components/                                      # NEW folder
│   │   └── AddressPickerMap.tsx                         # NEW
│   ├── hooks/                                           # NEW folder
│   │   └── useColors.ts                                 # NEW — design-system
│   │                                                    # palette tokens (the
│   │                                                    # only place hex
│   │                                                    # constants live, per
│   │                                                    # Constitution V)
│   ├── context/                                         # (Phase 1)
│   ├── services/
│   │   └── addresses.ts                                 # NEW (list, create,
│   │                                                    # update, delete)
│   ├── constants/
│   │   └── i18n/
│   │       ├── en.ts                                    # +Phase 2 keys (~25)
│   │       └── ar.ts                                    # +Phase 2 keys (~25)
│   ├── app.config.ts                                    # +Google Maps key
│   │                                                    # restricted to bundle id /
│   │                                                    # package name (R2)
│   ├── package.json                                     # +expo-location
│   └── ...
├── admin/                                               # No Phase 2 changes
└── ...
```

**Structure Decision**: Same monorepo and three-workspace layout the
Foundation phase chose. Phase 2 fills two previously-empty backend
module folders (one full module, one shell), introduces three new
mobile screens under a new `(tabs)/profile/addresses/` route group,
one new mobile component folder (`mobile/components/`), and one new
mobile service module. No new top-level folders are introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be
> justified**

No violations. The Constitution Check both pre-research and post-design
returned PASS for all seven principles. Phase 2 introduces no new
schema entities (FR-020), no new raw-SQL exceptions, no new top-level
projects, and no deprecated APIs. The decision to ship a minimal
`OrdersModule` shell rather than have `AddressesService` import
`prisma.order` directly is the explicit Constitution Principle III
honour — *not* a violation; the shell is the canonical module for
order data and Phase 6 will expand its surface.
