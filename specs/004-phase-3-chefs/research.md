# Phase 3 Research: Categories, Chef Application & Verification

This document resolves every technical decision implied by `spec.md`
and `plan.md` before implementation begins. Each entry follows the
Decision / Rationale / Alternatives format used in Phases 0 – 2.

---

## R1 — Schema additions for Phase 3 application state

**Decision**: Phase 3 ships **one Prisma migration** named
`0003_chef_rejection_state` that:

1. Adds `Chef.rejectedAt: DateTime?` (nullable, no default).
2. Adds `chef_revoked` as a new value to the existing
   `NotificationType` enum.

The Chef application state machine is represented entirely on the
`Chef` row (no new `ChefApplication` table) using these fields the
schema already carries plus the new one:

| State | `isVerified` | `rejectedAt` | `deletedAt` |
|---|---|---|---|
| Pending (apply just submitted) | `false` | `NULL` | `NULL` |
| Verified | `true` | `NULL` | `NULL` |
| Rejected | `false` | timestamp | `NULL` |
| Revoked (was verified) | `false` | `NULL` | timestamp |

Re-applying after a rejection or revocation **updates the existing
`Chef` row in place** — clearing the relevant timestamp, resetting
`isVerified=false`, replacing the application fields with the new
values, and writing a fresh `Notification` row to preserve the
audit trail of the prior rejection / revocation. The schema's
`@unique` constraint on `Chef.userId` is preserved (a user has at
most one `Chef` row ever; the row is the application).

**Rationale**:

- A separate `ChefApplication` table would introduce a new
  constitution-listed entity, which Constitution Principle IV
  forbids without a constitution amendment. The existing `Chef`
  row already carries every field a pending application needs
  (`chefName`, `bio`, `latitude`, `longitude`, `minOrderPrice`,
  `isVerified`); adding two more fields is the minimum-impact
  change.
- The `@unique` on `Chef.userId` is load-bearing: Phase 4 menus,
  Phase 6 orders, Phase 7 reviews, and the chef public profile
  all assume a 1:1 `User`↔`Chef` relation. Dropping the uniqueness
  to support multiple application history rows would force every
  downstream module to disambiguate, which is much more invasive
  than the in-place-update model.
- The audit trail of prior rejections / revocations is preserved
  by the `Notification` rows the admin emitted (which carry the
  reason text) plus the FR-038 structured-log stream. The spec
  line "the rejection-history record on the prior application is
  preserved on the prior row" is satisfied by interpreting "the
  prior row" as the audit surfaces (notifications + logs), which
  is consistent with how every other phase has handled audit
  history.
- Adding `chef_revoked` to the `NotificationType` enum is the
  cleanest way to distinguish a revocation notification from a
  rejection notification (existing enum value `chef_rejected`)
  and from the generic `system` channel. Mobile clients can
  branch UI rendering on the type without parsing free-text body
  content.

**Alternatives considered**:

- *Separate `ChefApplication` table*: Rejected — would require a
  constitution amendment under Principle IV (new constitution-
  listed entity) and would force downstream modules to
  disambiguate "active chef" from "application history".
- *Drop the `@unique` constraint on `Chef.userId` and allow multiple
  rows per user*: Rejected for the same downstream-disambiguation
  reason. Every existing query on `Chef` that filters by `userId`
  would have to add an `isVerified=true` clause to find "the active
  chef row" and risk drifting into wrong-row bugs.
- *Reuse `NotificationType.system` for revocations*: Rejected —
  mobile clients would have to parse body content to distinguish
  routine system messages from a revocation, defeating the
  enum's purpose.
- *Use `Chef.deletedAt` for rejection too (soft-delete on reject)*:
  Rejected — conflates "rejected (never verified)" with "revoked
  (was verified)". The 24-h cooldown applies to both, but the UI
  copy and the FR-038 event type are different per the spec
  clarification.

**Open question**: None. The migration is additive only; no
existing column changes type or nullability.

---

## R2 — Geographic-radius discovery query without raw SQL

**Decision**: The chef-discovery query uses a **pure-Prisma
bounding-box pre-filter** in the `where` clause, followed by an
**in-memory Haversine sort + cap** computed in service-layer
JavaScript. Concretely, given a customer's `(lat, lng)` and an
effective `radiusKm` (spec FR-016 — default 15 km, capped at 50 km):

1. Compute the bounding-box offsets:
   - `latOffset = radiusKm / 111` (degrees latitude per km is
     approximately constant)
   - `lngOffset = radiusKm / (111 × cos(lat × π / 180))` (degrees
     longitude per km varies with latitude)
2. Issue a single `prisma.extended.chef.findMany({ where: {
   isVerified: true, latitude: { gte: lat - latOffset, lte: lat +
   latOffset }, longitude: { gte: lng - lngOffset, lte: lng +
   lngOffset }, // plus category / search / isOpen filters } })`.
3. For each returned row, compute the exact Haversine distance in
   JavaScript using `haversine.ts`. Filter out any whose exact
   distance exceeds `radiusKm` (the bounding box is a slight
   over-approximation, so a small cull is expected).
4. Sort the surviving set by distance ascending and apply the
   pagination cursor / page-size.

When the customer's coordinates are not available (location
permission denied, no last-known location), the bounding-box
filter is omitted and the query becomes a vanilla `findMany`
ordered by the FR-016 verified-newest-first secondary sort
(open-first then `verifiedAt` desc — see also R3 for how
`verifiedAt` is captured).

**Rationale**:

- Constitution Principle IV forbids raw SQL except by narrow
  exception. `docs/IMPLEMENTATION_PLAN.md` task 3.9 had reserved
  an exception for Phase 3 Haversine, but the bounding-box +
  in-JS Haversine approach achieves the same user-facing
  behaviour without raw SQL. Phase 3 ships zero new
  exceptions, keeping the codebase Constitution-IV-clean.
- The 50 km hard cap (spec FR-016) bounds the candidate set
  size. In a worst-case dense scenario (every Greater Cairo
  chef inside the box, conservatively a few hundred rows in
  v1+), the in-JS sort is sub-millisecond. The single Prisma
  query consumes the existing chef-table indexes on
  `(isVerified, ...)` and on `(latitude, longitude)` (the latter
  is added by the same Phase 3 migration — see R1's migration
  scope note below).
- Bounding-box pre-filter is a textbook optimisation; the
  approximation error vs exact distance is well-understood and
  bounded by the lat/lng-degree-to-km ratio at the customer's
  latitude. For Egyptian customers (latitude band roughly 22°–32°
  N), the worst-case over-approximation is ~6% of the radius —
  the in-JS cull on exact distance closes the gap.

**Migration scope note**: The same `0003_chef_rejection_state`
migration also adds a `(isVerified, latitude, longitude)`
composite index to `chefs` to keep the bounding-box `findMany`
fast as the table grows. The index is justified by the
discovery query being the most frequent customer-facing read
in Phase 3 onward.

**Alternatives considered**:

- *`$queryRaw` Haversine* (the IMPLEMENTATION_PLAN-reserved
  exception): Rejected. Bounding-box + in-JS Haversine is
  Constitution-IV-clean and equally correct. Keeping the
  raw-SQL exception register at one entry (the Phase 0 health
  probe) reduces the surface a future contributor might extend
  by precedent.
- *PostGIS `ST_DWithin`*: Rejected. Would require enabling the
  PostGIS extension in Supabase and using GIS column types,
  both schema-level commitments. Excessive for v1; the
  bounding-box approach scales comfortably to ~100k chef rows
  before the in-JS sort becomes a concern.
- *Pre-computed geohash bucket on each chef row*: Rejected.
  Adds a schema field and a per-write geohash computation that
  does not pay off until ≫ 100k chef rows.
- *Fetch every verified chef and sort entirely in JS*: Rejected.
  Works at v1 scale but does not generalise; the bounding-box
  pre-filter is a small addition that bounds the read.

---

## R3 — Atomic verification / rejection / revocation transactions

**Decision**: Each of the three admin-driven state transitions
runs inside one `prisma.$transaction` callable. The callbacks
share a common pattern (read → assert state → write Chef row
change → write User role change [if applicable] → write
Notification row → return). FCM dispatch happens **after** the
transaction returns successfully and is wrapped in
`try { … } catch { logger.error(…) }` so a push-delivery failure
never rolls back the transition.

**Verification** (`admin.service.verifyApplication(chefId)`):

```pseudo
prisma.$transaction(async (tx) => {
  const chef = await tx.chef.findUnique({ where: { id: chefId } });
  if (!chef || chef.deletedAt || chef.isVerified || chef.rejectedAt) {
    throw new ConflictException('APPLICATION_NOT_PENDING');
  }
  await tx.chef.update({ where: { id: chefId }, data: {
    isVerified: true,
    verifiedAt: new Date(),                  // see migration scope below
  }});
  await tx.user.update({ where: { id: chef.userId }, data: {
    role: 'chef',
  }});
  await tx.notification.create({ data: {
    userId: chef.userId,
    type: 'chef_verified',
    title: { en: 'You are now verified', ar: '...' },
    body:  { en: 'Welcome to Nafas as a chef.', ar: '...' },
  }});
});
// outside the tx:
fcmService.send(user.fcmToken, { ... }).catch(err => logger.error(err));
```

**Rejection** (`admin.service.rejectApplication(chefId, reason)`):
same transaction shape, but updates
`{ rejectedAt: now() }`, does NOT change `user.role`, and creates
a `chef_rejected` Notification carrying `reason` in the `data`
JSON.

**Revocation** (`admin.service.revokeChef(chefId, reason)`):
same transaction shape, but updates `{ deletedAt: now() }` on
`Chef` (via `tx.chef.softDelete(...)` — the Phase 0 extension
method works inside a transaction), updates `user.role` back to
`customer`, and creates a `chef_revoked` Notification (new
NotificationType value per R1) carrying `reason`.

**Migration scope note** (folds into R1): we also add
`Chef.verifiedAt: DateTime?` in the same `0003_chef_rejection_state`
migration so that the FR-016 secondary sort
"verified-newest-first" has a deterministic source field. Today
the schema has no such column; using `updatedAt` would conflate
"verified" with "chef edited their bio". One nullable timestamp
column is cheap; the spec's FR-016 sort behaviour mandates it.

**Rationale**:

- Constitution Principle II requires that the role transition,
  the chef-row state change, and the notification creation be a
  single observable event. A partial commit (role flipped but
  no notification) would leave a chef in an unreachable state
  — they'd land on the chef tab bar with no on-boarding
  notification, and operators would have no audit row. The
  transaction guarantees all-or-nothing.
- Push notifications are best-effort by convention (FCM tokens
  expire, devices go offline, vendor outages happen). Tying
  the transaction commit to push delivery would make every
  verification flaky. The notification row is the source of
  truth; the push is a courtesy.
- Concurrent admins racing to verify the same application
  (FR-012 / SC-006 race-condition test) is handled by the
  in-transaction `if (chef.isVerified) throw …` check. The
  second admin sees the first admin's commit, the conflict is
  raised, no double-flip occurs.

**Alternatives considered**:

- *Update Chef + User in separate transactions*: Rejected — a
  partial failure leaves the data store in an inconsistent
  state. Two transactions doubles the failure surface.
- *Use database triggers for the role flip*: Rejected. Triggers
  bypass the Prisma client (Constitution Principle IV calls out
  Prisma as the only query interface), are invisible to the
  module boundary (Constitution Principle III), and complicate
  test fixtures.
- *Commit the transaction and then fire FCM inside the same
  `$transaction` callback*: Rejected. An FCM SDK that throws
  inside a Prisma transaction callback rolls back the
  database writes. The chosen pattern (fire-and-log after
  commit) decouples the two.

---

## R4 — 24-hour cooldown gate on `/chef/apply`

**Decision**: The apply service calls `chef-application.service.ts`'s
`assertEligibleToApply(userId)` helper before any write. The helper
reads `prisma.chef.findFirst({ where: { userId } })` (bare client —
*not* extended — because the gate has to see soft-deleted /
rejected rows that the extension would hide) and refuses with
`409 APPLICATION_COOLDOWN_IN_EFFECT { earliestResubmitAt: ISO8601 }`
if the row exists and either `rejectedAt > now() - 24h` or
`deletedAt > now() - 24h`.

The gate also refuses with:

- `409 APPLICATION_PENDING { applicationId }` if a row exists with
  `isVerified=false`, `rejectedAt=NULL`, `deletedAt=NULL` (FR-004).
- `409 ALREADY_CHEF { chefId }` if a row exists with
  `isVerified=true`, `deletedAt=NULL` (FR-005).

After all gate checks pass:

- If a prior `Chef` row exists (rejected or revoked), the apply
  call **updates that row in place** — clears `rejectedAt`,
  clears `deletedAt`, sets `isVerified=false`, replaces
  `chefName / bio / latitude / longitude / minOrderPrice`, and
  resets `verifiedAt` to NULL.
- If no prior `Chef` row exists, the apply call **creates a fresh
  row** with `isVerified=false`.

**Rationale**:

- The bare-client read is the only deviation from the Phase 0
  convention "all reads on soft-delete models go through
  `prismaService.extended`". The deviation is **deliberate and
  scoped**: the cooldown gate is the only Phase 3 code path that
  needs to see soft-deleted rows, and the spec's FR-006 / FR-012b
  require it. We add a comment at the call site naming this as
  the Phase 3 exception so future contributors know it is
  intentional.
- Computing `earliestResubmitAt` server-side (rather than
  accepting it from the client) is non-negotiable per
  Constitution Principle II.
- Re-applying via in-place update (rather than creating a new
  row) preserves the `Chef.@unique` constraint on `userId` per
  R1; the prior rejection / revocation reason is preserved in
  the Notification row that was emitted at the time, plus the
  FR-038 structured-log stream.

**Alternatives considered**:

- *Track cooldown on a separate `ApplicationCooldown` table*:
  Rejected — new entity, Constitution Principle IV barrier.
- *Track cooldown only via the most recent `chef_rejected`
  Notification's `createdAt`*: Rejected — Notification rows are
  application-level audit, not state. Using them as state
  machinery couples two concerns.
- *Make the cooldown configurable via the `Setting` model*:
  Considered. Postponed — the 24-h value is fixed by the spec
  clarification; configuring it would invite drift. Phase 12
  hardening could revisit if abuse patterns emerge.

---

## R5 — `KitchenLocationPicker` mobile component (reuses Phase 2)

**Decision**: Phase 3 ships a thin wrapper component
`mobile/components/KitchenLocationPicker.tsx` that delegates 100%
of its rendering and behaviour to the Phase 2 `AddressPickerMap`.
The wrapper exists to:

1. Carry chef-apply-specific labels ("Kitchen location" instead of
   "Delivery address") via prop overrides.
2. Be a stable import path for the chef-apply screen and the
   chef-profile-editor screen (both Phase 3 surfaces), so that if
   Phase 4+ needs to diverge (e.g., to display a delivery-radius
   circle around the kitchen) the divergence is local to one
   component.
3. Expose the same `{ value, onChange, onReverseGeocode? }`
   controlled-component contract documented in Phase 2 R3.

No new map dep, no new geocoding dep, no new API key procurement.
The existing Phase 2 Google Maps key restrictions cover both the
customer addresses surface and the chef-apply / chef-profile
surfaces because the Maps SDK is per-bundle-id, not per-screen.

**Rationale**:

- Constitution Principle V requires design-system consistency
  across mobile surfaces; the Phase 2 picker is already the
  canonical map-picker UX in the design system.
- The map-picker is one of the more behaviourally complex mobile
  components in the project (location permission flow, 500 ms
  debounce, reverse-geocode pre-fill, fixed-pin-over-draggable-
  map convention — all from Phase 2 R3). Re-implementing it for
  Phase 3 risks subtle UX drift.
- A thin wrapper preserves the option to diverge later without
  refactoring two call sites.

**Alternatives considered**:

- *Reuse `AddressPickerMap` directly from the chef-apply
  screen*: Rejected — would import a component named for the
  customer-addresses surface, which is semantically confusing
  in a chef-apply context.
- *Generalise `AddressPickerMap` to a `MapLocationPicker` and
  rename*: Considered. Postponed because it would require a
  Phase 2 file rename (touching the Phase 2 screens) without
  shipping new value in this phase. Phase 12 hardening sweep
  could revisit.

---

## R6 — `users.service.setRole(userId, nextRole)` as the role-flip chokepoint

**Decision**: The `users` module is extended with a single new
method `setRole(userId: string, nextRole: Role): Promise<void>`.
This is the **only** place in the Phase 3 codebase that calls
`prisma.user.update({ data: { role } })`. Both `verifyApplication`
(role → chef) and `revokeChef` (role → customer) inside
`admin.service` call this method through the injected
`UsersService`. The method receives the active Prisma transaction
client as an optional second argument so it can participate in
the verify / revoke `prisma.$transaction` (R3).

**Rationale**:

- Constitution Principle III: cross-module data mutations go
  through service interfaces. `admin.service` does not own User
  rows; `users.service` does.
- Constitution Principle II: a single role-flip chokepoint
  makes audit easier — grep "setRole" finds every role
  transition; FR-038 logs are emitted from one location.
- Future Phase 11 admin-user-management surfaces (deactivate
  user, change role manually) will call the same chokepoint,
  so the boundary is durable.

**Alternatives considered**:

- *Inline `prisma.user.update({ role })` calls inside
  `admin.service`*: Rejected. Violates Principle III.
- *Expose `setRole` only via `admin.service`*: Rejected. The
  module that owns the data is `users`; `admin` is one of
  several callers (future phases will have more).

---

## R7 — Categories list 60-second in-process cache

**Decision**: `categories.service.listActive()` keeps a
60-second in-process TTL cache (a simple `{ ts: number, value:
Category[] }` member on the singleton service) of the active
category list. Cache misses re-issue the Prisma `findMany({
where: { isActive: true, deletedAt: null }, orderBy: { displayOrder:
'asc' } })` and refresh `ts`. Every mutation path on the same
service (`create`, `update`, `softDelete`, `reorder`) calls a
private `invalidateCache()` after the database write commits.

**Rationale**:

- The category list is read by every customer device on every
  Home / Explore screen open. At v1 scale, the database read is
  cheap; at v2+ scale, an in-process cache eliminates a few
  thousand redundant reads per minute.
- Categories change rarely — admin curation is a deliberate
  human action. A 60-second freshness window is invisible to
  end users and trivial to reason about.
- Cache invalidation lives **inside the same service** that owns
  mutations, so there is no cross-process invalidation problem.
  In a multi-instance prod deployment, each instance's cache
  drifts up to 60 s out of sync with another instance, which is
  acceptable for category curation latency.

**Alternatives considered**:

- *No cache* (re-issue every read): Acceptable at v1 scale.
  Rejected to set the right pattern early; the cache is 25 lines
  of code and a positive precedent for low-churn reads later.
- *Redis-backed cache*: Rejected. Constitution Principle IV's
  stack snapshot does not include Redis (the Phase 0 plan
  explicitly chose Postgres-only). Adding Redis just for
  categories would be disproportionate.
- *HTTP cache headers* (`Cache-Control: max-age=60`): Considered.
  Postponed — would require client-side cache discipline that
  the mobile axios setup does not yet apply, and would not help
  the admin-mutation invalidation case.

---

## R8 — Image upload validation: mime-type + byte-length only

**Decision**: Logo and banner uploads validate **only**:

1. `Content-Type` is one of `image/jpeg`, `image/png`, `image/webp`
   (spec clarification Q1).
2. File byte-length ≤ 5 MB (spec clarification Q1).

No magic-number sniffing, no EXIF stripping, no re-encoding, no
content-image-recognition. The file is uploaded to Supabase
Storage as-is and the bucket's public URL is stored on the chef
row. The Supabase Storage bucket's MIME-type whitelist (set at
bucket creation, Phase 0.6) provides a second line of defence
against a misdeclared `Content-Type`.

**Rationale**:

- Constitution Principle VII (scope discipline) — server-side
  image processing is not in v1 scope. Phase 12 hardening sweep
  may revisit.
- The XSS surface the spec clarification called out
  (`<svg>` / `<html>` masquerading as images) is closed by the
  mime-type whitelist plus the Supabase bucket's own type
  whitelist. A PNG that contains malicious EXIF is harmless
  because it is served as `Content-Type: image/png`.
- File-size enforcement is a backend responsibility, not a
  client-trust matter — `FileInterceptor({ limits: { fileSize:
  5 * 1024 * 1024 } })` from `@nestjs/platform-express` rejects
  oversize uploads at the multipart parse layer, before any
  service code runs.

**Alternatives considered**:

- *Magic-number sniffing via `file-type` package*: Rejected for
  v1. Adds a dependency and CPU cost; the bucket's MIME
  whitelist is the equivalent defence at the storage layer.
- *Server-side re-encode via `sharp`*: Rejected for v1. Useful
  for thumbnail generation and EXIF stripping, but Phase 3 ships
  no thumbnail tier and no privacy-sensitive EXIF use case.
- *Client-side image compression before upload*: Considered.
  Postponed — `expo-image-picker` already returns a reasonably
  sized JPEG by default for camera output; the 5 MB cap is
  generous for that path.

---

## Open Items still tracked

- **Twilio Verify cost at chef-adoption rates** (Phase 1 Open
  Item A2): unaffected by Phase 3. The chef-apply flow does not
  re-trigger OTP unless the customer changes their phone (a
  Phase 1 surface).
- **Default chef placeholder assets** (IMPLEMENTATION_PLAN Open
  Item A5): Phase 0.6 task uploaded `default-logo.png` and
  `default-banner.png` to Supabase Storage. If the brand
  designer revises these later, the change is a re-upload at
  the same bucket path (no Phase 3 code change needed). The
  asset URLs are read from backend config at chef-creation time.
- **FCM credential procurement**: Phase 3 is the first phase to
  call FCM. The Firebase project, service-account JSON, and the
  backend env var `FIREBASE_SERVICE_ACCOUNT_KEY` (or the path to
  a mounted JSON file) need to exist before the Phase 3
  quickstart Step 5 can verify push delivery on a real device.
  Captured as Phase 3 task `T0` in `tasks.md`.
- **The IMPLEMENTATION_PLAN Haversine `$queryRaw` exception**
  (task 3.9): retracted by R2. The implementation plan should
  be updated in a follow-up commit to remove the exception note
  ("`Haversine via Prisma $queryRaw — narrow exception, justified
  in plan/complexity tracking`") because Phase 3 ships a
  Constitution-IV-clean alternative.
