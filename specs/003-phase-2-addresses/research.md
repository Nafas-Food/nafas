# Phase 2 Research: Saved Delivery Addresses with Map Picker

This document resolves every technical decision implied by `spec.md`
and `plan.md` before implementation begins. Each entry follows the
Decision / Rationale / Alternatives format used in Phases 0 and 1.

---

## R1 — Reverse-geocoding provider on the mobile client

**Decision**: Use **`Location.reverseGeocodeAsync` from `expo-location`**
as the platform's reverse-geocoding provider on the mobile client. The
platform never reverse-geocodes server-side; the lookup is purely a
UX hint that pre-fills the street-name field on the add/edit screen
(FR-006) and its result has no server consequence (FR-008 — whatever
text the customer last left in the field is what is persisted).

**Rationale**:

- `Location.reverseGeocodeAsync` is bundled with the existing
  `expo-location` dependency that Phase 2 needs anyway for
  "centre on device current location when permission is granted"
  (FR-007). One dependency covers both needs.
- It uses the device's native geocoder (Apple Maps on iOS, Google
  Play Services on Android) and requires **no API key, no quota
  management, and no per-request billing**. This eliminates the
  ongoing cost recorded as Open Item A2-style spend in
  `docs/IMPLEMENTATION_PLAN.md` for the geocoding line item, and
  removes the entire class of "reverse-geocoding works in dev but
  the prod API key has not been provisioned yet" failures.
- Spec FR-006 already requires the lookup to fail silently and not
  block the save flow. The Apple Maps geocoder occasionally returns
  no result for sparsely-mapped Egyptian neighbourhoods; that
  failure is *expected* and *handled* by FR-006's contract.
  Switching to a more aggressive provider does not eliminate the
  failure mode; it only postpones the visibility of it.
- Result accuracy in Egypt is "good enough" for a UX hint —
  street-level for major cities, neighbourhood-level for the
  outskirts. The spec deliberately makes the typed text a hint and
  the coordinates the source of truth (FR-002), so geocoder accuracy
  is not on the order-correctness path.

**Alternatives considered**:

- *Google Geocoding REST API* (the implementation-plan D4c default):
  Higher consistency across platforms (one geocoder rather than two)
  and slightly better Egyptian coverage. Rejected as the default
  because (a) it adds an API-key surface to manage, restrict, and
  rotate, (b) it adds per-call billing (~$5/1000 lookups beyond free
  tier), (c) it adds an API-down failure mode the platform must
  silently handle anyway. **Retained as a documented fallback**: if
  on-device verification (per `quickstart.md` Step 4) reveals the
  native geocoder's Egypt results to be materially worse than
  Google's, the implementation flips to Google with no API contract
  change — `AddressPickerMap` consumes a `reverseGeocode(coords)`
  function via dependency injection so swapping is a 30-line edit.
- *Mapbox Geocoding API*: Comparable to Google, requires the same
  API-key infrastructure. Rejected for the same reason as Google.
- *Server-side reverse geocoding*: Rejected — adds backend
  complexity (an external HTTP call from the request path), incurs
  the same API-key cost, and provides no benefit over the client
  call since the result is never trusted by the server (FR-008).

**Cost note**: Selecting `expo-location.reverseGeocodeAsync` saves an
estimated $5–25/month at v1 volumes vs Google Geocoding API. Revisit
at scale or if the Phase 12 hardening review surfaces a quality gap.

**Open question**: None. The fallback path is documented; the chosen
default is verifiable on a real device during the quickstart.

---

## R2 — Google Maps API key custody and platform restrictions

**Decision**: Procure a single Google Cloud project for Nafas, enable
the **Maps SDK for iOS** and **Maps SDK for Android** (no Geocoding
API per R1), and provision **one API key per platform**, each
restricted to the corresponding bundle ID (iOS) or package name +
SHA-1 fingerprint (Android). Both keys are read at Expo
config-resolution time from environment variables
(`GOOGLE_MAPS_API_KEY_IOS`, `GOOGLE_MAPS_API_KEY_ANDROID`) and stamped
into `mobile/app.config.ts`'s `ios.config.googleMapsApiKey` and
`android.config.googleMaps.apiKey` slots respectively. Keys are
**never committed**; per-contributor `.env` files in `mobile/` carry
them in development, EAS Build secrets carry them in CI/release.

**Rationale**:

- `react-native-maps` on iOS uses Apple Maps by default (no key
  required). On Android it requires a Google Maps key. We provision
  iOS and Android keys symmetrically anyway so the team can switch
  iOS to Google Maps later (e.g., for visual consistency) without
  re-provisioning.
- Per-platform keys with bundle/package restrictions are Google's
  documented best practice and the only way to make a leaked key
  meaningfully un-abusable — an unrestricted key in a shipped binary
  is a billing-incident risk, not just a hygiene one.
- Reading the key at config-resolution time (not runtime) keeps the
  key out of the JS bundle and out of any error-trace surface;
  Sentry-style dumps do not include `app.config.ts` evaluation
  context.
- Implementation-plan D4c selected react-native-maps + Google Maps;
  this research confirms the choice and pins the key-custody
  protocol so it is unambiguous before code lands.

**Alternatives considered**:

- *Single unrestricted key across both platforms*: Rejected —
  unrestricted keys leak the moment the app ships; one
  prematurely-published debug build can produce a five-figure
  monthly bill.
- *Use Apple Maps on iOS and Google Maps on Android* (asymmetric):
  Acceptable in v1 from a behaviour standpoint — both render fine
  for pin-drag UX. Rejected as the default because the team already
  has the platform-key infrastructure decided and symmetric provider
  choice keeps screenshots / QA surface uniform.
- *Mapbox*: Different SDK, different pricing, different
  authentication flow. Rejected — `react-native-maps` is the
  implementation-plan choice, and adopting a different map library
  would require a constitution amendment under the canonical-stack
  clause.

**Provisioning gate**: This step (D4c subtask) blocks the mobile
quickstart Step 4 (map renders on device). It is a one-time setup,
not a recurring concern. Captured as Phase 2 task `T0` in the
upcoming `tasks.md`.

---

## R3 — `AddressPickerMap` component contract and RTL behaviour

**Decision**: `AddressPickerMap` is a controlled component with this
prop interface:

```ts
interface AddressPickerMapProps {
  value: { latitude: number; longitude: number } | null;
  onChange: (next: { latitude: number; longitude: number }) => void;
  onReverseGeocode?: (street: string) => void;   // optional UX hint
  initialRegion?: Region;                         // override default centre
  testID?: string;
}
```

- The map fills the available width and a fixed 320 dp height. The
  pin sits at the geometric centre of the visible map; pin movement
  is implemented by panning the map (a draggable map under a fixed
  pin) rather than dragging the pin itself, because a fixed pin
  feels native on both iOS and Android and avoids the "pin gets lost
  off-screen" edge case.
- On mount, if `value` is provided, the map centres on `value`. If
  `value` is null, the component asks `expo-location` for foreground
  permission once; when granted, it fetches the device's current
  position with `Location.getCurrentPositionAsync({ accuracy:
  Balanced })` (timeout 4 s) and centres on it. When the permission
  is denied, fetch fails, or times out, the map centres on Cairo
  (30.0444 N, 31.2357 E) at zoom level 13 — a sensible default
  consistent with FR-007.
- Every region change (after a 500 ms debounce so we don't fire
  during pan inertia) triggers `onChange` with the new centre
  unconditionally. A successful
  `Location.reverseGeocodeAsync` result additionally calls
  `onReverseGeocode` with the composed street string. A failed or
  empty reverse-geocode skips `onReverseGeocode` only — `onChange`
  always fires — so the parent screen's street-name input keeps
  whatever the customer last left in it (FR-008).
- The map itself is locale-neutral (street labels render in their
  source language regardless of the app's `isRTL` state). The pin's
  accessibility label, the "Use my location" CTA shown when
  permission has not yet been granted, and the screen chrome around
  the map are all keyed in `t('addresses.picker.*')`. Layout uses
  `flexDirection: 'row'` only inside conditional branches keyed on
  `isRTL`; the picker screen consumes Phase 1's `LanguageContext`.

**Rationale**:

- A controlled component lets the parent screen own the form
  (label, street-name text, building/floor/apartment optionals,
  notes, and the picker's coordinates), which is the natural shape
  for a save flow — one source of truth, one validation surface.
- A fixed pin over a draggable map is the standard pattern across
  Apple Maps, Google Maps, Uber, Talabat, Foodics; it is what
  Egyptian customers expect.
- The 500 ms debounce keeps reverse-geocode call volume low (one
  call per user-perceived stop, not per pixel of pan inertia) and
  keeps SC-003's "within 2 seconds" budget intact.
- Cairo as the fallback centre is the most populous starting point
  for an Egypt-only product; an Alexandrian customer drags ~200 km,
  which is "annoying once, per device, on first install" — an
  acceptable trade-off for v1.

**Alternatives considered**:

- *Draggable pin on a static map*: Rejected — the pin can be lost
  off-screen on a pinch-zoom; fixed-pin-on-draggable-map is more
  forgiving.
- *Skip the location fetch entirely* (always centre on Cairo):
  Rejected — every customer outside Cairo would have to drag every
  time. Adds ~10–30 s to the SC-001 budget.
- *Reverse-geocode on every region change without debounce*:
  Rejected — fires dozens of calls during a single pan gesture.
- *Keep pin draggable, render arrow icon at centre*: Rejected — UI
  noise without compensating clarity.

---

## R4 — Ownership-isolation response shape (FR-015 / SC-006)

**Decision**: When the authenticated customer requests an action on
an address whose `userId` does not match `req.user.sub`, the backend
returns **`404 ADDRESS_NOT_FOUND`** with the same body shape and
status code as a request for an address that genuinely does not
exist. The service-layer query is shaped as a *single*
`prismaService.extended.userAddress.findFirst({ where: { id, userId:
sub } })` rather than a `findUnique({ where: { id } })` followed by
an ownership check; the 404 then naturally falls out of the empty
result.

**Rationale**:

- The spec's FR-015 explicitly calls for "the same response as if the
  target did not exist (no identifier-disclosure leak between
  accounts)". Returning 403 would distinguish "exists but not yours"
  from "does not exist", letting an adversary enumerate valid
  address IDs by probing.
- Combining the ID and ownership filter into one `findFirst`
  eliminates the time-of-check-time-of-use gap between the existence
  check and the ownership check. It is also the simplest possible
  implementation — fewer lines, no branching.
- The Phase 1 spec set the precedent of "single externally visible
  error for two internally distinct cases" (FR-017 — sign-in
  conflates "phone unknown" and "wrong password"). Phase 2 mirrors
  the same posture for address ownership.

**Alternatives considered**:

- *403 Forbidden*: Rejected — leaks the existence of a row whose ID
  the caller does not own.
- *Two-stage check (findUnique then ownership compare)*: Rejected —
  same external response is achievable, but the two-stage shape is
  one extra branching point where a future refactor could
  accidentally introduce a leak.

---

## R5 — Soft-delete path on `UserAddress`

**Decision**: Address deletion goes through
`prismaService.userAddress.softDelete({ where: { id } })`. The
`softDelete` model method is the one Phase 0 wired via the Prisma
Client extension (`backend/src/common/prisma/prisma.service.ts`),
which sets `deletedAt = new Date()` atomically. Reads on
`UserAddress` go through `prismaService.extended.userAddress.*`,
which transparently filters `deletedAt: null` per the Phase 0
extension contract.

**Rationale**:

- Constitution Principle IV mandates soft-delete for `UserAddress`
  (it is named in the soft-delete entity list). Hard deletes via
  `prismaService.userAddress.delete(...)` are blocked at CI by the
  Phase 0 grep gate (`backend/scripts/ci-no-hard-delete.sh`).
- The Phase 0 extension already handles the read filter
  transparently, so the service-layer code is pure CRUD; no manual
  `where: { deletedAt: null }` clauses are needed and adding them
  would be redundant.
- `Order` has a `deletedAt` slot in the schema. Phase 6 will decide
  whether `Order` is hard-delete or soft-delete; the FR-013 read in
  `OrdersService.hasActiveOrderForAddress` uses the **extended**
  client unconditionally so either choice survives without
  modifying Phase 2 code. (Phase 0 conventions section in
  `CLAUDE.md` describes the extension contract.)

**Alternatives considered**:

- *Hard delete*: Rejected — Constitution Principle IV plus the CI
  gate forbid it.
- *Manual `update({ deletedAt })` calls*: Rejected — the Phase 0
  extension exists precisely so service code does not have to spell
  this out. Bypassing the extension method would also bypass any
  future cross-cutting concern attached to the soft-delete path
  (e.g., a fan-out to a background job).

---

## R6 — Coordinate redaction in error responses (FR-021)

**Decision**: Extend the Phase 1
`HttpExceptionNormalizerFilter`
(`backend/src/common/errors/http-exception.filter.ts`) with a
post-processing step that walks the error response body and
**deletes** any property named `latitude`, `longitude`, or any
property whose name is `coordinates` (case-sensitive — these are the
field names the DTOs use; no need to fuzzy-match). The walk is
single-pass, depth-first, applies recursively to nested objects and
array elements, and runs *after* the existing structured-log emit
(so the log, which already excludes coordinates per FR-019, is not
re-walked). Tests in `test/http-redaction.spec.ts` assert on each
shape: a flat error body with `latitude`/`longitude` siblings, a
nested body with `coordinates: { latitude, longitude }`, and an
array of nested errors all get sanitised.

**Rationale**:

- FR-021 forbids lat/lng in any client-visible error response. The
  only practical way to enforce this without auditing every DTO
  validation message at every code path is a single
  defence-in-depth filter at the response boundary.
- The Phase 1 filter is already the canonical place to emit
  structured logs (`auth.password_validation`,
  `auth.rate_limit`); adding the redaction pass next to it keeps
  one filter, one responsibility — "make the error response safe
  before serialisation".
- Property-name-based deletion is robust to future DTO additions:
  any future address-related field we name `latitude` / `longitude`
  / `coordinates` will be redacted automatically.

**Alternatives considered**:

- *Redact at the DTO validator level*: Rejected — `class-validator`
  fires per-field; you would need a custom error formatter on every
  DTO that has a coordinate field. Easy to forget on the next DTO
  added.
- *Redact at the controller-level interceptor*: Rejected — runs
  too late for thrown `HttpException`s and too early for
  `class-validator` rejection bodies (which are produced by the
  global pipe). The exception filter is the only single chokepoint
  that catches both.
- *Whitelist response fields per endpoint*: Rejected — too rigid;
  any new error response shape needs a whitelist update or it
  breaks at runtime.

**Test coverage**: SC-012 is verified by `http-redaction.spec.ts`
plus an `addresses.e2e-spec.ts` case that intentionally triggers a
DTO validation error on a `POST /addresses` body that includes
out-of-range `latitude` and inspects the response body to confirm
neither `latitude` nor `longitude` appears in the message string or
any payload object.

---

## R7 — Optional fields (`building`, `floor`, `apartment`, `notes`) on `UserAddress`

**Decision**: The schema's optional fields (`building`, `floor`,
`apartment`, `notes`) are **accepted by the Phase 2 DTOs as
optional inputs** and **returned in the read response**, but are
**not promoted to required fields** by the Phase 2 spec. None of
the success criteria reference them; FR-001 lists only label,
street-name, and coordinates as the minimum.

**Rationale**:

- The schema offers them; not exposing them in the DTO would force
  customers who *want* "Apartment 3, Floor 2, Building 12" detail
  to cram it into the `streetName` text, defeating the schema's
  intent.
- Promoting any of them to required would change the Phase 2 spec
  contract (FR-001 would need an FR-001a). Out of scope for Phase 2;
  the spec deliberately ships the minimum.
- The mobile add/edit screens render the four fields as collapsed
  optional inputs (a single "More details (optional)" disclosure
  toggle); the i18n surface adds keys for each.

**Alternatives considered**:

- *Promote `building` to required*: Rejected — many Egyptian
  customers live in detached or villa-style residences where
  "building" is meaningless. Forcing the field would push them to
  type a stub.
- *Hide the optional fields entirely in Phase 2*: Rejected — the
  schema columns would sit unused, and customers would be back to
  cramming the detail into `streetName`.

---

## Open Items still tracked

None new. The Phase 1 open items (in-memory throttler storage at
multi-instance scale, rate-limit-store decision in Phase 13) are
unaffected by Phase 2. The Phase 2 `OrdersModule` shell is *not* an
open item — it is the canonical home for Order data going forward;
Phase 6 will expand it.
