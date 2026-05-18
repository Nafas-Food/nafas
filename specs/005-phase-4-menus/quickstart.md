# Phase 4 Quickstart

End-to-end verification path for Phase 4. Exercises every significant
code path against a working Phase 3 baseline in roughly 30 minutes
from a clean state. Running through it closes the Phase 4 acceptance
criteria — every success criterion in `spec.md` is touched at least
once.

The same path will live in the project `README.md` once Phase 4
lands; this document is the spec-side reference.

---

## Prerequisites (verify first)

These should already be installed and configured. They are not
counted against the Phase 4 verification budget.

- A working Phase 3 boot path: backend boots, Swagger lists the
  Phase 0 / 1 / 2 / 3 endpoints plus the new Phase 4 endpoints
  documented in `contracts/*.openapi.yaml`. Mobile app boots into
  the welcome screen; sign-in lands a customer on the customer tab
  bar (`(tabs)`) and a verified chef on the chef tab bar
  (`(chef)`). Admin dashboard from Phase 3 still works for category
  curation and chef verification (no Phase 4 admin changes).
- A real mobile device (iOS 15+ or Android API 24+) running the
  same Expo dev client built for Phase 3. No new native modules,
  no rebuild required.
- The Phase 3 verified-chef fixture is reachable — sign in as a
  chef whose Phase 3 application was approved. (If you don't have
  one, run Phase 3 quickstart Steps 3 – 5 to create one.)
- A second test customer account signed in on a second device (or
  the same device after sign-out) for the customer-side reads in
  Steps 5 – 7.
- The Supabase `item-images` bucket exists (Phase 0.6 created it
  alongside `chef-logos` / `chef-banners`). Verify in the Supabase
  console.

---

## Step 1 — Apply the Phase 4 migration (~15 s)

```bash
cd backend
npx prisma migrate dev --name 0004_item_active_displayorder_indexes
```

**Expected**: `prisma migrate dev` reports three new indexes
(`items_menu_id_is_active_deleted_at_idx`,
`items_menu_id_display_order_idx`,
`menus_chef_id_display_order_idx`) and zero column changes. Confirm
no schema drift:

```bash
npx prisma migrate status
```

**Expected**: "Database schema is up to date."

---

## Step 2 — Boot the backend with Phase 4 modules (~30 s)

```bash
docker compose -f docker-compose.dev.yml up backend
```

**Expected**: backend logs show `ItemsModule` and `HomeModule`
registered for the first time, alongside the now-promoted
`MenusModule` (which Phase 3 imported as a shell). The Swagger UI
at http://localhost:3000/api/v1/docs lists every Phase 4 endpoint
under the **ChefMenus**, **MenuAvailability**, **ChefItems**,
**ChefItemImages**, **PublicChefProfile** (extended), and **Home**
tags.

Sanity-check the today-availability helper:

```bash
docker exec -it nafas_backend node -e "
const { todaysCairoWeekday } = require('./dist/modules/menus/today-cairo');
console.log('Cairo weekday now:', todaysCairoWeekday());
"
```

**Expected**: integer in `[0, 6]` matching the current Cairo
weekday (0 = Sunday).

---

## Step 3 — User Story 1: chef creates a menu (~60 s; SC-001 budget)

(Signed in as a verified chef on the mobile dev client. The chef
tab bar's **Menu** tab opens `app/(chef)/menu.tsx`, which Phase 4
fills in.)

1. Tap **Create Menu** (top-right action on the empty browse
   list). The `MenuEditorSheet` modal opens.
2. Fill the form:
   - **Name (English)**: "Sunday Koshary"
   - **Name (Arabic)**: "كشري الأحد"
   - **Category**: pick "Koshary" from the chip selector
     (populated from the Phase 3 `GET /categories` endpoint).
   - **Availability**: tap **Specific days**, then toggle the
     `DayOfWeekPicker` to include Sunday + Wednesday.
3. Tap **Create**. **Verify**: the modal closes, the menu appears
   in the chef's browse list with the two day chips visible.
   SC-001.
4. Force-close the Expo dev-client app, reopen, sign back in if
   prompted, tap **Menu**. **Verify**: the menu persists.
5. Tap the menu's overflow → **Edit**. Toggle **Available every
   day**. Save. **Verify**: the day chips collapse to a single
   "Every day" badge; the menu remains in the chef's browse list.

### Step 3 edge cases (~60 s)

1. **Empty name (Arabic)**: Open the editor, leave the Arabic
   name blank, submit. **Verify**: refused with the
   `MENU_NAME_REQUIRED` code mapped to a clear in-app-language
   message; the menu is not created.
2. **Name over 60 chars (English)**: try `'x'.repeat(61)`.
   **Verify**: refused with `MENU_NAME_TOO_LONG`. The Arabic side
   is untouched. SC-007c.
3. **Stale category**: ask an admin to soft-delete a category,
   then attempt to create a menu referencing the deleted
   category's UUID via the API directly. **Verify**: refused with
   `CATEGORY_NOT_FOUND`.

---

## Step 4 — User Story 2: chef adds items (~3 min; SC-004 budget)

1. Open the **Sunday Koshary** menu. Tap **Add Item**. The
   `ItemEditorSheet` modal opens.
2. Fill the form:
   - **Name (English)**: "Classic Koshary"
   - **Name (Arabic)**: "كشري كلاسيك"
   - **Description (English)**: short paragraph (≤ 500 chars)
   - **Description (Arabic)**: parallel text
   - **Price**: 60.00
   - **Discount**: tap **Fixed**, value 5.00
   - **Stock**: leave **Unlimited** toggle ON
3. Tap **Create Item**. **Verify**: the item appears in the menu's
   item list. The base price is shown struck-through ("60.00")
   beside the effective price ("55.00"). The stock badge reads
   "Unlimited". SC-005 / SC-007c.
4. Tap the item → **Add Images**. The `ItemImagesDialog` opens.
   - Pick one JPEG from the camera roll (≤ 3 MB). **Verify**: the
     image uploads, the item card's image carousel now shows it.
   - Pick a 4 MB JPEG. **Verify**: refused with
     `PAYLOAD_TOO_LARGE`; the existing image is unchanged. SC-007.
   - Pick an SVG file. **Verify**: refused with
     `UNSUPPORTED_MEDIA_TYPE`. SC-007.
   - Pick four more valid images. **Verify**: the 5th upload
     succeeds (5 total now). Pick a 6th. **Verify**: refused with
     `ITEM_IMAGES_FULL`. SC-007.
5. Tap one of the five images → **Remove**. **Verify**: the array
   shrinks to 4 in stored order; the storage object is
   asynchronously deleted (check the Supabase console to confirm).
   Tap **Remove** again on the same (now-gone) image via curl
   (using the stored key). **Verify**: idempotent — HTTP 204, no
   error. SC-007a.
6. Toggle the "Unlimited" stock to OFF and enter `5`. Save.
   **Verify**: the item card's stock badge updates to "5 left".
   Decrement past zero via direct DB write (no Phase 4 endpoint
   for this — Phase 6 handles real decrement; the test fixture
   `prisma.item.update({ data: { quantity: 0 } })` is fine). Refresh
   the customer surface (Step 5 below) — the item card renders
   "Out of stock" instead of a price.

### Step 4 edge cases (~60 s)

1. **Negative effective price (fixed)**: Set price 30.00 and
   `discountValue` 35.00 (fixed). Submit. **Verify**: refused with
   `ITEM_NEGATIVE_EFFECTIVE_PRICE`. SC-006.
2. **Negative effective price (percent)**: Set `discountValue` 110
   (percent). **Verify**: refused with the same code. SC-006.
3. **Zero effective price**: Set price 60, `discountValue` 100
   (percent). **Verify**: ACCEPTED; the customer surface shows
   effective price `"0.00"` alongside `"60.00"` struck through.
   SC-006 corollary.
4. **Stock ambiguous**: send `{ "stock": { "isUnlimitedStock":
   true, "quantity": 5 } }` via curl. **Verify**: refused with
   `ITEM_STOCK_AMBIGUOUS`.
5. **Cross-chef item mutation**: as Chef A, copy Chef B's item
   ID from a known fixture and `PATCH /chef/items/:id` via curl.
   **Verify**: refused with `404 ITEM_NOT_FOUND` — same shape as
   a genuinely missing item. SC-014.

---

## Step 5 — User Story 3: customer reads chef profile (today-available filter) (~3 min)

(Sign in as a second test customer on a second device, OR sign out
the chef and sign in as a customer on the same device.)

1. Land on Home. Tap a chef whose name you recognize from the
   discovery list, OR open the chef's profile by deep link if you
   have one. Better: ask the chef from Step 3 to share their
   `chefId`.
2. **Verify**: the chef's header renders unchanged (Phase 3
   contract). Below it, the **Sunday Koshary** menu section
   appears IF AND ONLY IF today is Sunday (Cairo wall clock).
   The item list inside the section includes the "Classic
   Koshary" item created in Step 4 with effective price `"55.00"`
   struck through `"60.00"`. SC-008.
3. From the backend container, manually pin a different weekday
   via the `pinCairoWeekday(weekday)` test helper while the
   server is running (the fixture exposes a dev-only POST
   endpoint behind `NODE_ENV !== 'production'` that overrides
   the helper for one request). Re-read the chef profile.
   **Verify**: the Sunday menu section appears only when the
   pinned weekday is 0 (Sunday) or 3 (Wednesday).
4. Have the chef create a second menu with **Available every
   day** toggled on, then add one active item. **Verify**: the
   second menu's section appears in the customer's profile read
   regardless of which weekday is pinned. SC-003.
5. Have the chef toggle the Classic Koshary item to inactive.
   **Verify**: the item disappears from the customer's profile
   on next read; the Sunday menu section either still renders
   (if other active items exist) or collapses to the "no items
   available right now" empty state (FR-019).
6. Have the chef soft-delete the entire Sunday menu. **Verify**:
   the menu section vanishes from the customer profile entirely;
   the "every day" menu section still renders. SC-013.
7. Ask the admin to soft-delete the verified chef (Phase 3
   revoke flow). **Verify**: the customer's chef-profile read
   returns `404 CHEF_NOT_FOUND` — identical shape to a genuinely
   missing chef. SC-009.
8. Have the admin re-verify the chef (or use a fresh chef for
   this step). Confirm the chef profile is readable again.

---

## Step 6 — User Story 4: customer Home + Explore (~3 min)

1. **Home**: Sign in as a customer; land on `app/(tabs)/index.tsx`.
   **Verify**: a personalised greeting renders in the customer's
   in-app language; an open-chefs horizontal scroll renders below
   it; a category chip ribbon renders below that (the eight
   Phase 3 seeded categories); a top-rated grid renders at the
   bottom (until Phase 7 ships reviews, every chef has rating 0
   so the grid orders by verified-newest-first, which still
   renders). SC-010.
2. Tap any chef tile in the open-chefs scroll. **Verify**: the
   chef's public profile opens (per Step 5).
3. Tap a category chip ("Koshary"). **Verify**: the Explore tab
   opens with the Koshary filter pre-applied; the results list
   shows chefs whose menus include a Koshary menu. SC-011.
4. **Explore search debounce**: in the Explore search box, type
   "k-o-s-h-a-r-y" quickly. **Verify**: the network panel (Expo
   dev menu → **Inspect Network**) shows at most ONE in-flight
   discovery request — earlier in-flight requests are
   `AbortController`-aborted as faster keystrokes arrive. The
   final rendered list matches the final typed query. SC-012.
5. **Explore filter cancellation**: type "kosh" quickly, then
   immediately tap a different category chip mid-type.
   **Verify**: any in-flight search request is aborted; the
   results reflect the new category filter, not a late-arriving
   search response. SC-012.
6. Have the admin revoke the only chef in a particular category
   (Phase 3 revoke flow). **Verify**: when the customer re-enters
   Explore with that category pre-applied, the result list is
   empty with a clear empty-state message rather than stale data.

---

## Step 7 — User Story 5: chef maintains catalogue (bulk reorder + soft-delete) (~3 min)

1. As the chef, on the menu browse list, **long-press** a menu
   row to enter "reorder mode". Drag the second menu above the
   first. Tap **Save Order**.
2. **Verify**: the chef's browse list re-renders in the new
   order. From a second customer device, refresh the chef's
   public profile. **Verify**: the menu sections render in the
   new order. SC-007d.
3. Inside one menu, enter the same reorder mode for items, drag
   one item up, save. **Verify**: same outcome on the customer
   side.
4. **Reorder refusal**: via curl, submit a reorder request with
   one of the chef's menu IDs omitted. **Verify**: refused with
   `MENUS_REORDER_NOT_EXACT_SET`; the previously-stored order is
   unchanged. Repeat with an unknown UUID. **Verify**: same code.
   Repeat with a duplicate UUID. **Verify**: same code. SC-007d.
5. **Reorder atomicity**: run the integration test
   `npm run test:e2e -- chef-bulk-reorder.e2e-spec` which uses a
   transaction-failure injector. **Verify**: a forced mid-
   transaction failure leaves the collection at its prior
   `displayOrder` — no partial reorder is observable. SC-007d.
6. Soft-delete a menu via the **Delete** action on a menu row.
   **Verify**: the menu vanishes from the chef's browse list
   AND the customer's profile read. The chef has no way to
   resurrect it via the Phase 4 surface (by design).

---

## Step 8 — User Story 6: bilingual + RTL parity (~3 min)

1. On the mobile dev client (chef session), tap **Profile →
   Language**, switch to Arabic.
2. Walk through every Phase 4 chef-facing surface:
   - Menu browse list (empty state if you soft-deleted everything,
     otherwise list with menu cards).
   - Menu create modal (`MenuEditorSheet`), including the
     `DayOfWeekPicker`.
   - Item create modal (`ItemEditorSheet`), including the
     stock toggle and discount unit picker.
   - Image upload dialog (`ItemImagesDialog`).
   - Every validation error message (re-trigger the Step 3 /
     Step 4 edge cases).
   - The chef's "no items yet" empty state.
3. **Verify**: every visible string is Arabic with right-to-left
   layout. The chip ribbon's items right-align, the input fields
   right-align, the buttons mirror appropriately. SC-016.
4. Toggle back to English. Re-enter each surface. **Verify**:
   every visible string is English with left-to-right layout, no
   app restart required.
5. Sign in as the customer (second device) in Arabic. Walk
   through Home, Explore, a chef profile (with at least one
   discounted item and one out-of-stock item). **Verify**: every
   visible string is Arabic with right-to-left layout. SC-015.

---

## Step 9 — Image upload throttle saturation (~1 min; SC-007b)

```bash
cd backend
npm run test:e2e -- items-throttle.e2e-spec
```

**Verify**: the test seeds a fresh chef + item, then issues 25
successive valid image uploads as that chef within a 60-second
window. After each upload when `item.images.length === 5`, the
test calls `removeImage` to free a slot, ensuring the per-item
5-image cap (`ITEM_IMAGES_FULL`) is never hit. Exactly the first
20 uploads succeed (HTTP 201). Uploads 21 – 25 refuse with HTTP
429 / `ITEM_UPLOAD_RATE_LIMITED`. Refused uploads consume no
image storage (the Supabase bucket count is unchanged across the
refused calls). SC-007b.

Also verify the FR-032 log stream:

```bash
docker compose -f docker-compose.dev.yml logs backend | grep item.image_upload
```

**Verify**: exactly 25 log lines for `item.image_upload` —
20 with `outcome: success`, 5 with `outcome: rate_limited`. None
of the lines contain `latitude`, `longitude`, or `coordinates`.
SC-018 / SC-019.

---

## Step 10 — Effective-price helper sweep (~30 s)

```bash
cd backend
npm run test:e2e -- items-effective-price.e2e-spec
```

**Verify** every assertion passes:

- `fixed` discount: `effectivePrice(60, 5, fixed) === "55.00"`.
- `percent` discount: `effectivePrice(60, 10, percent) === "54.00"`.
- Zero effective: `effectivePrice(60, 100, percent) === "0.00"`.
- Refusal (fixed > price): create rejected at `ITEM_NEGATIVE_EFFECTIVE_PRICE`.
- Refusal (percent > 100): create rejected at the same code.

SC-005, SC-006.

---

## Step 11 — Today-available weekday rollover (~1 min)

```bash
cd backend
npm run test:e2e -- menus-availability.e2e-spec
```

**Verify** the test exercises every Cairo weekday Sun → Sat plus
the midnight Cairo boundary (request at 23:59:59 Cairo on Tue,
then at 00:00:01 on Wed) and confirms the today-available filter
flips at the boundary. SC-002 / SC-003.

---

## Step 12 — Backend security and observability sweep (~3 min)

```bash
cd backend
npm run test:e2e -- menus.e2e-spec
npm run test:e2e -- items.e2e-spec
npm run test:e2e -- public-chef-profile.e2e-spec
npm run test:e2e -- home.e2e-spec
npm run test:e2e -- http-redaction.e2e-spec
```

**Verify** all suites pass. Specific cases asserted:

- **SC-013** — every chef-side mutation refuses a non-chef
  caller with `403 FORBIDDEN_ROLE`.
- **SC-014** — every chef-side mutation against a target owned by
  a different chef returns the `404 *_NOT_FOUND` shape — same as
  genuinely missing.
- **SC-008** — the customer chef-profile read never returns a
  menu that is not today-available, an item that is inactive, an
  item that is soft-deleted, or a menu/item belonging to a
  soft-deleted chef.
- **SC-017** — every body-accepting Phase 4 endpoint refuses an
  extra undocumented field with `400 VALIDATION_ERROR` (FR-031
  inherited from Phase 0's `whitelist: true,
  forbidNonWhitelisted: true` pipe).
- **SC-018 / SC-019** — every FR-032 event line is asserted
  absent of any `latitude` / `longitude` / `coordinates` value
  (string scan); every error response body is asserted absent of
  the same.
- **http-redaction.e2e-spec.ts** is extended to cover
  `/chef/menus/*`, `/chef/items/*`, `/chefs/*/profile` paths in
  addition to the Phase 2 / 3 paths.

Tail the backend logs while running through Steps 3 – 9 manually
on the device. **Verify** the FR-032 lines emit one per event,
each carrying a non-null `correlationId` and `actor.role`, and
none carrying coordinates.

---

## Done criteria

Phase 4 is complete when:

- [ ] Steps 1 – 12 above all pass on a real device against a
      real Supabase project.
- [ ] The Phase 0 CI grep gate
      (`backend/scripts/ci-no-hard-delete.sh`) remains green —
      no `prisma.menu.delete` or `prisma.item.delete` call shipped.
      `prisma.menuAvailability.delete` is on the gate's allow list.
- [ ] `npx prisma migrate status` shows no schema drift after
      `0004_item_active_displayorder_indexes`.
- [ ] The Phase 4 i18n keys are present in BOTH
      `mobile/constants/i18n/en.ts` and
      `mobile/constants/i18n/ar.ts`; a missing-key check across
      locales reports zero asymmetric keys.
- [ ] The Swagger UI at `/api/v1/docs` documents every new
      endpoint with request / response schemas, bearer auth, and
      the role requirement.
- [ ] No new `$queryRaw` calls have been introduced (`grep`
      confirms the only `$queryRaw` in the codebase remains the
      Phase 0 health probe).
- [ ] `decimal.js` is the only library performing arithmetic on
      `price` / `discountValue` / `effectivePrice` — no `Number()`
      coercion on a Decimal field anywhere in the new code.
- [ ] No admin web changes shipped under cover of Phase 4
      (spec Assumption).
- [ ] The `Item.quantity = -1` sentinel never appears on any
      wire — every response is mapped through the R4 shape.
