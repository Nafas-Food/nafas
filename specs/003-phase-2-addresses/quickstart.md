# Phase 2 Quickstart

This is the end-to-end verification path for Phase 2. It exercises
every significant code path on a real device against a working
Phase 1 baseline, in roughly 10 minutes from a clean Phase 1 state.
Running through it is what closes the Phase 2 acceptance criteria —
every success criterion in `spec.md` is touched at least once.

The same path will live in the project `README.md` once Phase 2
lands; this document is the spec-side reference.

---

## Prerequisites (verify first)

These should already be installed and configured. They are not
counted against the Phase 2 verification budget.

- A working Phase 1 boot path: backend boots, Swagger lists the ten
  Phase 1 endpoints + the four new Phase 2 endpoints, mobile app
  boots into the welcome screen, the Phase 1 quickstart's
  registered-customer fixture is reachable.
- A real mobile device (iOS 15+ or Android API 24+) running an Expo
  dev client (the JS bundle alone is not enough — `react-native-maps`
  is a native module). On Android, the device's Google Play Services
  must be up to date so the native geocoder is available.
- A Google Cloud project with the **Maps SDK for iOS** and **Maps
  SDK for Android** enabled, and one API key per platform restricted
  to the Nafas iOS bundle ID and Android package name + SHA-1 (see
  research R2). The keys are present in `mobile/.env` as
  `GOOGLE_MAPS_API_KEY_IOS` and `GOOGLE_MAPS_API_KEY_ANDROID`. No
  Geocoding API enablement is required (research R1 — the platform
  uses `expo-location.reverseGeocodeAsync`, the device's native
  geocoder).
- A signed-in customer session on the mobile device, reachable from
  the Phase 1 quickstart. The customer's tab bar shows a Profile
  tab, and the Profile screen has an "Addresses" link (Phase 2's
  first new entry point).

---

## Step 1 — Boot the backend with Phase 2 env (~30 s)

```bash
docker compose -f docker-compose.dev.yml up backend
```

**Expected**: backend logs show `AddressesModule` and `OrdersModule`
registered alongside the Phase 1 modules. The Swagger UI at
http://localhost:3000/api/v1/docs lists the four new Phase 2
endpoints (`GET /addresses`, `POST /addresses`,
`PATCH /addresses/:id`, `DELETE /addresses/:id`) under an
**Addresses** tag. The Phase 0 daily cleanup job announces itself in
the logs (no rows yet pruned from `UserAddress`).

---

## Step 2 — Boot the Expo dev client (~30 s)

```bash
cd mobile
npx expo start --dev-client
```

Open the dev-client app on the device and connect to the host. The
app boots into the welcome screen (no session) or the customer home
screen (signed-in session restored from Phase 1). Confirm the
**Profile → Addresses** entry point is visible.

---

## Step 3 — User Story 1: add the first address via map drag (~90 s; budget per SC-001 is 60 s)

(Customer is signed in; the addresses screen is empty.)

1. Tap **Profile → Addresses**. **Verify**: empty-state copy is
   visible, the "add address" CTA is prominent, and (in Arabic
   mode) the layout is right-to-left (User Story 1 acceptance
   scenario 1; SC-007 partial).
2. Tap **Add address**. The map renders within 2 s. **Verify**:
   the map centres on the device's current location (location
   permission must be granted; if it is the first time, accept the
   prompt). User Story 1 acceptance scenario 5; FR-007.
3. Pan the map so the fixed centre pin sits over a chosen building.
   **Verify**: within ~2 s of the pan settling, the street-name
   field auto-populates with the reverse-geocoder's result. User
   Story 1 acceptance scenario 2; SC-003.
4. Type "home" into the **Label** field.
5. Tap **Save**. **Verify**: the screen pops back to the addresses
   list, and the new address appears at the top of the list with
   label "home" and the typed street-name text. User Story 1
   acceptance scenario 3.
6. Force-close the Expo dev-client app. Reopen. Sign back in if
   prompted. Tap **Profile → Addresses**. **Verify**: the same
   address appears, unchanged. SC-002.

**Budget**: ≤ 60 s end-to-end (SC-001). Steps 1, 2, 3 are the
budget; the persistence verification (steps 4–6) is independent.

---

## Step 4 — User Story 1 edge cases: geocoding failure and permission denial (~90 s)

1. **Geocoding failure**: Disable the device's data connection
   (airplane mode), open **Add address**, drag the pin. **Verify**:
   the street-name field stays as the customer last left it;
   no error toast or modal appears; the **Save** button remains
   enabled (FR-006, edge case "Reverse-geocoding lookup fails").
   Re-enable the data connection.
2. **Permission denial**: In device settings, revoke the Nafas app's
   "Location" permission. Re-open **Add address**. **Verify**: the
   map opens centred on Cairo (R3 default), the customer can drop a
   pin manually, and the **Save** button is enabled (FR-007,
   User Story 1 acceptance scenario 6, SC-010). Re-grant the
   permission afterwards.

---

## Step 5 — User Story 2: edit and delete (~60 s)

(Customer has at least two saved addresses — add a second one if
needed via Step 3.)

1. From the addresses list, tap the second address. **Verify**: the
   edit screen opens with the map centred on the saved pin and the
   form pre-populated with the saved label and street-name (User
   Story 2 acceptance scenario 2).
2. Drag the pin to a nearby spot, change the label to "work", tap
   **Save**. **Verify**: the list reflects the new label and the
   new pin position (User Story 2 acceptance scenario 3; SC-004).
3. Tap **Delete** on the first address (the one not referenced by
   any orders — Phase 2 has none yet). **Verify**: the delete
   confirmation dialog appears, the customer confirms, the address
   disappears from the list (User Story 2 acceptance scenario 4).
4. Force-close, reopen, navigate to the addresses list. **Verify**:
   the deletion persisted (SC-004 + soft-delete read filter SC-009
   in the affirmative case).

---

## Step 6 — User Story 3: delete refused by in-flight order (~60 s)

Phase 6 has not landed; the FR-013 test fixture stands in for the
Phase 6 placement flow.

1. On the host machine, with the test database connection from
   `backend/.env.test`:

   ```bash
   cd backend
   npm run test:e2e -- addresses.e2e-spec --testNamePattern="in-flight order"
   ```

   **Verify**: the test passes. It seeds an `Order` row with
   `status: PENDING` and `addressId` matching one of the
   customer's addresses, then attempts a delete via the public API
   and asserts the response is `409 ADDRESS_IN_USE` carrying an
   `activeOrderId` (User Story 3 acceptance scenario 1; SC-005).
   The test then flips the order to `status: DELIVERED`, retries
   the delete, and asserts `204 No Content` (User Story 3
   acceptance scenario 2). User Story 3 acceptance scenario 3 is
   verified on-device manually only when Phase 6 has landed.

---

## Step 7 — User Story 4: bilingual + RTL parity (~60 s)

1. Open **Profile → Settings → Language**, switch to Arabic.
2. Re-enter the addresses surface. **Verify** every visible string
   on the **list**, **add**, **edit**, **delete confirmation**, and
   the **in-use refusal dialog** (use the still-mounted Step 6
   fixture or trigger a refusal manually) is in Arabic and the
   layout direction is right-to-left (User Story 4 acceptance
   scenarios 1–3; SC-007).
3. Trigger a validation error: open **Add address**, leave the
   label empty, tap **Save**. **Verify** the error message is in
   Arabic (User Story 4 acceptance scenario 3).
4. Switch back to English. Re-enter the surfaces. **Verify** every
   visible string flips to English with left-to-right layout, no
   app restart required (User Story 4 acceptance scenario 2).

---

## Step 8 — Backend security and observability sweep (~60 s)

This step exercises the success criteria that are most cleanly
tested in-process.

1. From the host:

   ```bash
   cd backend
   npm run test:e2e -- addresses.e2e-spec
   npm run test -- http-redaction.spec
   ```

   **Verify** all tests pass. Specific cases asserted by these
   suites:

   - **SC-006 / R4** — `GET /addresses/:id` and friends with an
     address ID that exists but is owned by a different test
     customer return `404 ADDRESS_NOT_FOUND` (same shape as a
     genuinely missing ID).
   - **SC-008** — `POST /addresses` with an extra `userId` field is
     refused with `400 VALIDATION_ERROR`.
   - **SC-009** — a soft-deleted address ID, fetched via the bare
     Prisma client to confirm the row exists, returns
     `404 ADDRESS_NOT_FOUND` to a `PATCH` and a `DELETE` (the
     extension's read filter is exercised).
   - **SC-011** — log lines for create / update / delete events
     match the `address.* / {success | …}` shape, carry
     `correlationId`, and never carry `latitude`, `longitude`, or
     any coordinate-derived value (asserted by string scan).
   - **SC-012** — a `POST /addresses` with `latitude: 999`
     (out-of-range) triggers a `VALIDATION_ERROR` whose response
     body is asserted to contain neither `latitude` nor `longitude`
     anywhere.
   - **R6 redaction filter** — a synthetic exception thrown with a
     payload `{ latitude, longitude, message: "…" }` is normalised
     to a body with neither field.

2. Tail the backend logs while running through Steps 3–6 manually
   on the device. **Verify** the FR-019 lines emit, one per event,
   each carrying a non-null `correlationId`, and none carrying
   coordinates.

---

## Done criteria

Phase 2 is complete when:

- [ ] Steps 1–8 above all pass on a real device against a real
      Supabase project.
- [ ] The Phase 0 CI grep gate (`backend/scripts/ci-no-hard-delete.sh`)
      remains green — no `prisma.userAddress.delete` call shipped.
- [ ] `npx prisma migrate status` shows no schema drift.
- [ ] The Phase 2 i18n keys are present in *both*
      `mobile/constants/i18n/en.ts` and
      `mobile/constants/i18n/ar.ts`; a missing-key check across
      locales reports zero asymmetric keys.
- [ ] The Swagger UI at `/api/v1/docs` documents the four new
      endpoints with the request/response schemas and the bearer
      auth requirement.
- [ ] `mobile/app.config.ts` reads the Google Maps keys from
      environment variables; no key string is committed.
