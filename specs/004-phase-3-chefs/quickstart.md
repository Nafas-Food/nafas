# Phase 3 Quickstart

This is the end-to-end verification path for Phase 3. It exercises
every significant code path against a working Phase 2 baseline, in
roughly 25 minutes from a clean Phase 2 state. Running through it
closes the Phase 3 acceptance criteria — every success criterion in
`spec.md` is touched at least once.

The same path will live in the project `README.md` once Phase 3
lands; this document is the spec-side reference.

---

## Prerequisites (verify first)

These should already be installed and configured. They are not
counted against the Phase 3 verification budget.

- A working Phase 2 boot path: backend boots, Swagger lists the
  Phase 0 / Phase 1 / Phase 2 endpoints plus the Phase 3 endpoints
  documented in `contracts/*.openapi.yaml`. Mobile app boots into
  the welcome screen, the addresses surface from Phase 2 still
  works, the Phase 2 quickstart's signed-in-customer fixture is
  reachable.
- A real mobile device (iOS 15+ or Android API 24+) running the
  same Expo dev client built for Phase 2. The native
  `react-native-maps` module from Phase 2 covers the Phase 3
  chef-apply / chef-profile-editor map picker without a rebuild.
- The Phase 2 Google Maps API keys (`GOOGLE_MAPS_API_KEY_IOS` /
  `GOOGLE_MAPS_API_KEY_ANDROID` in `mobile/.env`) — no Phase 3
  procurement needed.
- **Firebase Cloud Messaging credentials**. Phase 3 is the first
  phase that calls FCM. Before Step 5 below:
  - A Firebase project linked to the Nafas Cloud Console.
  - A service-account JSON key downloaded and mounted into the
    backend dev container at `/run/secrets/firebase.json` (or set
    via `FIREBASE_SERVICE_ACCOUNT_KEY` env var with the JSON
    string).
  - The mobile dev client has Firebase enabled and is registered
    with a `fcmToken` against the Phase 1 `POST /users/me/fcm-token`
    endpoint. Without a token, push delivery silently fails (which
    is in spec — Notification row creation does not depend on
    push success per SC-004).
- An **admin user** in the test database. Phase 3 has no admin-
  registration endpoint; the admin user is seeded via
  `prisma/seed.ts` (Phase 13 deploy task) or for dev created
  manually with:

  ```bash
  cd backend
  npx prisma db execute --stdin <<SQL
  UPDATE users
     SET role = 'admin'
   WHERE phone = '+201112223344';
  SQL
  ```

  (Replace the phone with a customer you already registered via the
  Phase 1 flow. The admin signs in to the admin dashboard with that
  phone + password.)

---

## Step 1 — Apply the Phase 3 migration and seed categories (~30 s)

```bash
cd backend
npx prisma migrate dev --name 0003_chef_rejection_state
npx prisma db seed
```

**Expected**: `prisma migrate dev` reports two added columns
(`chefs.rejected_at`, `chefs.verified_at`), one new index
(`chefs_is_verified_latitude_longitude_idx`), and one new enum
value (`NotificationType.chef_revoked`). `db seed` reports eight
upserted Category rows (idempotent; running twice is a no-op).

Verify directly:

```bash
npx prisma studio
```

In the Categories table, confirm eight rows are present with both
`name.en` and `name.ar` populated, `displayOrder` 0..7.

---

## Step 2 — Boot the backend with Phase 3 modules (~30 s)

```bash
docker compose -f docker-compose.dev.yml up backend
```

**Expected**: backend logs show `ChefsModule`, `CategoriesModule`,
`StorageModule`, `NotificationsModule`, `AdminModule`, `MenusModule`
registered alongside the Phase 0 / 1 / 2 modules. The Swagger UI at
http://localhost:3000/api/v1/docs lists every Phase 3 endpoint
under the **Discovery**, **ChefApply**, **ChefProfile**,
**Categories**, and **AdminChefs** tags.

---

## Step 3 — User Story 1: customer applies to be a chef (~3 min; SC-001 budget)

(Customer is signed in to the mobile dev client — re-use the Phase 1
fixture.)

1. From the **Profile** tab, tap **Become a chef**. The
   `app/(auth)/chef-apply.tsx` flow opens at the **location step**.
   **Verify**: the map renders within 2 s and centres on the device's
   current location (location permission must be granted; if it's
   the first time, accept the prompt). Acceptance scenario 3 of
   User Story 1.
2. Pan the map so the fixed centre pin sits over your kitchen, then
   tap **Confirm Kitchen Location**. The flow advances to the
   **details step**.
3. Fill the form:
   - **Chef name**: "Umm Yara's Kitchen"
   - **Bio**: a one-sentence description
   - **Minimum order price**: 50 EGP (a positive Decimal)
4. Tap **Submit Application**. **Verify**: the screen pops to the
   `app/(auth)/pending-verification.tsx` holding screen, in Arabic
   if the in-app language was Arabic, English otherwise. User
   Story 1 acceptance scenario 1; SC-002 partial.
5. Force-close the Expo dev-client app. Reopen. Sign back in if
   prompted. **Verify**: the app routes the customer back to the
   pending-verification screen (the `RouteGuard` in
   `app/_layout.tsx` reads the user's `getMe()` response, sees a
   pending Chef row, and resolves the navigation accordingly).
   User Story 1 acceptance scenario 2; SC-002.

**Budget**: ≤ 3 minutes end-to-end (SC-001).

### Step 3 edge cases (~60 s)

1. **Apply again while pending**: from the holding screen, manually
   `POST /api/v1/chef/apply` via curl (the screen has no "retry"
   button — that's the point). **Verify**: response is
   `409 APPLICATION_PENDING { applicationId }`. FR-004.
2. **Apply with invalid input**: `POST /api/v1/chef/apply` with
   `minOrderPrice: -5`. **Verify**: `400 VALIDATION_ERROR`. The
   FR-038 log line `chef.apply / validation_rejected` is emitted
   without `latitude` or `longitude` in the line. User Story 1
   acceptance scenario 4; SC-019.

---

## Step 4 — User Story 2: admin verifies the application (~60 s; SC-003 budget)

1. On the host machine, boot the admin dev server:

   ```bash
   cd admin
   npm run dev
   ```

   Open http://localhost:4000.

2. Sign in with the admin user's phone + password via the admin
   sign-in page. NextAuth's Credentials provider posts to the
   backend `/auth/sign-in`, asserts `user.role === 'admin'`, and
   establishes a JWT session. A non-admin caller is rejected at
   this gate. Verify by attempting sign-in with a Phase 1
   customer account — sign-in is refused.
3. Land on `/dashboard`. Click **Chef Applications** in the sidebar.
   **Verify**: the pending applicant from Step 3 is listed, ordered
   oldest-first per FR-008. The row shows their full name, phone,
   chef name, bio, and a tiny map preview of their kitchen
   coordinates (the admin view is the only Phase 3 surface that
   exposes a chef's lat/lng — admin-only, FR-039 redaction does
   not apply here).
4. Click **Verify**. A confirmation dialog appears. Confirm.
   **Verify**: the row disappears from the queue, a toast confirms
   the action. SC-003.

### Confirm the verification side-effects (~30 s)

1. On the mobile dev client (still signed in as the applicant),
   background and re-foreground the app. **Verify**: the route
   guard observes the role transition (the next `getMe()` returns
   `role: 'chef'`) and routes the user to the **chef tab bar**
   (`app/(chef)/_layout.tsx`). User Story 2 acceptance scenario 3;
   SC-005.
2. Tap the **Profile** tab on the chef tab bar. **Verify**: the
   chef profile editor screen renders with the applicant's chef
   name, bio, kitchen coordinates (on the embedded map), and
   default logo / banner placeholders (the platform-controlled
   defaults from Phase 0.6). SC-011.
3. Tail the backend logs while the action runs. **Verify**: the
   FR-038 log line `chef.verify / success` is emitted with
   `actor.role: admin`, `target.chefId: <the applicant>`,
   `correlationId: <non-null>`, and **no kitchen lat/lng**. SC-019.

---

## Step 5 — Verification notification (push + record) (~60 s; SC-004 / SC-017)

1. On the same mobile dev client, **Verify**: a push notification
   was delivered (foreground toast or background banner) titled
   "You are now a Nafas chef" (English) or its Arabic counterpart
   if the in-app language was Arabic. The push payload carries
   `data.chefId` and the notification body renders in the device's
   in-app language without a server round-trip (FR-035 / SC-017).
2. Stop the backend, restart it, and on the admin dashboard verify
   a second pending applicant (set up via Step 3 with a different
   customer) — but this time, **delete the test FCM credentials**
   from the backend env before clicking Verify. **Verify**:
   - The verify action still succeeds (Notification row created,
     role flipped, chef visible on the public surface).
   - The backend log shows an FCM error from `notifications.service`
     wrapped in `try { ... } catch { logger.error(...) }`.
   - The chef DB row is in the verified state, the User row is in
     the chef role, and the Notification row exists. SC-004.
3. Restore the FCM credentials and restart the backend.

---

## Step 6 — User Story 3: customer discovers verified chefs (~3 min)

1. From a SECOND mobile dev client (or a second test customer
   account on the same device — sign out the applicant from Step 3
   first), tap the **Explore** tab. **Verify**: the discovery list
   on `app/(tabs)/explore.tsx` renders, the verified chef from
   Step 4 is present, isOpen = false (their default), the default
   logo placeholder renders for them. SC-011 + User Story 3
   acceptance scenario 1.
2. Have the applicant (sign in on the first dev client, now on the
   chef tab bar) toggle their kitchen open via the
   `PATCH /chef/availability` endpoint (the chef profile editor
   exposes the toggle). **Verify**: the discovery list on the
   second dev client (pull-to-refresh) now lists them with
   isOpen = true. User Story 4 acceptance scenario 1 + SC-009.
3. Seed seven additional verified chefs via the
   `discovery.e2e-spec.ts` fixture (`seedManyChefs(7)`) — see the
   backend `test/discovery.e2e-spec.ts`. They are placed at
   varying distances from a known Cairo centre (30.0444, 31.2357).
   Re-run the explore tab on the second dev client. **Verify**:
   - Toggle the category filter chip ("Koshary"); the list filters
     to chefs whose menus include that category (the test seeds
     `seedMenu(chef, category)` so the FR-014 check exercises a
     real menu read through `menus.service.hasMenuInCategory`).
   - Type "Umm" into the search box; the list filters to the chefs
     whose chefName / bio matches.
   - Set the location to the test centre; the list re-orders by
     distance ascending. The default radius (15 km) excludes chefs
     seeded further out; explicit `radiusKm=50` re-includes them.
   SC-007.
4. Tap a chef row to open `app/chef/[id].tsx`. **Verify**: the
   public profile renders chef name, banner, logo, bio, current
   rating (0.00 — Phase 7 fills this), totalReviews (0), open /
   closed state, and category chips. The `categoryIds` array is
   populated from `menus.service.categoriesForChef(chefId)`. User
   Story 3 acceptance scenario 6.
5. Run:

   ```bash
   cd backend
   npm run test:e2e -- discovery.e2e-spec
   ```

   **Verify**: every Haversine / category / search / open-first /
   verified-newest-first / pagination assertion passes. SC-007 /
   SC-008.

---

## Step 7 — User Story 4: chef manages their public profile (~3 min)

1. Back on the first dev client (signed in as the chef), tap the
   chef **Profile** tab. **Verify**: the screen renders the
   editor against the design-system "chef profile self-edit"
   mockup.
2. Toggle the kitchen open / closed via the chip at the top.
   **Verify**: each toggle reflects on the second dev client's
   discovery list after a pull-to-refresh. SC-009.
3. Edit the bio. Save. **Verify**: the new bio is visible on the
   public profile from the second dev client after a refresh.
4. Tap **Replace Logo**. The `expo-image-picker` flow opens.
   Pick a JPEG ≤ 5 MB. **Verify**: the upload completes, the new
   logo renders on the chef's editor and on the public profile /
   discovery card. SC-010.
5. Tap **Replace Logo** again. Pick a 6 MB JPEG (use the test
   fixture under `backend/test/fixtures/oversize.jpg`).
   **Verify**: the upload is refused with
   `413 PAYLOAD_TOO_LARGE`; the chef's existing logo is
   unchanged. The FR-038 line `chef.logo_upload /
   payload_too_large` is emitted.
6. Tap **Replace Logo** again. Pick an SVG file. **Verify**: the
   upload is refused with `415 UNSUPPORTED_MEDIA_TYPE`; chef's
   existing logo unchanged. R8 / FR-022.
7. From a non-chef test account, attempt
   `PATCH /api/v1/chef/profile` via curl with a valid body.
   **Verify**: refused with `403 FORBIDDEN_ROLE`. SC-012 /
   FR-024.

---

## Step 8 — User Story 5: admin curates categories (~2 min)

1. From the admin dashboard, navigate to **Categories**. **Verify**:
   the eight seeded categories are listed in display order, each
   with both EN and AR display names. SC-013.
2. Drag "Sweets" above "Hawawshi" using the dnd-kit handle. Save.
   **Verify**: the reorder is committed atomically (one
   transaction). The customer-side discovery surface, after a
   refresh, renders category chips in the new order. SC-014.
3. Add a new category ("Grills" / "مشويات", icon `meat`). Save.
   **Verify**: the new row appears in the list and on the
   customer-facing category chips after the 60-second cache
   invalidates (R7) — the service's mutation paths invalidate the
   cache immediately, so a refresh of the customer surface picks
   it up.
4. Soft-delete "Other". **Verify**: it disappears from the
   customer-facing list immediately. FR-029.
5. From a non-admin test account, attempt
   `POST /api/v1/admin/categories` via curl. **Verify**: refused
   with `403 FORBIDDEN_ROLE`. SC-015.
6. Test atomic reorder failure:

   ```bash
   cd backend
   npm run test:e2e -- categories.e2e-spec --testNamePattern="atomic reorder"
   ```

   **Verify**: a forced mid-reorder failure leaves the customer-
   facing list in the fully-old order; SC-014.

---

## Step 9 — User Story 6: bilingual + RTL parity (~3 min)

1. On the mobile dev client (chef session), tap **Profile →
   Language**, switch to Arabic.
2. Walk through every Phase 3 customer-facing mobile surface:
   chef-apply (sign out + register a new test customer first so
   this is reachable), pending-verification, explore (chef
   discovery), chef profile detail, chef profile editor, kitchen
   toggle, image upload dialog, every validation error, every
   in-app notification render. **Verify**: every visible string
   is Arabic with right-to-left layout. SC-016.
3. Toggle back to English. Re-enter each surface. **Verify**:
   every visible string is English with left-to-right layout, no
   app restart required.

---

## Step 10 — Admin revocation + cooldown (~3 min)

1. From the admin dashboard, navigate to **Chefs**. **Verify**: the
   verified chef from Step 4 is listed.
2. Click **Revoke** on their row. A confirmation dialog appears.
   Enter a reason ("Test revocation — please re-apply").
   Confirm. **Verify**:
   - The chef row disappears from the customer-side discovery
     surface after a refresh (`deletedAt` is set).
   - On the affected mobile dev client (was on the chef tab bar),
     after a background-foreground cycle, the route guard lands
     the user back on the **customer tab bar** (FR-030).
   - A `chef_revoked` push notification arrives (best-effort).
3. From the affected user, attempt
   `POST /api/v1/chef/apply` immediately. **Verify**: refused
   with `409 APPLICATION_COOLDOWN_IN_EFFECT { earliestResubmitAt }`.
   FR-012b.
4. Run the cooldown-fast-forward test (sets the
   `Chef.deletedAt` directly via the test prisma client to
   25 hours ago) and retry. **Verify**: a fresh pending
   application is captured; the old `Chef` row is updated in
   place with `deletedAt=null`, `isVerified=false`, new fields.

---

## Step 11 — Concurrent verification race (~30 s)

```bash
cd backend
npm run test:e2e -- concurrency-verify.e2e-spec
```

**Verify**: two admin sessions race-verify the same pending
application. Exactly one receives `200 OK`; the other receives
`409 APPLICATION_NOT_PENDING`. The chef row is verified once;
exactly one Notification row exists; the User role is `chef`
exactly once. FR-012 / SC-006.

---

## Step 12 — Backend security and observability sweep (~3 min)

```bash
cd backend
npm run test:e2e -- chefs.e2e-spec
npm run test:e2e -- admin-chefs.e2e-spec
npm run test:e2e -- categories.e2e-spec
npm run test:e2e -- http-redaction.e2e-spec
```

**Verify** all suites pass. Specific cases asserted:

- **SC-006 / FR-011** — every admin endpoint refuses a non-admin
  caller with `403 FORBIDDEN_ROLE`. The non-admin's request body
  never alters server state.
- **SC-008** — discovery list never returns a pending / rejected /
  soft-deleted chef.
- **SC-012** — `PATCH /chef/profile` against a chef row not owned
  by the authenticated caller returns `404 CHEF_NOT_FOUND` —
  same shape as a genuinely missing chef.
- **SC-015** — every admin-categories endpoint refuses non-admin.
- **SC-018** — every body-accepting endpoint refuses an extra
  undocumented field with `400 VALIDATION_ERROR`.
- **SC-019** — every FR-038 event line is asserted absent of any
  `latitude` / `longitude` / `coordinates` value (string scan).
- **SC-020** — every error response body is asserted absent of
  coordinates.
- **http-redaction.e2e-spec.ts** is extended to cover the chef
  paths in addition to the Phase 2 address paths.

Tail the backend logs while running through Steps 3 – 10 manually
on the device. **Verify** the FR-038 lines emit one per event,
each carrying a non-null `correlationId` and `actor.role`, and
none carrying coordinates.

---

## Done criteria

Phase 3 is complete when:

- [ ] Steps 1 – 12 above all pass on a real device against a real
      Supabase project.
- [ ] The Phase 0 CI grep gate (`backend/scripts/ci-no-hard-delete.sh`)
      remains green — no `prisma.chef.delete` or
      `prisma.category.delete` call shipped.
- [ ] `npx prisma migrate status` shows no schema drift after
      `0003_chef_rejection_state`.
- [ ] The Phase 3 i18n keys are present in *both*
      `mobile/constants/i18n/en.ts` and
      `mobile/constants/i18n/ar.ts`; a missing-key check across
      locales reports zero asymmetric keys.
- [ ] The Swagger UI at `/api/v1/docs` documents every new endpoint
      with request / response schemas, bearer auth, and the role
      requirement.
- [ ] No new `$queryRaw` calls have been introduced (`grep`
      confirms the only `$queryRaw` in the codebase remains the
      Phase 0 health probe).
- [ ] The admin web `/dashboard/chef-applications`,
      `/dashboard/categories`, and `/dashboard/chefs` pages
      function end-to-end against a real backend.
