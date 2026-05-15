# Feature Specification: Categories, Chef Application & Verification

**Feature Branch**: `004-phase-3-chefs`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "Read phase 3 from docs/implementation-plan.md - and according to the best practices of Github's speckit create the third spec."

## Clarifications

### Session 2026-05-15

- Q: What are the allowed file types and maximum size for the chef logo and banner image uploads (FR-022)? → A: JPEG / PNG / WebP, 5 MB maximum per file — the banner renders full-width on the chef profile and the discovery card, so it warrants a larger budget than the Phase 4 item-image rule (3 MB), while the whitelist excludes formats that double as XSS surfaces (SVG, HTML) and excludes executables outright.
- Q: What default radius does the chef-discovery surface apply when the customer's coordinates are known but no explicit radius is supplied, and what hard ceiling caps the worst-case query (FR-016)? → A: Default 15 km, hard cap 50 km — 15 km covers most Cairo / Alexandria neighbourhoods a chef would actually deliver to, and 50 km gives a customer on the periphery headroom to widen while still bounding the worst-case scan and preventing pathological "Cairo customer matched to an Aswan chef" results.
- Q: After an application is rejected, how soon may the same customer submit a fresh application (FR-006)? → A: 24-hour cooldown — long enough that admin queues cannot be DOS'd by automated resubmits, short enough that a legitimate customer who reads the rejection feedback overnight can address it and re-apply the next morning. A submission inside the cooldown window is refused with a clear "you may re-apply after [timestamp]" response, and the refusal is observable on the FR-038 event stream as a distinct outcome.
- Q: When no radius filter applies (because the customer's coordinates are unavailable, or because they explicitly cleared the filter), what secondary sort orders chefs after the open-first split (FR-016)? → A: Verified-newest-first — chefs who were verified most recently surface first within both the "open" and "closed" groups. A newly verified chef gets immediate top-of-list visibility (compounding well during the marketplace's early phases when there are few chefs and even fewer reviews); switching to a rating-based sort once a sufficient rated-chef corpus exists remains a future, additive change.
- Q: What is the admin's recourse path when a chef row needs to be revoked — wrong applicant verified, or a verified chef misbehaving after the fact (gap between FR-009 verification and the edge-case "chef is soft-deleted" bullet)? → A: An admin can soft-delete the chef row; the underlying user's role is atomically reverted from chef back to customer in the same operation. The chef row stays in the data store (soft-delete preserves history per constitution principle IV), the public surface stops returning the row immediately, and the user can sign in as a customer again. After the FR-006 24-hour cooldown elapses from the revocation moment, the user MAY re-apply if appropriate. This avoids the "user.role=chef but chef row is null" limbo that would otherwise confuse the FR-030 navigation switch.

## Overview *(non-mandatory context)*

Phase 3 turns the platform from "identities and delivery targets" into an
actual marketplace. Until Phase 3 lands, Nafas has signed-in users and saved
addresses but no supply side: there is no one to order from, no food
catalogue to browse, and no way for the platform to police who is allowed
to sell. Every later phase that needs a chef — menus and items (Phase 4),
cart (Phase 5), orders (Phase 6), reviews (Phase 7), the chef dashboard
(Phase 9), the admin chef-management surface (Phase 11) — is blocked until
Phase 3 ships.

The deliverable has four parts that ship together because each is
useless without the others:

1. **A food-category catalogue** the platform controls — Koshary, Mahshi,
   Molokheya, Hawawshi, Sweets, Feteer, Fattah, Other — so that chefs can
   tag their menus to something canonical and customers can browse by
   cuisine type instead of by free-text search.
2. **A path for a signed-in customer to apply to become a chef** — they
   declare a public chef name, a short bio, the kitchen's coordinates
   (via the same map picker shipped in Phase 2), and a minimum order
   price. The application sits in a pending state, invisible to the
   public surface, until an admin reviews it.
3. **An admin verification workflow** — a web-only surface where the
   admin sees pending applications, approves them (which is the moment
   the user's role changes from customer to chef and the chef row goes
   public on the discovery surface) or rejects them with a reason. This
   is a server-authoritative role transition (constitution principle II);
   no client claim flips a customer into a chef.
4. **A public chef-discovery surface** for any signed-in customer —
   browse the list of verified chefs (open ones surfaced first), filter
   by category and by geographic proximity, search by name, and open a
   chef's public profile to read their bio and rating.

A secondary deliverable is **the customer ↔ chef navigation switch**:
once a customer is verified as a chef, the next time they sign in they
land on the chef tab bar (placeholders only in Phase 3 — Dashboard,
Orders, Menu, Stats, Schedule, Profile) rather than the customer tab bar
(Home, Explore, Favorites, Orders, Profile, also placeholders). The
behind-the-scenes navigation routing is a Phase 3 deliverable; the
content of each placeholder tab is filled in by later phases.

If any of these is missing, the platform either has no chefs (no
application path), has chefs that no one verified (no admin surface),
has chefs no one can find (no discovery surface), or has menu items that
cannot be categorised (no catalogue).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A signed-in customer applies to become a chef (Priority: P1)

A signed-in customer who has been ordering for a few weeks decides to
sell their own koshary. From their profile they tap "become a chef",
land on an application form, type a public chef name ("Umm Yara's
Kitchen"), write a short bio, drag a pin on a map to mark their
kitchen's location, type a minimum order price, and submit. The
application is accepted into a pending queue: the customer sees a clear
"your application is under review" holding screen, cannot yet use any
chef-side feature, and their customer-side experience is unchanged
while they wait.

**Why this priority**: Without an application path, no chef ever
enters the platform. This is the smallest slice of Phase 3 that
delivers value on its own — a customer can declare their intent to
sell and the platform captures everything an admin needs to decide.

**Independent Test**: A signed-in customer who has never applied
opens the apply screen, fills the required fields including dragging
the map pin, submits, and immediately sees the "under review" holding
screen. Reopening the app later still shows the holding screen.
Listing verified chefs from a second customer's account does NOT
return the applicant.

**Acceptance Scenarios**:

1. **Given** a signed-in customer who has never applied, **When** they
   open the apply screen and submit a complete application (chef name,
   bio, pinned coordinates, minimum order price), **Then** the
   application is captured in a pending state, the customer is shown a
   "your application is under review" screen, and no public surface
   returns the applicant.
2. **Given** a customer with a pending application, **When** they
   re-open the app at any later time, **Then** they continue to land on
   the "under review" holding screen rather than the apply form or the
   chef tab bar.
3. **Given** the customer is on the apply screen, **When** they drag
   the map pin to a new location, **Then** the platform behaves
   consistently with the Phase 2 map picker — reverse-geocoding may
   pre-fill an associated street-name field, and a failed lookup does
   not block the submit.
4. **Given** any required application field is missing or invalid
   (empty chef name, missing coordinates, non-positive minimum order
   price), **When** the customer attempts to submit, **Then** the
   submit is refused with a clear per-field validation message and the
   application is not captured.
5. **Given** a customer has been rejected on a prior application,
   **When** they open the apply screen again, **Then** they MAY submit
   a new application (rejection is not a permanent ban — the admin
   chose a reason; the customer is free to address it and re-apply).

---

### User Story 2 - An admin verifies a pending chef application (Priority: P1)

An admin signs in to the web dashboard, opens the chef-applications
queue, sees the customer's pending application with the declared name,
bio, kitchen coordinates (on a small map preview), and minimum order
price. They tap "verify". From that moment, the chef row is visible on
the public discovery surface, the applicant's role flips from customer
to chef, and the next time the applicant opens the mobile app they land
on the chef tab bar (placeholders only in Phase 3, content filled in by
later phases). The applicant also receives a notification telling them
they are verified.

**Why this priority**: Equally critical to user story 1. A platform
where applications pile up but nobody can approve them is no better
than a platform with no applications at all. This is the
server-authoritative gate (constitution principle II) on which every
later supply-side feature depends.

**Independent Test**: An admin opens the applications queue,
verifies a single pending application, then signs in as the applicant
on a second device. The applicant is taken to the chef tab bar (not
the customer tab bar) and a chef-side notification confirming
verification is present. From a third unrelated customer account, the
public discovery list now contains the newly verified chef.

**Acceptance Scenarios**:

1. **Given** an admin is signed in to the admin dashboard, **When**
   they open the chef-applications queue, **Then** they see every
   pending application (and only pending ones — already verified and
   already rejected applications do NOT appear in this queue),
   ordered oldest-first so the backlog drains in FIFO order.
2. **Given** the admin verifies a pending application, **When** the
   action completes, **Then**: (a) the applicant's role transitions
   from customer to chef on the server, (b) the chef row becomes
   visible on the public discovery surface, (c) the applicant
   receives a notification confirming verification in their current
   in-app language, and (d) the application no longer appears in the
   pending queue.
3. **Given** the applicant is signed in to mobile on another device
   while they were verified, **When** they bring the app to the
   foreground and the platform re-establishes the session, **Then**
   the next navigation resolves to the chef tab bar rather than the
   customer tab bar — without requiring the applicant to fully sign
   out and back in.
4. **Given** the admin rejects a pending application with a written
   reason, **When** the action completes, **Then**: (a) the
   application is removed from the pending queue, (b) the customer's
   role remains unchanged, (c) the chef row is NOT exposed on any
   public surface, and (d) the customer is notified with the rejection
   reason (the reason is shown to the customer; the customer is free
   to apply again).
5. **Given** a non-admin user obtains a verification or rejection
   request URL, **When** they attempt the action, **Then** the
   platform refuses regardless of the request's payload — role
   transitions are enforced server-side, never by a client claim.

---

### User Story 3 - A signed-in customer discovers verified chefs (Priority: P1)

A signed-in customer opens the explore surface and sees a list of
verified chefs near them, with currently-open kitchens surfaced first.
They tap a category chip ("Koshary"); the list filters to chefs whose
menus tag that category. They type "Umm" into the search; the list
narrows to chefs whose public name or bio contains it. They open a
chef's public profile and see the chef's name, banner image, logo,
average rating, total reviews so far, bio, and the chef's category
chips. The list and profile read consistently for any signed-in
customer; rows belonging to unverified or soft-deleted chefs never
appear.

**Why this priority**: The customer-facing reason Phase 3 exists. A
verified supply side that no customer can browse is worthless. This
slice is independent of user stories 1 and 2 in the sense that, given
test data seeded by those flows, the discovery surface can be
demonstrated and tested on its own.

**Independent Test**: With at least three verified chefs seeded (one
open, one closed, one in a different category), a signed-in customer
opens the discovery surface and verifies: (a) the list contains all
three; (b) the open chef is surfaced before the closed one; (c)
filtering by a category that only one chef carries returns exactly
that chef; (d) searching by a substring of a chef's name returns the
matching chef; (e) opening a chef shows the chef's full public
profile.

**Acceptance Scenarios**:

1. **Given** a signed-in customer, **When** they read the chef
   discovery list, **Then** every chef returned is verified, is not
   soft-deleted, and the response NEVER contains a chef whose
   application is pending or rejected.
2. **Given** the customer selects a category filter, **When** the
   list re-renders, **Then** it contains only chefs whose menus
   include at least one item in that category (a chef with no menus
   in that category is excluded).
3. **Given** the customer types a search term, **When** the list
   re-renders, **Then** it contains only chefs whose public name or
   bio contains that term (case-insensitive). Empty term is treated
   as no search filter.
4. **Given** the customer's location is known and a radius filter is
   active, **When** the list re-renders, **Then** chefs are returned
   in distance order from the customer's coordinates (closest first)
   and the list excludes chefs outside the requested radius.
5. **Given** more chefs match than fit in one page, **When** the
   customer reaches the end of the list, **Then** the platform
   returns the next page on demand (cursor or page-number — exact
   shape is a planning decision).
6. **Given** the customer opens a chef's public profile, **Then**
   they see at minimum: the chef's public name, banner image, logo,
   bio, current rating, total reviews so far, and the chef's
   currently-open / currently-closed state.

---

### User Story 4 - A verified chef manages their public profile (Priority: P2)

A verified chef opens the chef profile screen, toggles the kitchen
from open to closed because they are out of ingredients today, then
later edits their public name, bio, and minimum order price, and
uploads a new logo and a new banner image. The changes are visible to
customers on the public discovery surface immediately. While the
kitchen is closed, the chef still appears in the discovery list but
is clearly marked closed and the platform does not place orders
through them (Phase 6 enforces the order-time check).

**Why this priority**: Critical for a working marketplace but
independent of getting a first chef onto the platform. A chef who
cannot toggle "closed" cannot run their kitchen sustainably; a chef
who cannot edit their bio cannot fix typos or seasonal updates. We
ship the application + verification + discovery slices first because
without those there is no chef profile to manage at all.

**Independent Test**: A verified chef toggles open ↔ closed and
edits each of {public name, bio, minimum order price, logo, banner}.
A second customer signed in elsewhere refreshes the discovery
surface and sees the chef's new values; the open/closed state is
reflected in their profile and (per the sort rule from user story 3)
in the discovery list ordering.

**Acceptance Scenarios**:

1. **Given** a verified chef, **When** they toggle their kitchen
   between open and closed, **Then** the change is reflected on the
   public discovery surface and on the chef's public profile within
   the next read by a customer (no app restart required on the
   customer side beyond a fresh fetch of the surface).
2. **Given** a verified chef edits any subset of {public name, bio,
   minimum order price}, **When** they submit, **Then** the stored
   values update and subsequent reads by customers reflect them.
3. **Given** a verified chef uploads a new logo or a new banner
   image, **When** the upload completes, **Then** the chef's public
   profile and the discovery list render the new image; the
   previously-used image (default placeholder or prior upload) is no
   longer visible on the public surface.
4. **Given** a customer (not a chef) obtains a chef-profile-mutation
   request URL, **When** they attempt the request, **Then** the
   platform refuses — chef-profile edits are restricted to the chef
   who owns the row.
5. **Given** an admin force-toggles a chef's open / closed state
   from the admin dashboard (a Phase 11 capability whose contract
   Phase 3 must respect), **When** the action completes, **Then**
   the chef's public surface reflects the change consistently with a
   self-toggle by the chef.

---

### User Story 5 - An admin curates the food-category catalogue (Priority: P2)

An admin opens the categories surface on the web dashboard. They see
the eight seeded categories (Koshary, Mahshi, Molokheya, Hawawshi,
Sweets, Feteer, Fattah, Other) in their current display order, each
with its English and Arabic display name. They add a new category
("Grills"), edit an existing display name, and reorder the list so
that "Sweets" appears before "Hawawshi". The customer-facing
discovery surface reflects the changes on the next read.

**Why this priority**: The catalogue ships pre-seeded so customers
can use the marketplace from day one even if no admin ever touches
it. Admin curation is a maintenance capability — important, but not
a launch blocker the way application / verification / discovery are.

**Independent Test**: An admin adds one category, edits one display
name, soft-deletes one category, and reorders the list. A second
customer signed in on mobile refreshes the discovery surface's
category chips and sees the changes applied in the new order. The
soft-deleted category no longer appears.

**Acceptance Scenarios**:

1. **Given** a fresh deployment with the eight seeded categories,
   **When** a signed-in customer reads the categories, **Then** they
   see all eight in the seeded display order, each with both
   English and Arabic display names populated.
2. **Given** an admin creates a new category with an English name,
   an Arabic name, a display order value, and an icon identifier,
   **When** the action completes, **Then** the new category appears
   in the customer-facing list on the next read.
3. **Given** an admin soft-deletes a category, **When** the action
   completes, **Then** the customer-facing list no longer returns
   it. Existing menus that already reference the soft-deleted
   category are not retroactively rewritten (Phase 4 menu surface
   handles its own filtering rules).
4. **Given** an admin reorders the categories (bulk reorder), **When**
   the action completes, **Then** the customer-facing list reflects
   the new order on the next read. The reorder is atomic — a partial
   reorder that updates some rows but not others is not visible to
   any reader.
5. **Given** a non-admin user attempts any category mutation,
   **When** the platform receives the request, **Then** it is
   refused — category curation is admin-only.

---

### User Story 6 - The Phase 3 surfaces are bilingual with proper layout direction (Priority: P3)

A customer using the app in Arabic opens the apply-to-be-a-chef
screen, the "under review" holding screen, the chef discovery
surface, a chef's public profile, and (once verified) the chef tab
bar and chef profile editor. Every visible string — labels, CTAs,
validation messages, rejection-reason copy, status pills, category
chip text, notification body shown in-app — is rendered in Arabic
with right-to-left layout. They toggle the language to English; the
same surfaces re-render in English with left-to-right layout. The
admin dashboard surfaces ship in English (admins are an internal
audience; bilingual admin UI is out of scope for v1) but the
customer-shown reasons (the rejection reason chosen by the admin)
are stored as free-text and rendered to the customer as written.

**Why this priority**: Lower priority than the marketplace
behaviour itself, but the bilingual + RTL contract from the
constitution applies on every new surface. Phase 1 and Phase 2 set
the precedent; Phase 3 introduces the largest single batch of new
surfaces in the project so far, so explicitly committing to bilingual
parity here prevents the contract from silently regressing as the
project's surface area grows.

**Independent Test**: A customer with Arabic in-app language
exercises each Phase 3 customer-facing surface (apply, holding,
discovery list, category chips, search box, chef profile, chef tab
bar after verification, chef-profile editor, kitchen open/closed
toggle, image upload dialog, validation errors). Every visible string
is Arabic with right-to-left layout. Toggling to English and
re-entering each surface produces every string in English with
left-to-right layout.

**Acceptance Scenarios**:

1. **Given** an Arabic-language customer, **When** they open any
   Phase 3 customer-facing mobile surface, **Then** every visible
   string is in Arabic and the layout direction is right-to-left.
2. **Given** the customer toggles the in-app language, **When**
   they re-enter the surface, **Then** every visible string is
   rendered in the newly chosen language without an app restart.
3. **Given** a verification or rejection notification is delivered
   to the customer / chef, **When** the client renders it, **Then**
   the title and body are rendered in the recipient's current
   in-app language (notification payloads carry both locales so the
   client can render without a server round-trip, consistent with
   constitution principle I).
4. **Given** seeded category display names exist in both English
   and Arabic, **When** the customer reads them on the discovery
   surface, **Then** the displayed name matches their current
   in-app language.

---

### Edge Cases

- **A customer attempts to apply while a previous application is
  still pending.** The platform refuses the second submission with
  a clear "you already have an application under review" message
  and keeps the original application unchanged.
- **A customer attempts to apply while already verified as a chef.**
  The apply screen is not reachable from the chef-side navigation,
  but if the platform receives such a request anyway it refuses
  with a clear "you are already a chef" message.
- **A customer was rejected and submits a fresh application with
  different details.** If at least 24 hours have elapsed since
  the rejection (FR-006), a fresh pending application is
  captured; the rejection history is preserved on the prior row
  (an admin can see it on the queue if helpful, but the new
  application is treated as a new evaluation, not a re-open of
  the old one). If the cooldown window has not yet elapsed, the
  submission is refused with the earliest-resubmit timestamp
  and no new application is captured.
- **An admin tries to verify an application that was already
  verified or rejected by another admin moments earlier.** The
  platform returns a clear "this application is no longer pending"
  result rather than double-flipping the role or sending duplicate
  notifications.
- **A chef is revoked by an admin (FR-012a).** Their chef row
  is soft-deleted and stops appearing on every public surface
  (discovery list, profile detail, category filter, geographic
  radius filter, search). The underlying user's role is
  atomically reverted from chef back to customer so they can
  continue using the platform on the customer side (FR-030 nav
  switch); the user is notified with the admin's revocation
  reason. Existing orders that reference the chef remain
  navigable by the customer who placed them; Phase 6 handles
  that read path. The user MAY re-apply once the FR-012b
  24-hour cooldown elapses from the revocation moment.
  Separately soft-deleting the underlying user account
  (turning them off the platform entirely) is a Phase 11
  admin-user-management capability and is NOT bundled into
  the FR-012a revocation operation.
- **A chef has no menus yet (just verified, hasn't built their
  catalogue).** They appear on the discovery list (so customers
  see new chefs landing) but a category filter that requires a
  chef to carry at least one item in that category will exclude
  them. The chef profile detail makes the empty-menu state visible
  to the customer.
- **A chef uploads an image of the wrong type or too large.** The
  upload is refused with a clear validation message; the chef's
  previous image (default placeholder or earlier upload) is
  unchanged.
- **The map provider is unreachable when the customer is applying
  (chef-coordinate picker).** Consistent with the Phase 2 map
  picker contract — reverse-geocoding pre-fill is a nice-to-have
  and a failure on that lookup does not block the apply submit.
  However, the coordinate itself is a required field — if the
  customer cannot drop a pin at all (map fails to load), the
  apply screen MUST surface a clear retry path rather than allow
  a submit without coordinates.
- **Two customers submit the same chef name.** Chef public names
  are not required to be globally unique in v1. Customers
  distinguish chefs by their location and bio. (A future phase
  MAY introduce a uniqueness rule with handle suggestions if
  user-perceived confusion is observed.)
- **A category that is referenced by an existing menu is
  soft-deleted by the admin.** Existing menus retain the
  reference for audit purposes but the category no longer
  appears in customer-facing filters. Phase 4 (menus) is
  responsible for any chef-side surfacing of "your menu
  references a removed category".

## Requirements *(mandatory)*

### Functional Requirements

#### Chef application

- **FR-001**: A signed-in customer MUST be able to submit one
  application to become a chef. Each application MUST carry, at
  minimum: a public chef name, a short bio, a pair of geographic
  coordinates for the kitchen, and a minimum order price. The
  customer's authenticated identity is the applicant — no
  client-supplied user identifier is trusted.
- **FR-002**: The chef name and the kitchen coordinates MUST be
  required (non-empty) on submit. The minimum order price MUST be
  a positive value. The bio MUST be required and constrained to
  industry-standard free-text limits; values exceeding the limit
  MAY be refused with a clear validation error rather than
  silently truncated.
- **FR-003**: The platform MUST capture the application in a
  pending state on submit. A pending application MUST NOT be
  visible on any public surface (discovery list, profile detail,
  category filter, search, geographic radius). Until an admin
  acts on it, the applicant's role MUST remain customer.
- **FR-004**: A customer with a pending application MUST be
  refused a second submission with a clear "you already have an
  application under review" response; the existing pending
  application is preserved.
- **FR-005**: A customer who is already verified as a chef MUST
  be refused an apply submission with a clear "you are already a
  chef" response.
- **FR-006**: A customer whose application was rejected MAY
  submit a new application **once at least 24 hours have
  elapsed since the rejection**. Each new submission is
  treated as a fresh evaluation; the rejection-history record
  on the prior application is preserved. A submission that
  arrives inside the 24-hour cooldown MUST be refused with a
  clear "you may re-apply after [timestamp]" response that
  names the earliest moment the customer may resubmit. The
  refusal MUST NOT create a new pending application and MUST
  emit an FR-038 event with its own distinct outcome
  (`rejected_cooldown_in_effect`) so abusive resubmit loops
  are visible to operators.
- **FR-007**: Submitting an application MUST capture the
  applicant's kitchen coordinates exactly as the customer drops
  the pin on the map picker. The platform MUST NOT silently round,
  re-resolve, or otherwise transform the coordinates on submit;
  any reverse-geocoded street-name pre-fill is a customer-facing
  readability aid and not the authoritative target. (Constitution
  principle II: the server stores what was sent; only a future
  delivery-radius rule, which is out of scope for v1, may
  ever transform it.)

#### Admin verification workflow

- **FR-008**: An admin MUST be able to read the list of pending
  chef applications. The list MUST include every pending
  application and MUST NOT include applications that have already
  been verified or rejected. The platform SHOULD return them in
  FIFO order (oldest pending first) so the backlog drains
  predictably.
- **FR-009**: An admin MUST be able to verify a pending
  application. Verification is atomic and server-side: in one
  operation the platform (a) flips the underlying user's role
  from customer to chef, (b) marks the chef row verified so it
  becomes visible on the public discovery surface, (c) creates a
  notification record for the applicant in both English and
  Arabic, and (d) dispatches a push notification when the
  applicant has a registered push token. A failure to dispatch
  the push MUST NOT block the role transition or the notification
  record — the transition is the source of truth; the push is a
  best-effort delivery.
- **FR-010**: An admin MUST be able to reject a pending
  application with a written reason. Rejection is atomic and
  server-side: (a) the application leaves the pending queue, (b)
  the underlying user's role does NOT change, (c) a notification
  carrying the rejection reason is created in both English and
  Arabic, and (d) a push is dispatched when the applicant has a
  registered push token, with the same best-effort discipline as
  FR-009.
- **FR-011**: Verify and reject MUST be reserved to the admin
  role on the server side. A non-admin authenticated user who
  obtains an action URL MUST be refused regardless of the request
  payload. Role transitions are never client-claimed
  (constitution principle II).
- **FR-012**: An action against an application that is no longer
  pending (because another admin already acted on it, or because
  the row was soft-deleted) MUST be refused with a clear "this
  application is no longer pending" response — the platform MUST
  NOT double-flip the role or dispatch a duplicate notification.

#### Admin revocation of a verified chef

- **FR-012a**: An admin MUST be able to revoke a verified chef.
  Revocation is atomic and server-side: in one operation the
  platform (a) soft-deletes the chef row so it disappears from
  every public surface (discovery list, profile detail,
  category filter, geographic radius filter, search), (b)
  flips the underlying user's role from chef back to customer,
  (c) creates a notification record for the affected user in
  both English and Arabic explaining the revocation (a written
  reason field on the request is REQUIRED and the reason is
  surfaced to the user verbatim, mirroring the FR-010 rejection
  contract), and (d) dispatches a push notification when the
  user has a registered push token, with the same best-effort
  discipline as FR-009. The chef row remains in the data store
  for audit purposes (constitution principle IV) — it is
  soft-deleted, not hard-deleted.
- **FR-012b**: Following revocation, the affected user MAY
  submit a fresh chef application only after the FR-006 24-hour
  cooldown elapses, counted from the revocation timestamp.
  Inside the cooldown, the apply-submit endpoint refuses with
  the same response shape as a post-rejection cooldown refusal,
  and the FR-038 event stream records the refusal with the
  same `rejected_cooldown_in_effect` outcome.
- **FR-012c**: Revocation MUST be reserved to the admin role on
  the server side. A non-admin authenticated user who obtains a
  revocation URL MUST be refused regardless of the request
  payload, consistent with FR-011.

#### Public chef discovery

- **FR-013**: A signed-in customer MUST be able to read a
  paginated list of verified chefs. The list MUST exclude every
  chef whose application is pending, every chef who has been
  rejected, and every chef whose row is soft-deleted. The list
  MUST surface currently-open chefs ahead of currently-closed
  chefs.
- **FR-014**: The list MUST support filtering by category. A
  chef is "in" a category if at least one of their (active,
  non-soft-deleted) menus carries that category. A chef with no
  menus in the requested category MUST be excluded from the
  filtered result.
- **FR-015**: The list MUST support a text search across the
  chef's public name and bio (case-insensitive substring match).
  An empty search term MUST be treated as no search filter.
- **FR-016**: The list MUST support a geographic radius filter
  centred on a caller-supplied coordinate. When the customer's
  coordinates are known and no explicit radius is supplied,
  the platform MUST apply a default radius of **15 km**.
  Regardless of the caller's request, the platform MUST cap
  the effective radius at **50 km** and MUST refuse or silently
  clamp any larger value (refusal is preferred so the client
  cannot quietly send unbounded queries). When the radius
  filter is active, the result MUST be sorted by distance
  (closest first) and MUST exclude chefs outside the effective
  radius. When the customer's coordinates are NOT available
  (location permission denied, no last-known location, or the
  caller explicitly cleared the radius filter), the list omits
  the radius filter entirely and the sort order is **open-first
  then verified-newest-first within each open / closed group**
  (most recently verified chef surfaces first). The sort MUST
  be deterministic given a fixed snapshot of the data — two
  reads against the same chef set return the same ordering.
- **FR-017**: The list MUST be paginated. The default page size
  is a sane mobile-list default (e.g., 20–30). Reaching the end
  of one page MUST return the next page on demand.
- **FR-018**: A signed-in customer MUST be able to read a
  single chef's public profile by identifier. The profile MUST
  include at minimum: chef public name, banner image URL, logo
  image URL, bio, current open/closed state, current rating
  (computed from delivered-order reviews — wired by Phase 7),
  total reviews-so-far count, and the list of categories the
  chef currently has at least one menu in. The profile MUST be
  refused (as if the identifier did not exist) if the target
  chef is not verified or has been soft-deleted (FR-013).
- **FR-019**: A signed-in customer MUST be able to read the
  reviews for a chef paginated. (Reviews themselves are written
  in Phase 7 — Phase 3 ships the read path so it exists from the
  moment the profile does.)

#### Chef-managed public profile (post-verification)

- **FR-020**: A verified chef MUST be able to toggle their
  kitchen between open and closed at any time. The change MUST be
  reflected on every public surface (discovery list ordering,
  profile detail's open/closed indicator) on the next read.
- **FR-021**: A verified chef MUST be able to edit any subset of
  {public name, bio, minimum order price, kitchen coordinates}
  on their own row. Edits are visible on the next read.
- **FR-022**: A verified chef MUST be able to replace their
  logo image and their banner image with uploaded files. The
  platform MUST accept only JPEG, PNG, and WebP files, MUST
  refuse files larger than 5 MB, and MUST refuse with a clear
  validation error on any other file-type or size violation.
  The whitelist deliberately excludes formats that double as
  XSS surfaces (SVG, HTML) and excludes executables outright.
  A successful upload MUST update the chef's public profile
  and discovery card to render the new image; the previously-
  stored image (default placeholder or prior upload) is no
  longer surfaced.
- **FR-023**: At chef creation (application time), the chef's
  logo and banner image URLs MUST point at a platform-controlled
  default placeholder so every chef row has a non-broken image
  from the moment they become visible on the public surface,
  even if they never upload anything.
- **FR-024**: Every chef-profile mutation (toggle open, edit
  fields, replace logo, replace banner) MUST verify that the
  authenticated caller owns the chef row. A request whose target
  chef is owned by a different user MUST be refused with the
  same response as if the target did not exist (no identifier-
  disclosure leak between accounts).

#### Categories

- **FR-025**: The platform MUST ship with a pre-seeded set of
  food categories — Koshary, Mahshi, Molokheya, Hawawshi,
  Sweets, Feteer, Fattah, Other — each with: an English display
  name, an Arabic display name, a display-order value, and an
  icon identifier. A fresh deployment MUST be usable by
  customers without further admin action.
- **FR-026**: A signed-in customer MUST be able to read the
  active (non-soft-deleted) list of categories ordered by the
  configured display order. The response MUST carry both English
  and Arabic display names so the client can render in the
  customer's current language without a round-trip
  (constitution principle I).
- **FR-027**: An admin MUST be able to create, edit, soft-delete,
  and bulk-reorder categories. A bulk reorder MUST be atomic —
  either every category in the requested ordering moves to its
  new position, or none does; a partially-applied reorder MUST
  NOT be visible to any reader.
- **FR-028**: Every category mutation MUST be restricted to the
  admin role on the server side. A non-admin authenticated user
  who obtains a mutation URL MUST be refused.
- **FR-029**: When a category that is referenced by an existing
  menu is soft-deleted, the platform MUST preserve the
  reference on the menu (the historical link is intentional
  audit data, consistent with the soft-delete principle) but MUST
  exclude the soft-deleted category from every customer-facing
  filter / chip list.

#### Customer ↔ chef navigation switch

- **FR-030**: When a user's role transitions in either
  direction — from customer to chef (via FR-009) or from chef
  back to customer (via FR-012a revocation) — the platform
  MUST resolve the next mobile navigation to the tab bar that
  matches the new role, rather than the one that matched the
  prior role. The transition MUST NOT require the user to
  fully sign out and back in; bringing the app to the
  foreground and re-establishing the session MUST be enough.
  A revoked user MUST land back on the customer tab bar (not
  on an in-limbo "your chef profile is unavailable" screen).
- **FR-031**: A customer with a pending chef application MUST
  land on a "your application is under review" holding screen
  rather than the apply form (no re-submit) or the chef tab bar
  (not yet verified) for the duration of the pending state.

#### Ownership and isolation

- **FR-032**: Every chef-profile mutation endpoint, every
  category mutation endpoint, and every admin verification /
  rejection endpoint MUST enforce its role requirement on the
  server side. Client-supplied role claims are never trusted
  (constitution principle II).
- **FR-033**: Soft-deleted chefs, soft-deleted categories, and
  soft-deleted users MUST NOT appear in any list, profile read,
  filter, or admin queue, consistent with the Foundation phase's
  soft-delete policy.

#### Internationalization & layout direction

- **FR-034**: Every Phase 3 customer-facing mobile surface
  (apply form, "under review" holding screen, chef discovery
  list, chef profile detail, chef-managed profile editor,
  open/closed toggle, image upload dialog, validation messages,
  empty states) MUST be available in both English and Arabic,
  MUST honour the in-app language override established in
  Phase 1, and MUST render Arabic with right-to-left layout
  end-to-end. No string in this phase MAY be hardcoded in
  either language.
- **FR-035**: Notifications dispatched in this phase (chef
  verified, chef rejected, plus any chef-side notification
  scaffolding required for later phases) MUST carry both
  English and Arabic title/body in their payload so the
  recipient client can render in the recipient's preferred
  language without a server round-trip (constitution
  principle I).
- **FR-036**: The admin web dashboard surfaces shipped in this
  phase (chef applications queue, categories curation) MAY ship
  in English only — the admin audience is internal. Free-text
  fields entered by the admin that are later shown to a
  customer (e.g., a chef-application rejection reason) MUST be
  stored as the admin entered them and rendered to the
  customer as-is; the platform does not translate admin-typed
  text.

#### Input shape

- **FR-037**: Every Phase 3 request shape MUST inherit the
  Foundation phase's request-shape validation: extra fields
  beyond the documented shape are refused with a clear
  validation error, consistent with the Phase 1 and Phase 2
  contracts.

#### Observability of chef / category events

- **FR-038**: Every significant chef / category event MUST emit
  a structured application-log line so that support and the
  Phase 12 security review have one uniform diagnostic surface
  across identity (Phase 1), addresses (Phase 2), and the
  marketplace's supply side (this phase). The set of
  significant events is: chef application submitted (success,
  validation rejection, and post-rejection / post-revocation
  cooldown refusal with outcome `rejected_cooldown_in_effect`
  per FR-006 / FR-012b), chef verified by admin, chef rejected
  by admin, chef revoked by admin (per FR-012a), chef-profile
  updated (success, validation rejection, ownership refusal),
  kitchen open/closed toggled, logo / banner uploaded (success
  and refusal — including file-type and 5 MB size refusals per
  FR-022), and category created / updated / soft-deleted /
  reordered (success and refusal). Each log line MUST carry:
  event type, outcome,
  timestamp, source IP, actor identifier, target identifier
  (chef ID, category ID, application ID — whichever applies),
  and a correlation identifier that ties together the events of
  one request lifecycle, mirroring the Phase 1 FR-020 and
  Phase 2 FR-019 line shape.
- **FR-039**: The chef's kitchen coordinates (latitude and
  longitude) are PII-adjacent location data and MUST NOT appear
  in any observability surface, mirroring the Phase 2 FR-021
  contract for customer address coordinates. Specifically: the
  FR-038 log lines MUST NOT carry kitchen lat/lng; client-visible
  error responses from any Phase 3 endpoint MUST NOT echo
  kitchen lat/lng; and any operator-facing diagnostic surface
  MUST also redact kitchen lat/lng. The chef identifier is the
  diagnostic handle.

### Key Entities *(include if feature involves data)*

Phase 3 materialises behaviour for two entities the constitution
already defines and the Foundation phase already migrated, and
makes use of a third for the role-flip:

- **Chef**: A verified-or-pending seller on the marketplace,
  identified by an internal identifier, carrying a public name,
  a bio, kitchen coordinates (latitude, longitude), a minimum
  order price, a logo and a banner image URL, an open/closed
  flag, a verification flag, a rating (recomputed by Phase 7
  — Phase 3 stores the placeholder), a total-reviews count
  (same), an owning-user reference, and the standard timestamps
  including the Foundation's soft-delete marker. Phase 3 is the
  first phase that creates or mutates rows in this entity.
- **Category**: A platform-controlled food cuisine category,
  identified by an internal identifier, carrying an English
  display name, an Arabic display name, a display order, an
  icon identifier, and the standard timestamps including the
  Foundation's soft-delete marker. Phase 3 seeds this entity
  and ships its admin curation surface. Phase 4 (menus) is
  the consumer that links menus to categories.
- **User** (existing): Phase 3 mutates a user's role field —
  from customer to chef on verification (FR-009). Phase 3 does
  not introduce any new user attributes. The role transition is
  the server-authoritative gate on which the entire chef-side
  surface area depends.

The Phase 3 discovery rule FR-014 names the **Menu** entity (a
chef's menus are how the chef enters a category). Phase 3 does
not create or write menus; it only reads them for the category-
filter check. Phase 4 ships menus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in customer can submit a complete chef
  application — including dragging the map pin — in under 3
  minutes on a real device under normal network conditions.
  (User Story 1.)
- **SC-002**: A submitted chef application persists across an
  app force-close and relaunch in 100% of cases; the customer
  continues to land on the "under review" holding screen until
  an admin acts. (User Story 1, FR-003 / FR-031.)
- **SC-003**: An admin can verify or reject a pending chef
  application in under 60 seconds from opening the
  applications queue on the admin dashboard, including reading
  the applicant's bio and inspecting their kitchen coordinates
  on a small map preview. (User Story 2.)
- **SC-004**: When an admin verifies a pending application, the
  applicant's role transitions, the chef row becomes publicly
  visible, and the applicant's notification record is created
  in 100% of cases, regardless of whether the push notification
  itself delivers. Push delivery failures MUST NOT roll back any
  of those three effects. (User Story 2, FR-009.)
- **SC-005**: An applicant on a second device returns from a
  background-foreground cycle to the chef tab bar (rather than
  the customer tab bar) within one navigation transition
  following their verification, in 100% of cases. No full
  sign-out / sign-in cycle is required. (User Story 2,
  FR-030.)
- **SC-006**: A non-admin authenticated request to a
  verification or rejection endpoint is refused with the
  appropriate role-refusal response in 100% of cases. No payload
  ever flips a user's role on the server. (User Story 2,
  FR-011 / FR-032.)
- **SC-007**: For a signed-in customer with three verified
  chefs seeded (one open, one closed, one in a different
  category), the discovery list returns exactly those three
  chefs, sorts open before closed, and applies category /
  search / geographic-radius filters correctly in 100% of test
  cases. (User Story 3, FR-013 – FR-018.)
- **SC-008**: The chef discovery list and chef profile detail
  NEVER return a chef whose application is pending, rejected,
  or whose row is soft-deleted, across an exhaustive seeded
  dataset. (User Story 3, FR-013 / FR-018 / FR-033.)
- **SC-009**: A verified chef can toggle their kitchen
  open/closed and the change is reflected on a separate
  customer device's discovery surface within one fresh read of
  the list, in 100% of cases. (User Story 4, FR-020.)
- **SC-010**: A verified chef can upload a new logo and a new
  banner image successfully, and the public discovery list and
  chef profile detail render the new images on the next read
  in 100% of cases. (User Story 4, FR-022.)
- **SC-011**: Every chef row is renderable on the public
  surface from the moment it is verified — a chef who has
  never uploaded a logo or banner image still displays the
  platform default placeholder, in 100% of cases. (User
  Story 4, FR-023.)
- **SC-012**: A request to mutate a chef row that is owned by a
  different user is refused with the same response as if the
  target did not exist, in 100% of cases. (User Story 4,
  FR-024.)
- **SC-013**: A fresh deployment exposes the eight seeded
  categories with both English and Arabic display names
  populated, in the seeded display order, in 100% of cases.
  (User Story 5, FR-025 / FR-026.)
- **SC-014**: An admin bulk-reorder of categories is atomic
  end-to-end: a forced failure mid-reorder leaves the
  customer-facing list in either the fully-old order or the
  fully-new order — never a partial mix — in 100% of test
  cases. (User Story 5, FR-027.)
- **SC-015**: A non-admin authenticated request to any category
  mutation endpoint is refused with the appropriate role-refusal
  response in 100% of cases. (User Story 5, FR-028 / FR-032.)
- **SC-016**: 100% of strings shown on Phase 3 customer-facing
  mobile surfaces (apply form, holding screen, discovery list,
  chef profile, chef profile editor, kitchen toggle, image
  upload dialog, validation messages, empty states, status
  pills, category chips) are localised in both English and
  Arabic, and the Arabic version renders right-to-left
  end-to-end on a real device. (User Story 6, FR-034.)
- **SC-017**: 100% of notifications dispatched in this phase
  carry both English and Arabic title/body so the recipient
  client can render in the recipient's current in-app language
  without a server round-trip. (User Story 6, FR-035.)
- **SC-018**: For each Phase 3 body-accepting endpoint (chef
  apply, chef profile update, image uploads, category create /
  update / reorder, admin verify / reject) a request body
  containing one extra undocumented field is refused with a
  clear validation error in 100% of cases. (FR-037.)
- **SC-019**: For every Phase 3 event named in FR-038, exactly
  one structured log line is emitted per request lifecycle,
  carrying event type, outcome, timestamp, source IP, actor
  identifier, target identifier, and a correlation identifier
  — and never carrying chef kitchen lat/lng or any other
  coordinate-derived value. Verified by inspecting the log
  stream during a scripted run that exercises each event type
  at least once. (FR-038, FR-039.)
- **SC-020**: For every Phase 3 client-visible error response
  (validation rejection, ownership refusal, role refusal,
  duplicate-application refusal, no-longer-pending refusal),
  the response body is inspected and MUST NOT contain chef
  kitchen lat/lng or any coordinate-derived value, in 100% of
  cases. (FR-039.)

## Assumptions

- The Foundation phase (Phase 0), Phase 1 (Authentication &
  Users), and Phase 2 (Addresses & Map Picker) are in place: a
  signed-in customer identity exists with a role field that can
  be transitioned, request-shape validation and the soft-delete
  read filter are active, the chef and category tables are
  migrated from the canonical schema, and the map-picker
  component is available for reuse on the chef-apply screen
  (Phase 2 FR-005 contract).
- **A map provider and a reverse-geocoding provider are in
  place by Phase 2's end.** Phase 3 reuses both for the
  chef-apply screen — see Phase 2's Assumptions section. The
  choice of provider and the API-key procurement are not part
  of this specification; substituting either provider MUST NOT
  invalidate this spec.
- **Public chef names are not required to be globally unique
  in v1.** Customers distinguish chefs by their location and
  bio. A uniqueness rule with handle suggestions remains a
  future, additive change.
- **A chef's category is derived from the menus they carry,
  not from a "primary category" stored on the chef row.** A
  chef with menus in multiple categories appears in each of
  those categories' filters. Phase 4 (menus) is the surface
  where the chef declares those menus; Phase 3 reads them only
  for the FR-014 filter check.
- **A rejection does not permanently ban a customer from
  re-applying** (FR-006). Rejection is feedback, not a
  blacklist. A permanent-ban capability remains a future,
  additive change requiring a constitution amendment because
  it touches the role-transition contract.
- **The admin dashboard surfaces shipped in Phase 3 are
  English-only.** Admins are an internal audience and v1 does
  not invest in admin-side localisation. Free-text fields
  written by admins and shown to customers (e.g., the
  rejection reason) are stored as-is and rendered to customers
  as written — the platform does not translate admin-typed
  text (FR-036).
- **No per-customer cap on applications, no per-chef cap on
  bio length below industry-standard free-text limits, no
  per-chef minimum-order-price ceiling.** Sensible
  implementation-layer defaults MAY be applied if abuse is
  observed; the spec does not require any.
- **The chef tab bar and the customer tab bar in Phase 3 ship
  as placeholders only** (Dashboard, Orders, Menu, Stats,
  Schedule, Profile on the chef side; Home, Explore, Favorites,
  Orders, Profile on the customer side). The content behind
  each tab is filled in by Phases 4 – 9. Phase 3's
  responsibility is the role-driven navigation switch (FR-030)
  and the empty-state placeholders, not the actual screens.
- **Geographic radius search uses a coordinate-based distance
  computation.** The exact algorithm and storage technology
  (e.g., a spherical-distance formula computed by the data
  store) is a planning-level decision, not a specification
  decision. Substituting algorithms MUST NOT invalidate this
  spec as long as the user-facing behaviour (closest first,
  exclude outside radius) holds.
- **Editing a chef's kitchen coordinates after verification is
  permitted in v1** (FR-021), mirroring the Phase 2 stance on
  editing addresses while in-flight orders reference them. A
  chef who moves their kitchen mid-cycle is a real scenario;
  the change propagates by reference. A follow-up phase MAY
  introduce a snapshot of the chef's coordinates onto each
  order at placement time if observed disputes warrant it; that
  change requires a constitution amendment because it touches
  the order data model.
- **A chef's `is_open` toggle is a chef-controlled flag, not
  an automated derivation from menu availability schedules.**
  Phase 4 introduces menu-level day-of-week availability;
  Phase 3 does not derive `is_open` from those schedules.
  Combining the two signals at order time is Phase 5's / Phase
  6's concern.
- **Performance targets in Success Criteria assume a typical
  mobile network connection and a recent mobile device,
  consistent with the project's baseline expectations** and
  with the Phase 2 spec's stated baseline.
