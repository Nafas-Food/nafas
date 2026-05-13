# Feature Specification: Saved Delivery Addresses with Map Picker

**Feature Branch**: `003-phase-2-addresses`
**Created**: 2026-05-05
**Status**: Draft
**Input**: User description: "Read phase 2 from docs/implementation-plan.md - and according to the best practices of Github's speckit create the third spec."

## Overview *(non-mandatory context)*

Phase 2 turns the bare identity established in Phase 1 into something the
ordering pipeline can actually use: a place to deliver food. Until a customer
has at least one saved delivery address, every later phase that needs a
"where" — cart checkout (Phase 5), order placement (Phase 6), the chef's
delivery view (Phase 6), the admin order detail (Phase 11) — has nothing to
attach the order to.

The deliverable has two parts that ship together because neither is useful
on its own in this market:

1. **Saved delivery addresses on the customer account** — the customer
   accumulates a personal list (home, parents', work, this week's
   neighbour-watching favour) so that placing an order takes one tap, not a
   form fill.
2. **A visual map picker for the coordinates** — Egyptian residential
   addressing in many neighbourhoods does not resolve to a unique
   street-and-number pair. A typed street name alone routinely sends a
   chef to the wrong building. The picker lets the customer drop a pin on
   their actual building and lets the platform store the coordinates
   alongside the human-readable text. Coordinates are what the chef
   navigates with; the text is what the customer recognises in the saved
   list.

A secondary deliverable, also covered here, is the **safety rail that
protects in-flight orders**: a customer cannot delete an address that an
order in progress is depending on, because doing so would leave the chef
with an unroutable order.

The address-selection sheet shown at checkout is *introduced* in Phase 2
(it is the same data customers see on their saved-list screen) but is
*wired* to a real flow only in Phase 5. Phase 2 ships the ingredient;
Phase 5 cooks with it.

If any of these is missing or unreliable, every later phase that depends
on a delivery target either fails or invents its own ad-hoc workaround.

## Clarifications

### Session 2026-05-05

- Q: Does Phase 2 emit structured logs for address-mutation events, and if so, on what set of events? → A: Match Phase 1's FR-020 contract for the parallel set of address events — emit a structured log line on every significant create / update / delete event (success and failure paths alike), so Phase 12 has one uniform diagnostic surface across identity and address surfaces and ops can detect abuse patterns (mass-creation, ownership-probing) without per-phase variations.
- Q: Do logs and error responses ever carry the raw lat/lng, or are coordinates redacted in observability surfaces? → A: Redact coordinates everywhere in observability — logs never carry lat/lng, error responses never echo lat/lng. The address ID is the diagnostic handle; an authorized operator reads coordinates directly from the data store when actually debugging. Mirrors Phase 1's PII discipline (passwords and OTP codes never appear in logs).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A customer saves their first delivery address by dropping a pin on the map (Priority: P1)

A signed-in customer who has never ordered before opens their profile,
taps "addresses", and is taken to an empty list with a clear "add address"
CTA. They tap it, see a map of their area, drag the pin onto their actual
building, watch the street-name field auto-populate from the dropped
pin's location, optionally tweak the street-name text, give the address
a short label they will recognise later ("home"), and tap save. The
address now appears in their saved list, and reopening the app later
still shows it there.

**Why this priority**: Without a saved address, the customer cannot
place an order. This is the smallest slice of Phase 2 that delivers real
value on its own — the customer leaves the screen with a usable
delivery target, regardless of whether a second address is ever added.

**Independent Test**: A customer who has just registered (Phase 1 flow)
opens their profile, navigates to addresses, drops a pin on the map,
saves the address with a label, force-closes and reopens the app, returns
to the addresses screen, and sees the address still listed with the same
label, street-name text, and pin location.

**Acceptance Scenarios**:

1. **Given** a signed-in customer with no saved addresses, **When** they
   open the addresses screen, **Then** they see an empty-state
   explanation and a clear "add address" CTA.
2. **Given** the customer is on the add-address screen, **When** they
   drag the map pin to a new location, **Then** the platform attempts to
   look up a human-readable street name for those coordinates and
   pre-fills the street-name field with the result when one is
   available.
3. **Given** the customer has dragged the pin and entered a label,
   **When** they tap save, **Then** the address is persisted to their
   account with the chosen label, the typed street-name text, and the
   coordinates of the dropped pin.
4. **Given** the customer has saved an address and force-closes the app,
   **When** they reopen the app and return to the addresses screen,
   **Then** the same address is shown unchanged.
5. **Given** the device's location permission is granted, **When** the
   customer opens the add-address screen, **Then** the map initially
   centres on the device's current location to minimise dragging.
6. **Given** the device's location permission is denied or unavailable,
   **When** the customer opens the add-address screen, **Then** the map
   centres on a sensible default region, the customer can still drop a
   pin manually, and the platform does not block on the missing
   location.

---

### User Story 2 - A customer maintains their list of delivery addresses (Priority: P1)

A customer has placed a few orders and now has three saved addresses
(home, parents', work). They open the addresses screen, see all three
listed with their labels, edit "work" because the company moved last
month (drag the pin, edit the street name, save), and remove "parents'"
because they no longer need it. The list reflects the changes
immediately and persists across restarts.

**Why this priority**: Equally critical to story 1. A list that can only
be appended to becomes stale within weeks. Without edit and delete, the
customer either accumulates obsolete entries (degrading the checkout
sheet's usability) or stops using the saved-list feature at all.

**Independent Test**: A customer with at least two saved addresses
edits one (changes label, street name, and pin) and deletes another.
Both changes are visible immediately in the list, persist after an app
restart, and the deleted entry no longer appears in any listing.

**Acceptance Scenarios**:

1. **Given** a customer with one or more saved addresses, **When** they
   open the addresses screen, **Then** all of their addresses (and only
   their own) are shown, each with its label, street-name text, and a
   visual indication of its pin location.
2. **Given** the customer taps an address in the list, **When** the edit
   screen opens, **Then** the map and form are pre-populated with the
   stored coordinates, label, and street-name text — exactly as last
   saved.
3. **Given** the customer changes any subset of {label, street-name
   text, pin coordinates} and taps save, **When** the platform processes
   the change, **Then** the stored address is updated to match and
   subsequent reads of the list reflect the new values.
4. **Given** the customer chooses to delete an address that is *not*
   attached to any in-flight order, **When** they confirm the delete,
   **Then** the address is removed from their list and from any
   subsequent address-selection surface.
5. **Given** another customer is signed in, **When** they read the
   addresses surface, **Then** they MUST NOT see any address belonging
   to a different customer.

---

### User Story 3 - The platform protects an in-flight order from losing its delivery target (Priority: P2)

A customer placed an order ten minutes ago for delivery to "home". The
order is currently being prepared by the chef. The customer, browsing
their addresses screen, taps delete on "home" by accident. The platform
refuses, explains in a clear message that this address is in use by an
active order, and offers to take the customer to that order. The
address remains in the list. After the order is delivered (or is
cancelled), deleting "home" succeeds.

**Why this priority**: Lower-frequency than the add/edit/delete flow
but essential for trust: if a customer can quietly delete an address
while a chef is mid-cook, the chef has no recoverable destination, the
courier has nowhere to go, and the platform is stuck. Discovered in
production, this becomes a refund event.

**Independent Test**: A customer places an order on address A (Phase 6
flow), then attempts to delete A from their addresses screen while the
order is still in a non-terminal status. The deletion is refused with
a clear message. After the order moves to a terminal status (delivered
or cancelled), the same delete attempt succeeds.

**Acceptance Scenarios**:

1. **Given** an address that is referenced by at least one of the
   customer's orders in a non-terminal status (anything other than
   delivered or cancelled), **When** the customer attempts to delete
   that address, **Then** the platform refuses with a clear "this
   address is in use by an order in progress" message and the address
   remains saved.
2. **Given** the same address that is *only* referenced by orders in
   terminal status (delivered or cancelled), or by no orders at all,
   **When** the customer attempts to delete it, **Then** the platform
   removes it from their list.
3. **Given** the platform refuses a delete because of an active order,
   **When** the customer is shown the refusal, **Then** they are given
   a clear next step (e.g., "view that order") rather than a dead end.

---

### User Story 4 - The customer reaches the addresses surface in their language with proper layout direction (Priority: P3)

A customer using the app in Arabic opens the addresses screen. The
empty-state copy, the "add address" CTA, the labels on the form (label,
street name, save, delete), the map pin's accessibility label, the
confirmation dialogs, and the validation error messages are all in
Arabic with right-to-left layout. They later toggle the language to
English; reopening the addresses screen renders the same surface in
English with left-to-right layout.

**Why this priority**: Lower priority than the address-management
behaviour itself (a customer can struggle through the other language
to add one address), but the bilingual + RTL contract from the
constitution applies here too. Phase 1 already established the
language plumbing; Phase 2 is responsible for using it on every new
surface it ships, so the contract does not silently regress as
features accumulate.

**Independent Test**: A customer with Arabic in-app language adds an
address and sees every visible string and validation message in Arabic
with right-to-left layout. The same customer toggles to English,
re-enters the addresses screen, and sees every visible string and
message in English with left-to-right layout.

**Acceptance Scenarios**:

1. **Given** an Arabic-language customer, **When** they open any Phase 2
   surface (addresses list, add screen, edit screen, delete confirmation,
   in-use-by-order refusal dialog), **Then** every visible string is in
   Arabic and the layout direction is right-to-left.
2. **Given** the customer toggles the in-app language, **When** they
   re-enter the addresses surface, **Then** every visible string is
   rendered in the newly chosen language without an app restart.
3. **Given** validation errors occur on save (e.g., empty label),
   **When** they are displayed, **Then** they are rendered in the
   currently active language.

---

### Edge Cases

- **Reverse-geocoding lookup fails**: The provider is unreachable,
  returns no result for the dropped coordinates, or the device is
  offline. The street-name field stays as the customer last left it
  and the customer can type the value themselves; saving MUST still
  be possible. The platform does not block the save on the lookup
  outcome.
- **Customer drags the pin to a coordinate where the platform cannot
  deliver**: Phase 2 does not enforce a delivery-radius rule. The
  coordinate is stored as given. Per-chef serviceability is decided
  at cart/order time (Phases 5–6) based on the chef's own location
  and rules; the saved address is location-only metadata.
- **Customer edits an address that an in-flight order is using**:
  Phase 2 protects deletion only. Editing is allowed at any time; the
  order carries the address by reference, so changes propagate. This
  is an intentional v1 simplification, recorded in Assumptions.
- **Last remaining address with active orders**: If the customer has
  exactly one saved address and an active order is using it, deletion
  is refused (User Story 3). The customer is not pushed into an
  "addresses empty" state while an order is mid-flight.
- **Two addresses at very similar coordinates** (e.g., neighbouring
  buildings): The platform does not deduplicate. The customer's
  labels are how they are distinguished in the saved list.
- **Customer is soft-deleted while holding addresses**: Their
  addresses are not separately surfaced anywhere; the soft-delete on
  the parent account effectively hides them, consistent with the
  Foundation phase's soft-delete policy.
- **Reverse-geocoding provider rate-limits or charges per call**: The
  feature MUST degrade gracefully — a missed lookup is a silent
  no-op on the street-name field, never a blocker on save and never
  a visible error.
- **Validation: empty label or empty street-name text**: At least one
  human-readable identifier (label) is required so the customer can
  recognise the entry in the saved list. Empty street-name text is
  permitted (the coordinates are the source of truth for delivery),
  but the platform SHOULD encourage filling it for chef readability.

## Requirements *(mandatory)*

### Functional Requirements

#### Saving and shape of an address

- **FR-001**: An authenticated customer MUST be able to save delivery
  addresses to their account. Each saved address MUST carry, at
  minimum: a customer-chosen short label, a free-text street-name
  field, and a pair of geographic coordinates (latitude and
  longitude).
- **FR-002**: The platform MUST treat the geographic coordinates as
  the authoritative delivery target — the street-name text is a
  customer-facing readability aid, not a routing input. Subsequent
  features (cart, order placement, chef delivery view) MUST consume
  the coordinates rather than parse the text.
- **FR-003**: The customer-chosen label MUST be required (non-empty)
  on save. The street-name text MAY be empty but the platform SHOULD
  pre-fill it from a reverse-geocoding lookup of the chosen
  coordinates (FR-009) when one is available.
- **FR-004**: The platform MUST NOT impose a hard upper bound on the
  customer-chosen label or street-name length below industry-standard
  free-text limits. Excessively long values MAY be truncated with a
  clear validation error rather than silently accepted.

#### Map picker, geocoding, and location permission

- **FR-005**: The customer MUST be able to select the address
  coordinates by visually dragging a pin on a map view, in addition
  to (or instead of) typing a street name. The map pin's final
  coordinate is what is saved (FR-001).
- **FR-006**: When the customer drops or moves the pin, the platform
  SHOULD attempt a reverse-geocoding lookup of the new coordinates
  and pre-fill the street-name field with the result. A failed or
  empty lookup MUST NOT block the save flow and MUST NOT surface an
  error to the customer; the field simply stays as the customer last
  left it.
- **FR-007**: When the device's location permission is granted, the
  map picker SHOULD initially centre on the device's current
  location to minimise dragging. When the permission is denied or
  unavailable, the map MUST still open, centred on a sensible
  default region, and the customer MUST be able to drop a pin
  manually.
- **FR-008**: The customer MUST be able to manually edit the
  street-name text after a reverse-geocoding pre-fill. The platform
  MUST persist whatever text the customer last left in the field,
  not the geocoded result.

#### Reading and editing

- **FR-009**: An authenticated customer MUST be able to read the
  list of their own saved addresses. The list MUST be scoped to the
  requesting customer; an authenticated request MUST NOT expose any
  other customer's addresses, regardless of identifier guess.
- **FR-010**: An authenticated customer MUST be able to edit any
  saved address they own — any subset of {label, street-name text,
  coordinates}. Edits MUST be visible immediately in subsequent
  reads.
- **FR-011**: Editing an address that is referenced by an in-flight
  order is permitted in v1 (the order carries the address by
  reference). The platform MUST NOT block the edit; this is an
  intentional v1 simplification recorded in Assumptions.

#### Deletion and in-flight-order safety

- **FR-012**: An authenticated customer MUST be able to delete any
  saved address they own, subject to FR-013.
- **FR-013**: A delete request MUST be refused with a clear "address
  in use by an order in progress" error if and only if the address
  is referenced by any of the customer's orders whose status is
  *not* a terminal status (delivered or cancelled). The address
  MUST remain saved on a refusal, and the saved-list MUST continue
  to show it. The refusal message MUST give the customer a clear
  next step (e.g., a link to that order).
- **FR-014**: A delete request that is not refused under FR-013
  MUST remove the address from the customer's saved list and from
  any future address-selection surface. (The Foundation phase's
  soft-delete contract applies — the row is soft-deleted, not
  hard-deleted, but this is an internal data-model concern and not
  visible to the customer.)

#### Ownership and isolation

- **FR-015**: Every read, update, and delete on an address MUST
  verify that the address belongs to the authenticated customer. A
  request whose target address is owned by a different customer
  MUST be refused with the same response as if the target did not
  exist (no identifier-disclosure leak between accounts).
- **FR-016**: Soft-deleted addresses MUST NOT appear in any list,
  selection sheet, or read response, consistent with the Foundation
  phase's soft-delete policy.

#### Internationalization & layout direction

- **FR-017**: All Phase 2 customer-facing surfaces (addresses list,
  add-address screen, edit-address screen, delete confirmation, the
  in-use-by-order refusal dialog, every validation message) MUST be
  available in both English and Arabic, MUST honour the in-app
  language override established in Phase 1, and MUST render Arabic
  with right-to-left layout end-to-end. No string in this phase MAY
  be hardcoded in either language.

#### Input shape

- **FR-018**: All Phase 2 request shapes MUST inherit the
  Foundation phase's request-shape validation (extra fields beyond
  the documented shape are refused), consistent with FR-019 of the
  Phase 1 spec.

#### Observability of address events

- **FR-019**: Every significant address-mutation event MUST emit a
  structured application-log line so that support and the Phase 12
  security review have one uniform diagnostic surface across
  identity (Phase 1 FR-020) and addresses (this phase). The set of
  significant events is: create (success and validation rejection),
  update (success, validation rejection, and ownership refusal),
  delete (success, in-use-by-order refusal under FR-013, and
  ownership refusal). Each log line MUST carry: event type,
  outcome, timestamp, source IP, actor identifier (customer ID),
  and a correlation identifier that ties together the events of one
  request lifecycle, mirroring the Phase 1 FR-020 line shape.
- **FR-020**: The platform MUST NOT persist address-event records
  to the primary data store in Phase 2. Application logs are the
  canonical diagnostic surface, consistent with Phase 1 FR-021. A
  persisted audit-log entity, if and when introduced for any
  surface, MUST first amend the constitution's data-model section.
- **FR-021**: The customer's geographic coordinates (latitude and
  longitude) are personally-identifying location data and MUST NOT
  appear in any observability surface. Specifically: the FR-019
  log lines MUST NOT carry lat/lng; client-visible error responses
  (validation rejection, ownership refusal, in-use-by-order
  refusal under FR-013, and any non-2xx response from the address
  endpoints) MUST NOT echo lat/lng in their message or any nested
  payload; and any operator-facing diagnostic surface (Sentry-style
  error capture, request trace, etc.) MUST also redact lat/lng.
  The address identifier is the diagnostic handle; an authorized
  operator reads coordinates directly from the data store when
  actually debugging. This mirrors Phase 1's PII discipline that
  forbids plaintext passwords and OTP codes from appearing in
  logs.

### Key Entities *(include if feature involves data)*

Phase 2 introduces no new business entities — it materialises
behaviour for one entity the constitution already defines and the
Foundation phase already migrated:

- **Address**: A delivery target owned by a customer, identified by
  an internal identifier, carrying a short customer-chosen label, a
  free-text street-name, a pair of geographic coordinates (latitude,
  longitude), the owning-customer reference, and the standard
  timestamps including the Foundation's soft-delete marker. Phase 2
  is the first phase that creates or mutates rows in this entity.
  Later phases (cart, order placement, chef delivery view, admin
  order detail) read from it but do not own it.

The Phase 2 deletion-safety rule (FR-013) refers to the **Order**
entity and its status set; the contract is named here so that
Phase 6, which ships order placement and the order status machine,
MUST honour it when it lands. Phase 2 itself does not create or
read Order rows beyond what FR-013 requires for the delete check.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in customer who has never saved an address
  can add one — including dragging the map pin and saving — in
  under 60 seconds on a real device under normal network
  conditions. (User Story 1.)
- **SC-002**: A saved address persists across an app force-close
  and relaunch in 100% of cases, with the same label, street-name
  text, and coordinates the customer entered. (User Story 1,
  FR-001.)
- **SC-003**: When the map pin is dropped or moved, a
  reverse-geocoded street-name pre-fill appears within 2 seconds in
  the typical case where the lookup succeeds. A lookup failure
  (provider error, offline, no result) blocks neither the save flow
  nor surfaces a user-visible error in 100% of cases. (User
  Story 1, FR-006.)
- **SC-004**: A customer with two or more saved addresses can edit
  any one of them — including changing the pin — and see the new
  values in the saved list immediately and after a subsequent app
  relaunch, in 100% of cases. (User Story 2, FR-010.)
- **SC-005**: A delete attempt on an address that is referenced by
  an order in non-terminal status is refused with a clear in-use
  message in 100% of cases, and the address remains in the saved
  list. Verified end-to-end across the order lifecycle: refused
  while the order is in any non-terminal status, allowed once the
  order reaches a terminal status. (User Story 3, FR-013.)
- **SC-006**: An authenticated request for an address whose owner
  is a different customer is refused as if the target did not
  exist in 100% of cases. No response payload reveals that an
  address with that identifier exists. (User Story 2 acceptance
  scenario 5, FR-015.)
- **SC-007**: 100% of strings shown on the addresses list, the
  add-address screen, the edit-address screen, the delete
  confirmation, and the in-use-by-order refusal dialog are
  localised in both English and Arabic, and the Arabic version
  renders with right-to-left layout end-to-end on a real device.
  (User Story 4, FR-017.)
- **SC-008**: For each Phase 2 body-accepting endpoint (create
  address, update address) a request body containing one extra
  undocumented field is refused with a clear validation error in
  100% of cases. (FR-018.)
- **SC-009**: A delete attempt on a soft-deleted address (or one
  whose owning customer is soft-deleted) is refused as if the
  target did not exist in 100% of cases. The Foundation phase's
  soft-delete read filter is exercised end-to-end on this surface.
  (FR-016.)
- **SC-010**: When the device denies location permission, the
  add-address screen is still fully usable — the map opens, a pin
  can be dropped, and the address can be saved — in 100% of cases.
  The customer is never blocked by the missing permission. (User
  Story 1 acceptance scenario 6, FR-007.)
- **SC-011**: For every Phase 2 address-mutation event named in
  FR-019, exactly one structured log line is emitted, carrying
  event type, outcome, timestamp, source IP, actor identifier
  (when known), and a correlation identifier — and never carrying
  lat/lng or any other coordinate-derived value. Verified by
  inspecting the log stream during a scripted run that exercises
  each event type at least once. (FR-019, FR-021.)
- **SC-012**: For every Phase 2 client-visible error response
  (validation rejection, ownership refusal, in-use-by-order
  refusal under FR-013), the response body is inspected and MUST
  NOT contain lat/lng or any coordinate-derived value, in 100% of
  cases. (FR-021.)

## Assumptions

- The Foundation phase (Phase 0) and Phase 1 (Authentication and
  Users) are in place: a signed-in customer identity exists,
  request-shape validation and the soft-delete read filter are
  active, and the addresses table is migrated from the canonical
  schema.
- A map provider and a reverse-geocoding provider are in place by
  Phase 2's end. The choice of provider, the API key procurement
  and storage, and any per-platform restrictions (iOS/Android
  bundle ID, origin allow-lists) are planning-level decisions and
  not part of this specification. Substituting either provider
  MUST NOT invalidate this spec.
- **Client-side default address only in v1.** The backend's saved
  list is a flat set with no `isDefault` flag — the cart/checkout
  flow (Phase 5) is still free to choose which address to use on a
  per-order basis. As a UX convenience, the mobile client persists
  a single "default delivery address" preference *locally*
  (AsyncStorage, key `nafas.defaultAddressId`) and surfaces it on
  the Home delivery chip and on the addresses list (radio toggle +
  "Default" badge). This preference is device-local and is not
  synchronised across devices; first-ever saved address is
  auto-promoted, and a stale ID (referring to a deleted address)
  falls back to the first available. Promoting this to a
  server-side `isDefault` flag remains a future, additive change.
- **Address label is free text, not an enum.** The product does
  not prescribe a fixed set of labels (e.g., Home / Work / Other).
  Customers often have culturally specific labels ("الست الوالدة"
  / "mom's") that a small enum cannot capture. UI may suggest
  values but MUST NOT enforce them.
- **No geographic restriction on which coordinates may be saved.**
  The map picker may centre on Egypt by default, but the platform
  does not refuse a pin dropped outside that region. Per-chef
  delivery serviceability is a separate concern decided at order
  time (Phases 5–6) based on the chef's own rules.
- **Editing an address while an in-flight order references it is
  allowed in v1** (FR-011). The order carries the address by
  reference; changes propagate to in-flight orders. This trades a
  small risk (chef confused by a mid-cook address change) for a
  simpler v1 data model. A follow-up phase MAY revisit by either
  snapshotting the address into Order at placement time or
  extending the FR-013 in-use safety rule to PATCH; either change
  requires a constitution amendment because it touches the order
  data model.
- **Per-customer cap on saved addresses is not enforced in v1.** A
  reasonable upper bound (e.g., 20) MAY be applied at the
  implementation layer if abuse is observed; the spec does not
  require one.
- The address-selection sheet at checkout is *introduced* by
  Phase 2's data shape but *wired into the checkout flow* by
  Phase 5. Phase 2 ships the saved-list reads and the data shape
  both surfaces share.
- Performance targets in Success Criteria assume a typical mobile
  network connection and a recent mobile device, consistent with
  the project's baseline device/network expectations.
