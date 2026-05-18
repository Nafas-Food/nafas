# Feature Specification: Menus, Items & Customer Discovery Surfaces

**Feature Branch**: `005-phase-4-menus`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "Read phase 4 from docs/implementation-plan.md - and according to the best practices of Github's speckit create the fourth spec."

## Clarifications

### Session 2026-05-18

- Q: Phase 6's stock-decrement logic already treats `Item.quantity = -1` as the "unlimited stock" sentinel. Should the Phase 4 chef-facing surface expose "unlimited" as a first-class option (with an explicit toggle that writes `-1` behind the scenes), or should chefs always type a finite numeric stock value? → A: Expose "unlimited" as a first-class chef-facing affordance — a toggle next to the stock count input that, when on, disables the numeric input and writes the unlimited sentinel behind the scenes. This matches the schema's existing semantic and removes the daily friction of re-bumping a stock number for staple items (koshary, ful), which is the typical Egyptian-home-kitchen case. Chefs of single-batch items can leave the toggle off and type a finite count.
- Q: When a verified chef uploads a new image for an existing item, how should the image set behave — append the new file onto the existing array, replace the entire array, or allow the chef to remove individual images one at a time? → A: Append on upload AND expose a per-image remove path. Uploads add onto the existing images array up to the 5-image cap; the chef can remove a single image at a time without re-uploading the rest. This maximises chef flexibility and lets a chef fix a single bad photo (the realistic v1 case) without recreating the item or re-uploading their good photos. The Phase 4 surface area gains one removal endpoint; the events surface (FR-032) records image-remove as a distinct event from image-upload.
- Q: The "today-available menus only" filter on the customer-facing chef-profile read needs a single source of truth for what "today" means. Should that be Africa/Cairo wall clock (Egypt-only marketplace default), the customer's device clock, or each chef's local time? → A: Africa/Cairo wall clock for ALL reads — the platform-wide source of truth. Every customer reading any chef's profile resolves "today" against the same Cairo wall clock at request time, regardless of the requesting device's locale or the chef's coordinates. This is the natural single source for an Egypt-only marketplace (constitution non-goal: no multi-country expansion); it gives chefs a predictable mental model ("my Sunday menu is live on Sunday in Cairo"), and it makes the rule trivial to test. A weekday rollover happens exactly at midnight Cairo time, in lockstep across every customer device.
- Q: Should the Phase 4 image-upload endpoint carry an explicit per-actor / per-IP throttle override on top of Phase 1's default `60 req / 60 s / IP` tier, or rely on that default ceiling alone? → A: Tighten the throttle on the image-upload endpoint to a per-chef cap of **20 uploads per 60 s**, with Phase 1's default IP cap retained as a backstop. This accommodates a realistic photo-shoot burst (4 items × 5 photos = 20) while making automated abuse visibly rate-limited; it extends Phase 1's precedent of per-route tightening on cost-sensitive routes (the chef's image-upload path is cost-sensitive because each successful call writes 5 MB to public storage). The throttle MUST reuse Phase 1's single `default` tier name — no new named tier is introduced (Phase 1 R7 — single-tier rule). A request refused by this throttle MUST surface a clear "you're uploading too fast — please retry shortly" message and MUST emit an FR-032 event with an explicit `rate_limited` outcome so abusive upload loops are visible to operators.
- Q: What per-locale character cap applies to the three new bilingual free-text fields on Phase 4 rows (`Menu.name`, `Item.name`, `Item.description`)? → A: `Menu.name` ≤ **60** characters per locale; `Item.name` ≤ **60** characters per locale; `Item.description` ≤ **500** characters per locale. Empty values are refused (consistent with required-field validation); leading/trailing whitespace is trimmed server-side before the length check. These caps follow common marketplace-listing conventions: short titles for card legibility, modest descriptions for the item-card's vertical real estate. The caps apply independently per locale — a chef may use up to 60 characters in English AND up to 60 characters in Arabic on the same name field. A submission whose trimmed value exceeds the per-locale cap on any side MUST be refused at validation time with a clear per-field, per-locale message rather than silently truncated.
- Q: How should `Menu.displayOrder` and `Item.displayOrder` collisions be handled, and what is the read-time tiebreaker? → A: Server-side bulk-reorder normalisation, mirroring Phase 3 FR-027's atomic category-reorder pattern. The chef sends an ordered identifier list to a dedicated reorder endpoint (one for menus per chef, one for items per menu); the server rewrites `displayOrder` on the entire ordered set as a dense `0, 1, 2, …` sequence in one transaction, so two rows under the same parent NEVER share a `displayOrder` value as a result of a chef-initiated reorder. Reads — both customer-facing and chef-facing — sort the affected collections by `(displayOrder ASC, createdAt ASC, id ASC)` so any rows whose order was last set before a reorder (or rows created between reorders) still surface in a deterministic order. A partial reorder (one row updated but not others) MUST NOT be visible to any reader; the transaction is all-or-nothing.

## Overview *(non-mandatory context)*

Phase 4 turns the platform from "we have verified chefs and a catalogue of
cuisine categories" into "verified chefs have a real catalogue of food a
customer can browse." Until Phase 4 lands, Phase 3 has shipped chef
discovery and chef profiles — but the profile is empty: there are no
menus to read, no items to browse, no images to show, no prices to
compare. Every later phase that depends on a real catalogue — cart
(Phase 5), orders (Phase 6), reviews (Phase 7), chef dashboard (Phase 9),
admin order-management views (Phase 11) — is blocked until Phase 4
ships.

The deliverable has four parts that ship together because each is
useless without the others:

1. **A chef-side menu and item editor** — a verified chef creates one
   or more menus, each tagged to one cuisine category, each carrying a
   bilingual name (English + Arabic) and a day-of-week availability
   schedule (specific weekdays, OR an "available every day" mode). The
   chef adds items to a menu — bilingual name and description, a
   price, an optional discount (fixed amount or percentage), a stock
   count, and up to a small number of photos.
2. **A "today-available" public surface** — when a signed-in customer
   opens a verified chef's public profile, the platform returns only
   the menus whose day-of-week availability covers today. Items inside
   those menus are returned with their effective sell price
   (server-computed from the chef-declared base price and discount)
   and a server-set "in stock" flag. Items in menus that are not
   today-available are hidden from the customer entirely.
3. **The customer Home surface** — a greeting, a horizontal scroll of
   currently-open verified chefs, the cuisine-category chips ribbon
   shipped in Phase 3, and a top-rated grid of verified chefs (top-
   rated will fill out as Phase 7 wires reviews; Phase 4 returns it
   ordered by current rating with a defined tie-break).
4. **The customer Explore surface** — a debounced text search, a
   cuisine-category filter, and an infinite-scrolling paginated
   results list, all wrapping the discovery-surface contracts the
   backend already exposed in Phase 3.

A secondary deliverable is the **server-side `effectivePrice` rule**
that converts (`price`, `discountValue`, `discountUnit`) into the
single number the customer sees on the item card. That helper is the
canonical price authority that Phase 5 (cart subtotals) and Phase 6
(order-item snapshots) reuse — there is no "client computes the
discount" path, ever (constitution principle II).

If any of these is missing, the platform either has no menus (no chef
editor), has menus no customer can read (no public surface), or has
chefs no customer can find an entry point to (no home or explore).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A verified chef creates a menu (Priority: P1)

A verified chef opens their menu surface for the first time after
verification. The surface is empty. They tap "create menu", give it a
bilingual name ("Koshary Sunday" / "كشري الأحد"), pick a cuisine
category (Koshary), and decide on its day-of-week availability —
either by checking specific days (e.g., Sunday + Wednesday) or by
flipping an "available every day" switch. The menu is created and
shows up in the chef's own browse list. The menu is empty (no items
yet), so the chef's public profile shows the menu's section but with
an empty-state placeholder.

**Why this priority**: Without a menu container, items have nothing
to live under. This is the smallest slice of Phase 4 that delivers
value on its own — a chef can structure their catalogue before
populating it.

**Independent Test**: A verified chef opens the menu surface, creates
one menu with a Sunday-only availability, and immediately sees it in
their own browse list. A signed-in customer who opens the chef's
public profile on a Sunday sees the menu section with an empty-state
placeholder; on a Monday the menu section is not returned at all.

**Acceptance Scenarios**:

1. **Given** a verified chef with no existing menus, **When** they
   submit a complete menu (bilingual name, category, day-of-week
   availability or "available every day"), **Then** the menu is
   created and appears in the chef's own browse list immediately, in
   the default display order.
2. **Given** a verified chef creates a menu with day-of-week
   availability covering Sunday and Wednesday, **When** a signed-in
   customer reads the chef's public profile on a Sunday or a
   Wednesday, **Then** the menu section appears; on any other
   weekday it does NOT appear.
3. **Given** a verified chef creates a menu with the "available every
   day" mode, **When** a signed-in customer reads the chef's public
   profile on any weekday, **Then** the menu section always appears.
4. **Given** any required menu field is missing or invalid (empty
   bilingual name, missing or stale category reference, no
   availability defined and "available every day" not set), **When**
   the chef attempts to submit, **Then** the submit is refused with a
   clear per-field validation message and the menu is not created.
5. **Given** a chef-supplied category reference points at a
   soft-deleted category, **When** the chef attempts to submit,
   **Then** the submit is refused with a clear "this category is no
   longer available" message and the menu is not created.

---

### User Story 2 - A verified chef adds items to a menu (Priority: P1)

A verified chef opens an existing menu and taps "add item". They give
the item a bilingual name ("Classic Koshary" / "كشري كلاسيك") and a
bilingual description, set a price (60.00), optionally set a discount
(either a fixed amount, e.g., 5.00 off, or a percentage, e.g., 10%
off), set a stock count, and upload one or more photos. The item is
added to the menu and is immediately visible on the chef's own browse
list. On the chef's public profile, if the menu is today-available,
the item is rendered with the server-computed effective price (e.g.,
"55.00" with the original "60.00" struck through), the chef's photos,
and an in-stock flag.

**Why this priority**: Equally critical to user story 1. A menu with
no items is not a catalogue. This is the second non-negotiable slice:
without items the customer has nothing to add to a cart, so Phase 5
and everything downstream remain blocked.

**Independent Test**: A verified chef adds one item to an
"available every day" menu, with a base price, a discount, and one
photo. A signed-in customer opens the chef's public profile on any
weekday, sees the item under the menu, sees the discounted price
displayed alongside the original (struck-through), sees the photo
rendered, and sees an in-stock indicator that reflects the chef-set
stock.

**Acceptance Scenarios**:

1. **Given** a verified chef on one of their menus, **When** they
   submit a complete item (bilingual name and description, positive
   price, optional discount with a unit, stock count, optional
   image(s)), **Then** the item is created in that menu and appears
   in the chef's own browse list immediately.
2. **Given** a chef-supplied discount produces an effective price ≥
   0, **When** the chef submits the item, **Then** the item is
   created and the server-computed effective price is what the
   customer-facing surface shows; **Given** the discount would
   produce a negative effective price, **When** the chef submits,
   **Then** the submit is refused with a clear "discount cannot
   exceed price" validation message.
3. **Given** the discount unit is `percent`, **When** the discount
   value exceeds 100, **Then** the submit is refused with a clear
   validation message; **When** the discount value is 0, **Then**
   the item is created with no discount and no struck-through price
   on the customer surface.
4. **Given** a chef uploads more images than the per-item maximum
   (5), or an image of a disallowed type, or an image over the
   per-file size limit (3 MB), **When** the upload completes,
   **Then** the upload is refused with a clear per-file validation
   message and the item's existing image array is unchanged.
5. **Given** a chef flips the chef-side editor's "unlimited
   stock" toggle on, **When** they submit the item, **Then** the
   platform stores the unlimited sentinel and a customer reading
   the item sees an in-stock indicator of `true` regardless of
   how many orders have been placed; **Given** the chef flips
   the toggle off and supplies a finite stock count of 0,
   **When** a customer reads the item, **Then** the in-stock
   indicator is `false`. The chef's read of their own item
   surfaces enough information to render the "unlimited" state
   unambiguously (so the toggle's on/off state is preserved
   across edits without the chef having to re-enter a finite
   count from memory).
6. **Given** a customer (not a chef) obtains an item-creation
   request URL, **When** they attempt the request, **Then** the
   platform refuses; **Given** a verified chef A obtains a
   request URL for an item that lives under a different chef B's
   menu, **When** chef A attempts a mutation, **Then** the platform
   refuses with the same response shape as if the target did not
   exist.

---

### User Story 3 - A signed-in customer browses a chef profile and sees today-available items (Priority: P1)

A signed-in customer taps a verified chef on the discovery surface
and opens the chef's public profile. The header (name, banner, logo,
bio, rating, currently-open / currently-closed flag — all shipped in
Phase 3) is unchanged. Below it, the profile shows one section per
today-available menu (Sunday menus on a Sunday; "every day" menus
always). Each section lists the menu's items as cards: bilingual
name (rendered in the customer's current in-app language),
description, price (with strike-through for discounted items),
photos, and an in-stock indicator. An item that is marked inactive
by the chef does NOT appear; an item that is soft-deleted does NOT
appear; an item belonging to a menu that is not today-available does
NOT appear. The "add to cart" CTA is rendered in the design system
shape but its action wiring is Phase 5's responsibility.

**Why this priority**: Equally critical to user stories 1 and 2.
This is the customer-facing reason Phase 4 exists. Without it the
chef-side editor is invisible to the customer. This slice is
independent of the home/explore surfaces in the sense that, given
the chef's identifier, the profile read can be demonstrated on its
own.

**Independent Test**: With one verified chef seeded who owns two
menus (one Sunday-only with two items, one "every day" with one
item, all items active), a signed-in customer opens the chef's
profile on a Sunday and sees both menu sections with all three
items rendered with their effective prices and photos. On a Monday
the same customer sees only the "every day" menu section with its
one item.

**Acceptance Scenarios**:

1. **Given** a signed-in customer opens a verified chef's public
   profile, **When** the read resolves, **Then** the profile
   includes one section per menu whose availability covers today
   (either via a today's-weekday row or via "available every day"),
   and no section for any other menu.
2. **Given** a menu section is included, **When** the read resolves,
   **Then** that section includes only items that are not
   soft-deleted AND are marked active AND belong to the included
   menu. Each item carries: bilingual name, bilingual description,
   base price (as a decimal string), effective price (as a decimal
   string), image URLs in their stored order, and a boolean
   in-stock flag.
3. **Given** an item carries a non-zero discount, **When** the
   customer reads the item, **Then** both the base price and the
   effective price are present in the read, so the client can
   render a struck-through original alongside the effective price
   without computing the discount itself.
4. **Given** an item's chef has marked it inactive OR the item's
   stock count is 0 (and not the unlimited sentinel), **When** the
   customer reads the item, **Then** the in-stock flag is `false`
   and (for inactive) the item is omitted from the section
   entirely.
5. **Given** a verified chef has zero menus, OR has menus but none
   that are today-available, OR has today-available menus but no
   active non-soft-deleted items, **When** a customer opens their
   public profile, **Then** the header still renders correctly and
   the menu region renders a clear "no items available right now"
   empty state rather than an error.
6. **Given** the chef row is soft-deleted (per Phase 3 FR-012a)
   OR is not verified, **When** any customer attempts to read the
   profile, **Then** the read is refused as if the identifier did
   not exist (no leak that a chef once existed at that identifier).

---

### User Story 4 - A signed-in customer uses Home and Explore to find chefs (Priority: P1)

A signed-in customer opens the app and lands on the Home tab. They
see: a personalised greeting in the in-app language, a horizontal
scroll of currently-open verified chefs (with logos, names, and
ratings), a strip of cuisine-category chips (reading from Phase 3's
category catalogue), and a grid of top-rated verified chefs. They
tap a chef in the open-chefs scroll → the chef's public profile
opens. They tap a category chip → the Explore surface opens
pre-filtered to that category. From Explore they can type a search
("koshary"), apply a category filter, and scroll through a
paginated results list — all wrapping the discovery contracts Phase
3 shipped (FR-013 – FR-017).

**Why this priority**: Without Home and Explore, customers have no
entry point into the chef catalogue except deep-linking, which they
do not have in v1. This slice is independent of User Stories 1–3
in the sense that, given seeded data from those flows, the
navigation entry points can be demonstrated and tested on their
own.

**Independent Test**: With at least three verified chefs seeded
(two currently open in different categories, one currently
closed), a signed-in customer opens Home, sees both open chefs in
the open-chefs scroll (open ones surfaced first per Phase 3
FR-016), sees the category chips populated, and sees at least one
chef in the top-rated grid. Tapping any chef opens their public
profile; tapping any category chip opens Explore pre-filtered to
that category and returning at least the seeded chef in that
category.

**Acceptance Scenarios**:

1. **Given** a signed-in customer opens Home, **When** the surface
   renders, **Then** it includes: a greeting rendered in the
   customer's current in-app language; a horizontal scroll of
   currently-open verified chefs ordered per Phase 3's discovery
   sort rules; a category chip ribbon reading from Phase 3's
   `GET /categories` endpoint; and a top-rated grid of verified
   chefs ordered by current rating (descending), with ties broken
   by verified-newest-first.
2. **Given** the customer taps a chef in any Home strip, **When**
   the navigation resolves, **Then** the customer lands on that
   chef's public profile (per User Story 3).
3. **Given** the customer taps a category chip on Home, **When**
   the navigation resolves, **Then** the customer lands on the
   Explore surface with the chosen category pre-applied as a
   filter.
4. **Given** the customer opens Explore directly from the tab bar,
   **When** the surface renders, **Then** it shows a search input
   (debounced so a customer typing "koshary" does not trigger one
   request per keystroke), a category filter control, and a
   paginated results list of verified chefs.
5. **Given** the customer enters a search term, applies a category
   filter, and scrolls past the first page, **When** the surface
   refetches, **Then** the results reflect both filters
   simultaneously and pagination delivers the next page on demand
   (per Phase 3 FR-017).
6. **Given** a verified chef who is the only chef in a particular
   category gets revoked (Phase 3 FR-012a), **When** the customer
   re-enters Explore with that category filter applied, **Then**
   the results list is empty with a clear empty-state message
   rather than stale data.

---

### User Story 5 - A verified chef maintains their catalogue (Priority: P2)

A verified chef opens an existing menu. They edit its name
(spelling fix), change its day-of-week availability (was Sunday+
Wednesday, now Sunday only), and reorder items within it. On
items, they update prices for the season, toggle one item to
inactive (to take it off the public surface temporarily without
losing its history), upload replacement images for another item,
and bump the stock on a third. They also soft-delete a menu that
they no longer offer; its items vanish from the public surface but
the historical record is preserved (constitution principle IV). All
changes are visible to a customer on the next read of the chef's
profile.

**Why this priority**: Critical for a working marketplace but
independent of getting the first menu and the first items onto the
platform. A chef who cannot edit prices cannot run their kitchen
realistically; a chef who cannot toggle an item off cannot manage
a sold-out signature dish without permanently deleting it. We ship
the create + read slices first because without them there is
nothing to edit.

**Independent Test**: A verified chef with one menu and three
items: edits the menu's name and availability, edits one item's
price, toggles one item to inactive, soft-deletes one item,
soft-deletes the menu. A second customer reads the chef's profile
and sees the new menu name, the new price on the remaining active
item, no inactive item, no soft-deleted item, no soft-deleted
menu.

**Acceptance Scenarios**:

1. **Given** a verified chef, **When** they edit any subset of a
   menu's fields (bilingual name, category, day-of-week
   availability or "available every day" mode), **Then** the
   change is reflected on the next customer read of that
   chef's profile.
1a. **Given** a verified chef bulk-reorders their menus by
   submitting the full ordered list of their non-soft-deleted
   menu identifiers to the dedicated reorder endpoint, **When**
   the operation completes, **Then** the chef's own browse list
   and the next customer read of the chef's profile both render
   the menu sections in the new order, and the platform never
   exposes a partial reorder; **Given** the submitted list is
   not an exact cover of the chef's current menu set (missing
   IDs, unknown IDs, or duplicates), **Then** the reorder is
   refused at validation with a clear message and the
   previously stored order is unchanged.
2. **Given** a verified chef edits an item (bilingual name and
   description, price, discount value, discount unit, stock
   count, active flag), **When** the chef submits, **Then** the
   change is reflected on the next customer read.
2a. **Given** a verified chef bulk-reorders the items inside one
   of their own menus by submitting the full ordered list of
   that menu's non-soft-deleted item identifiers, **When** the
   operation completes, **Then** the chef's own browse list and
   the next customer read of the chef's profile both render the
   items inside that menu in the new order; **Given** the
   submitted list is not an exact cover of the menu's current
   item set, **Then** the reorder is refused at validation with
   a clear message and the previously stored order is
   unchanged.
3. **Given** a chef toggles an item's active flag from true to
   false, **When** a customer reads the chef's profile, **Then**
   the item is omitted from the section it was in; **Given** the
   chef toggles it back to true, **Then** the item reappears
   without any data loss.
4. **Given** a chef soft-deletes a menu or an item, **When** any
   subsequent customer read of the chef's profile is performed,
   **Then** the soft-deleted menu or item does NOT appear; the
   chef's own browse list also does NOT show soft-deleted rows.
5. **Given** a chef A obtains a mutation request URL for chef B's
   menu or item, **When** chef A attempts the mutation, **Then**
   the platform refuses with the same response shape as if the
   target did not exist (no cross-chef identifier disclosure).
6. **Given** a chef removes a day-of-week from a menu's
   availability (e.g., Sunday removed), **When** a customer reads
   the chef's profile on that day, **Then** the menu section is
   no longer included; **Given** the chef re-adds the same day,
   **Then** the section reappears.
7. **Given** a verified chef on an existing item with three
   photos, **When** they remove the middle photo via the
   per-image remove path, **Then** the item's images array now
   contains exactly the two remaining photos in their original
   relative order; **Given** they remove the same photo a
   second time (e.g., from a stale client view), **Then** the
   platform responds with an idempotent "already removed"
   outcome rather than an error; **Given** they remove every
   remaining photo, **Then** the item is still readable on the
   customer surface and renders with the design-system
   default-item placeholder.

---

### User Story 6 - The Phase 4 surfaces are bilingual with proper layout direction (Priority: P3)

A customer in Arabic opens Home, taps a chef, browses the chef's
profile (menu sections, item cards with prices and discounts), taps
a category chip, lands on Explore, searches, and paginates. Every
visible string — greeting, tab labels, menu names, item names,
descriptions, prices and currency, in-stock and out-of-stock
copy, empty states, validation messages on the chef-side editor,
day-of-week chip text — is rendered in Arabic with right-to-left
layout. They toggle the language to English; the same surfaces
re-render in English with left-to-right layout, without an app
restart. On the chef side, a verified chef using Arabic opens the
menu editor, the item editor, the image upload dialog, the
day-of-week picker, and every validation error — all in Arabic
with RTL.

**Why this priority**: Lower priority than the marketplace
behaviour itself, but the bilingual + RTL contract from the
constitution applies on every new surface. Phase 3 set the
precedent for the largest single batch of new surfaces so far;
Phase 4 is comparable in scope (chef editor + public profile menus
+ home + explore), so explicitly committing to bilingual parity
here prevents the contract from silently regressing as the
project's surface area continues to grow.

**Independent Test**: An Arabic-language customer exercises Home,
a chef profile (with at least one item carrying a discount and at
least one out-of-stock item), Explore (search + category filter),
and the chef-side editor (menu create, item create, day-picker,
image upload dialog, validation errors). Every visible string is
Arabic with right-to-left layout. Toggling to English and
re-entering every surface produces every string in English with
left-to-right layout.

**Acceptance Scenarios**:

1. **Given** an Arabic-language customer, **When** they open any
   Phase 4 customer-facing mobile surface (Home, Explore, chef
   profile menus and items), **Then** every visible string is in
   Arabic and the layout direction is right-to-left.
2. **Given** an Arabic-language chef, **When** they open any
   Phase 4 chef-facing mobile surface (menu editor, item editor,
   image upload dialog, day-of-week picker, validation errors),
   **Then** every visible string is in Arabic and the layout
   direction is right-to-left.
3. **Given** any user toggles the in-app language, **When** they
   re-enter a Phase 4 surface, **Then** every visible string is
   rendered in the newly chosen language without an app restart.
4. **Given** an item or a menu carries a bilingual name and
   description (stored as `{ en, ar }`), **When** the surface
   reads it, **Then** the field rendered to the customer matches
   their current in-app language; if a side is empty for a row
   (legacy data, partial input), the surface falls back to the
   other locale rather than rendering an empty string.

---

### Edge Cases

- **A chef creates a menu with no items, then opens their public
  profile via a customer-side preview.** The menu section is
  included (assuming today's weekday matches) but renders a clear
  "no items in this menu yet" empty state; it does not render as a
  broken section.
- **A chef has many menus, all of which are scheduled for weekdays
  that are not today.** A customer reading their profile sees the
  chef's header but a single "no items available today" empty
  state in the menu region; the profile does not 404 because the
  chef still exists and is verified.
- **A chef toggles an item to inactive while a customer is mid-
  browse on the chef's profile.** The customer's currently rendered
  view does not magically refresh; the inactive state takes effect
  on the next read by that customer (constitution principle II —
  the server is the source of truth, and the read is the boundary
  at which the customer sees it).
- **A chef sets a percent discount of 100.** The effective price
  resolves to 0; the item is still rendered, with effective price
  "0.00" alongside the struck-through base price. (Phase 5 / Phase
  6 are responsible for any business rule that would block a
  zero-price item from entering an order — Phase 4 does not invent
  one.)
- **A chef sets a fixed discount equal to the base price.** Same
  as above — effective price 0, both numbers returned, no
  validation refusal in Phase 4. Negative-effective-price
  submissions ARE refused (a fixed discount greater than the base
  price).
- **A chef uploads images one after another and the per-item
  maximum of 5 is reached.** The 6th upload is refused with a
  clear "this item already has the maximum 5 images" validation
  message; the chef removes an unwanted image via the FR-012a
  per-image remove path and re-attempts the upload, which then
  succeeds (the array is shrunk to 4 then appended back to 5).
- **A chef uploads an image of the wrong type (e.g., SVG) or
  oversize (>3 MB).** The upload is refused with a clear
  validation message; the existing image array on the item is
  unchanged. The whitelist deliberately excludes formats that
  double as XSS surfaces (consistent with the Phase 3 FR-022
  rule for chef logo/banner).
- **A category referenced by a menu is soft-deleted by an admin
  (Phase 3 FR-029).** The menu retains its category reference for
  audit purposes (the row is intentional history) but the
  customer-facing category filters and chips on Home and Explore
  no longer expose that category, so the chef does not surface
  via that filter even though the link still exists in the
  database.
- **A chef is revoked by an admin (Phase 3 FR-012a) while they
  have menus and items.** The chef's profile read is refused as
  if the chef did not exist (Phase 3 contract). Phase 4 does not
  cascade-delete the menus and items — the rows remain associated
  with the soft-deleted chef row and are preserved as audit data;
  they simply become unreachable through every public surface
  because the chef row is unreachable.
- **A chef changes a menu's category from Koshary to Sweets.** A
  customer who had Explore pre-filtered to Koshary and who
  refreshes no longer sees this chef in that filter; the chef now
  appears under Sweets.
- **A chef sets a menu's day-of-week availability to include all
  seven weekdays explicitly instead of using the "available every
  day" mode.** The customer-facing behaviour is identical. The
  modes are equivalent; the platform does not force the chef to
  pick one shape over the other.
- **A customer with a slow connection scrolls Explore quickly.**
  Search input is debounced so that typing "koshary" does not
  trigger seven concurrent backend reads; only the final pause
  triggers a request. Category-filter taps cancel any in-flight
  search request to prevent stale results overwriting fresh ones.
- **A customer opens Home as their first authenticated screen and
  the platform has zero verified chefs yet (early launch).** Home
  renders the greeting and category chips, but the open-chefs
  scroll and top-rated grid render their empty states with a
  clear "no chefs yet" message; Home does not crash or display a
  blank surface.

## Requirements *(mandatory)*

### Functional Requirements

#### Chef-side menu lifecycle

- **FR-001**: A verified chef MUST be able to create one or more
  menus. Each menu MUST carry, at minimum: a bilingual name
  (English + Arabic — each locale capped at **60 characters**
  after server-side trim of leading/trailing whitespace, with
  both sides required), a reference to a single cuisine category,
  a day-of-week availability schedule (a set of weekday markers,
  where each weekday is represented by an integer 0–6 with
  exactly one row per included weekday), and an "available every
  day" flag that, when set, supersedes the day-of-week schedule.
  The chef's authenticated identity is the owner — no
  client-supplied chef identifier is trusted. A submission whose
  trimmed name on either locale is empty or exceeds 60 characters
  MUST be refused with a clear per-locale validation message
  rather than silently truncated.
- **FR-002**: A verified chef MUST be able to edit any subset of a
  menu's fields (bilingual name, category reference, day-of-week
  availability, "available every day" flag). Edits are visible to
  customers on the next read. Display-order changes are NOT made
  via this per-menu update; they go through the dedicated bulk
  reorder operation in FR-002a so collisions are impossible by
  construction.
- **FR-002a**: A verified chef MUST be able to bulk-reorder their
  own menus by submitting an ordered list of their menu
  identifiers to a dedicated reorder endpoint. The platform
  rewrites every listed menu's `displayOrder` as a dense
  zero-based sequence (`0, 1, 2, …`) inside one transaction.
  The submission MUST be refused if it does not cover EXACTLY
  the chef's current set of non-soft-deleted menus (missing
  identifiers or unknown identifiers — neither subset nor
  superset is accepted). A partial reorder (some rows updated,
  others not) MUST NOT be visible to any reader: the
  transaction is all-or-nothing, mirroring the Phase 3 FR-027
  atomic category-reorder contract.
- **FR-003**: A menu's category reference MUST point at a
  non-soft-deleted category at create time and at update time.
  A submission whose category reference points at a soft-deleted
  or non-existent category MUST be refused with a clear
  validation message.
- **FR-004**: Day-of-week availability MUST validate weekday
  values as integers in `[0, 6]` server-side. Submitting the
  same weekday twice for one menu MUST be idempotent (treated
  as a single inclusion). Removing an unincluded weekday MUST
  be a no-op rather than an error.
- **FR-005**: A verified chef MUST be able to soft-delete one of
  their menus. A soft-deleted menu MUST NOT appear on any
  customer-facing surface (chef profile, category filter, search
  results) and MUST NOT appear in the chef's own browse list;
  the row is preserved in the data store for audit purposes
  (constitution principle IV).
- **FR-006**: A verified chef MUST be able to read the list of
  their own menus, including soft-delete-respecting active ones
  and the items inside each one (including items the chef has
  marked inactive — chefs need to see their full catalogue to
  manage it, even when parts of it are hidden from customers).
  The chef-facing read MUST sort menus by `(displayOrder ASC,
  createdAt ASC, id ASC)` and the items within each menu by
  `(displayOrder ASC, createdAt ASC, id ASC)` — the same
  deterministic order the customer-facing read uses (FR-018),
  so a chef previewing their own catalogue sees exactly the
  order a customer will see.

#### Chef-side item lifecycle

- **FR-007**: A verified chef MUST be able to create items inside
  one of their own menus. Each item MUST carry: a bilingual name
  (each locale capped at **60 characters** after server-side
  whitespace trim, with both sides required), a bilingual
  description (each locale capped at **500 characters** after
  server-side whitespace trim, with both sides required), a base
  price (> 0), a discount value (≥ 0) paired with a discount
  unit (`fixed` or `percent`), a stock count (a non-negative
  integer OR a single platform-defined sentinel value meaning
  "unlimited"), an active flag (defaulting to true), a display
  order within the menu, and an images array (0–5 entries, each
  a platform-controlled image URL). A submission whose trimmed
  name on either locale is empty or exceeds 60 characters, or
  whose trimmed description on either locale is empty or exceeds
  500 characters, MUST be refused with a clear per-field,
  per-locale validation message rather than silently truncated.
- **FR-008**: The chef-facing surface for the stock count MUST
  expose "unlimited" as a first-class option — an explicit
  toggle (or equivalent affordance) next to the numeric stock
  input that, when on, disables the numeric input and writes
  the platform-defined unlimited sentinel server-side. When
  the toggle is off, the chef supplies a non-negative integer
  stock count. The chef MUST be able to flip the toggle either
  way on subsequent edits without losing the previously
  entered finite count (the client preserves the last finite
  value so re-disabling "unlimited" restores it for editing).
  Every read that includes the stock count MUST surface enough
  information for the client to render the "unlimited" state
  unambiguously rather than as a magic integer (e.g., a
  separate boolean `isUnlimitedStock` flag or an equivalent
  semantic representation in the response).
- **FR-009**: A verified chef MUST be able to edit any subset of
  an item's fields (bilingual name, bilingual description,
  price, discount value, discount unit, stock count, active
  flag, image array — subject to the image management semantics
  in FR-012). Edits are visible to customers on the next read.
  Display-order changes are NOT made via this per-item update;
  they go through the dedicated bulk reorder operation in
  FR-009a so collisions are impossible by construction.
- **FR-009a**: A verified chef MUST be able to bulk-reorder the
  items inside one of their own menus by submitting an ordered
  list of those item identifiers to a dedicated reorder
  endpoint. The platform rewrites every listed item's
  `displayOrder` as a dense zero-based sequence (`0, 1, 2, …`)
  inside one transaction. The submission MUST be refused if it
  does not cover EXACTLY the menu's current set of
  non-soft-deleted items (neither subset nor superset is
  accepted). A partial reorder MUST NOT be visible to any
  reader: the transaction is all-or-nothing, mirroring FR-002a
  and Phase 3 FR-027.
- **FR-010**: The platform MUST refuse an item submission whose
  computed effective price would be negative. With discount
  unit `fixed`, this means `discountValue > price`. With
  discount unit `percent`, this means `discountValue > 100`. A
  submission that would resolve to an effective price of exactly
  0 MUST be accepted (item rendered with effective price
  "0.00"). Any future business rule that forbids 0-price items
  from being ordered is a downstream phase's responsibility.
- **FR-011**: A verified chef MUST be able to toggle an item's
  active flag independently of soft-deletion. An inactive item
  is hidden from every customer-facing surface but retained in
  the chef's own browse list with its active state shown so the
  chef can re-activate it. Soft-deletion (FR-014) is a separate,
  stronger operation.
- **FR-012**: A verified chef MUST be able to attach up to 5
  images per item. The platform MUST accept only JPEG, PNG, and
  WebP files, MUST refuse files larger than 3 MB, and MUST
  refuse with a clear validation error on any other file-type
  or size violation. The whitelist deliberately excludes
  formats that double as XSS surfaces (SVG, HTML) and excludes
  executables outright, consistent with the Phase 3 FR-022 rule
  for chef logo/banner. Image-set management semantics:
  a successful upload APPENDS the new image(s) onto the item's
  existing images array (the array preserves stored order and
  is the rendering order on the customer surface), subject to
  the 5-image cap — an upload that would push the array's
  length above 5 MUST be refused with a clear validation
  message and the existing array left unchanged.
- **FR-012a**: A verified chef MUST be able to remove a single
  image from one of their own items' images array without
  re-uploading the rest. Image removal is an idempotent
  operation: removing an image that is no longer in the array
  (e.g., a stale client view) MUST resolve with a clear
  "already removed" result rather than an error. Removing an
  image MUST shrink the array in-place while preserving the
  relative order of the remaining images. A chef MAY reduce
  the array all the way to empty; an item with zero images is
  a valid state (the customer surface renders the design-
  system's default item placeholder).
- **FR-012b**: The image-upload endpoint (`POST /chef/items/:id/images`
  in the implementation plan's task 4.4) MUST be rate-limited
  per-chef at **20 successful uploads per 60-second rolling
  window**, on top of Phase 1's default `60 req / 60 s / IP`
  ceiling. The cap reuses Phase 1's single `default` throttler
  tier name — no new named tier is introduced (Phase 1 R7
  single-tier rule). A request refused by this throttle MUST
  return the standard rate-limit refusal shape with a clear
  "you're uploading too fast — please retry shortly" message
  (rendered in the recipient's current in-app language per
  FR-029), MUST NOT consume image storage, and MUST emit an
  FR-032 event with outcome `rate_limited` so operators can
  see abusive upload loops in the log stream. The per-chef
  cap is intentionally permissive enough to cover a realistic
  burst (4 items × 5 photos per item = 20 uploads in one
  shoot) without forcing legitimate chefs to slow their
  workflow.
- **FR-013**: A successful image upload MUST result in the
  item's images array containing the appended image URL(s) at
  the end of the stored order. A failed upload (validation
  refusal, transport failure, post-cap refusal, rate-limit
  refusal per FR-012b) MUST leave the item's existing images
  array unchanged. A successful image removal MUST result in
  the item's images array no longer containing the removed
  URL; a failed removal MUST leave the array unchanged.
- **FR-014**: A verified chef MUST be able to soft-delete one of
  their own items. A soft-deleted item MUST NOT appear on any
  customer-facing surface and MUST NOT appear in the chef's own
  browse list; the row is preserved in the data store for audit
  purposes (constitution principle IV).
- **FR-015**: A verified chef MUST be able to read the list of
  items under one of their own menus, including items they
  have marked inactive. Items belonging to a different chef
  MUST NOT be readable through this chef-scoped path under any
  circumstances (no cross-chef identifier disclosure leak).

#### Server-authoritative pricing helper

- **FR-016**: The platform MUST compute every item's effective
  sell price server-side from `(price, discountValue,
  discountUnit)` using one single canonical helper. With unit
  `fixed`, effective price = max(price - discountValue, 0).
  With unit `percent`, effective price = max(price × (1 -
  discountValue / 100), 0). Every customer-facing item read
  MUST return both the base price and the effective price; the
  client MUST NEVER compute the effective price itself
  (constitution principle II). This same helper is the canonical
  authority that Phase 5 (cart totals) and Phase 6
  (`OrderItem.price` and `OrderItem.priceBeforeDiscount`
  snapshots) reuse.

#### Customer-facing chef profile read (menus + items)

- **FR-017**: When a signed-in customer reads a verified, non-
  soft-deleted chef's public profile, the platform MUST return
  one section per menu that is today-available. A menu is
  "today-available" iff its "available every day" flag is set,
  OR a row exists in its day-of-week availability for today's
  weekday. "Today" is computed against the **Africa/Cairo wall
  clock** at request time — the platform-wide single source of
  truth, regardless of the requesting device's locale or the
  chef's kitchen coordinates. The weekday rolls over exactly
  at midnight Cairo time. The Africa/Cairo zone is the
  authoritative zone for every customer-facing read in Phase
  4 (chef profile, Home strips, Explore results' open/closed
  derivations); the request's transport timestamp is NOT
  used.
- **FR-018**: Inside each included menu section, the platform
  MUST return only items that are NOT soft-deleted AND are
  marked active. Each returned item MUST carry: bilingual name,
  bilingual description, base price (as a decimal string —
  monetary fields are decimal-string per the Foundation phase),
  effective price (as a decimal string, computed per FR-016),
  image URLs in their stored display order, the item's display
  order within the menu, and a boolean `inStock` flag set to
  `true` when the item's stock count is the unlimited sentinel
  OR is > 0, otherwise `false`. Returned menu sections MUST be
  sorted by `(Menu.displayOrder ASC, Menu.createdAt ASC,
  Menu.id ASC)`, and within each section items MUST be sorted
  by `(Item.displayOrder ASC, Item.createdAt ASC, Item.id
  ASC)`. The deterministic tiebreaker (`createdAt`, then `id`)
  exists so that any rows whose order was last set before a
  reorder — or rows created between reorders — still surface
  in a predictable order to the customer.
- **FR-019**: When a verified chef has zero menus that are
  today-available, OR has today-available menus but none of them
  contain any active non-soft-deleted item, the platform MUST
  still return the chef's profile header successfully (the chef
  exists, is verified, and is not soft-deleted) and the menu
  region MUST be returned as an empty collection so the client
  can render a clear "no items available right now" empty
  state rather than a confusing partial response.
- **FR-020**: Profile reads for chefs that are not verified
  (still pending or rejected per Phase 3 FR-003 / FR-010) OR
  that are soft-deleted (per Phase 3 FR-012a or via Foundation
  policy) MUST be refused as if the identifier did not exist
  — the same response shape as a genuinely missing chef
  identifier — so the response does not leak the existence of
  a pending or revoked chef at that identifier.

#### Home surface (entry point)

- **FR-021**: A signed-in customer reading the Home surface MUST
  receive: a personalised greeting payload sufficient for the
  client to render the customer's name in their current in-app
  language; a horizontal-scroll list of currently-open verified
  chefs ordered per Phase 3 FR-016 (with chef header data:
  identifier, name, logo, current rating, total reviews so far);
  the cuisine-category catalogue (reading from Phase 3's
  `GET /categories`); and a top-rated grid of verified chefs.
  The Home surface MUST never return a soft-deleted chef, a
  pending chef, a rejected chef, or a chef whose row is no
  longer in a verified state.
- **FR-022**: The top-rated grid on Home MUST be ordered by the
  chef's current rating descending. Ties (including the
  zero-review case where every chef has rating 0 until Phase 7
  ships reviews) MUST be broken by verified-newest-first
  (chefs verified most recently surface first), mirroring the
  Phase 3 FR-016 verified-newest tiebreaker so the user sees a
  consistent priority signal across surfaces.

#### Explore surface (search + filter + paginate)

- **FR-023**: A signed-in customer reading the Explore surface
  MUST be able to combine: a free-text search across chef
  public name and bio (case-insensitive substring match, per
  Phase 3 FR-015), a category filter (per Phase 3 FR-014), and
  pagination (per Phase 3 FR-017). All three apply together
  and are server-evaluated; the client MUST NEVER receive an
  unfiltered list and apply filters locally (constitution
  principle II).
- **FR-024**: The Explore search input on the client MUST be
  debounced before issuing a backend request so a customer
  typing a query does not trigger one request per keystroke.
  Concurrent in-flight requests that are superseded by a newer
  query MUST be cancelled (or their responses ignored) so a
  late slow response cannot overwrite a fresh fast one.
- **FR-025**: Tapping a category chip on Home MUST navigate the
  customer to Explore with that category pre-applied as a
  filter; the customer MUST be able to remove the filter from
  the Explore surface.

#### Ownership and isolation

- **FR-026**: Every chef-side menu, item, availability, and
  image mutation MUST verify that the authenticated caller is
  the verified chef who owns the chef row that the target menu
  or item belongs to. A request whose target is owned by a
  different chef MUST be refused with the same response shape
  as if the target did not exist (no identifier-disclosure
  leak between chefs).
- **FR-027**: Soft-deleted menus, soft-deleted items, and items
  belonging to soft-deleted menus MUST NOT appear in any
  customer-facing read, in any chef-scoped read, or in any
  search or category filter. The Foundation phase's soft-delete
  read filter MUST apply uniformly here.

#### Internationalization & layout direction

- **FR-028**: Every Phase 4 customer-facing surface (Home,
  Explore, chef profile menu sections and item cards, in-stock
  and out-of-stock copy, discount badge copy, empty states,
  validation messages) MUST be available in both English and
  Arabic, MUST honour the in-app language override established
  in Phase 1, and MUST render Arabic with right-to-left layout
  end-to-end. No string in this phase MAY be hardcoded in
  either language.
- **FR-029**: Every chef-facing Phase 4 surface (menu editor,
  item editor, image upload dialog, day-of-week picker,
  validation messages, empty states in the chef's own menu
  browse list) MUST be available in both English and Arabic
  with RTL parity. No chef-facing string in this phase MAY be
  hardcoded in either language.
- **FR-030**: Menu and item bilingual fields (name, description)
  MUST be stored such that both an English and an Arabic value
  are accepted. The client MUST resolve which value to render
  from the recipient's current in-app language; if one locale
  is empty for a row (legacy data, partial entry), the surface
  MUST fall back to the other locale rather than rendering an
  empty string.

#### Input shape

- **FR-031**: Every Phase 4 request shape MUST inherit the
  Foundation phase's request-shape validation: extra fields
  beyond the documented shape are refused with a clear
  validation error, consistent with the Phase 1, Phase 2, and
  Phase 3 contracts.

#### Observability of menu / item events

- **FR-032**: Every significant menu / item event MUST emit a
  structured application-log line so support and the Phase 12
  security review have one uniform diagnostic surface across
  identity (Phase 1), addresses (Phase 2), the chef supply
  side (Phase 3), and the chef catalogue (this phase). The set
  of significant events is: menu created, updated, soft-deleted,
  bulk-reordered (success and refusal — including ownership
  refusal, validation refusal, non-exact-set refusal per
  FR-002a); menu availability added or removed (success and
  refusal); item created, updated, soft-deleted, active-toggled,
  bulk-reordered (success and refusal — including ownership
  refusal, validation refusal, negative-effective-price refusal,
  non-exact-set refusal per FR-009a); item image uploaded
  (success and refusal —
  including file-type, 3 MB size, 5-image-per-item count
  refusals per FR-012, and `rate_limited` refusal per FR-012b);
  item image removed (success — including
  the idempotent "already removed" outcome — and refusal —
  including ownership refusal per FR-012a). Each log line MUST carry: event type,
  outcome, timestamp, source IP, actor identifier, target
  identifier (menu ID, item ID — whichever applies), and a
  correlation identifier that ties together the events of one
  request lifecycle, mirroring the Phase 1 FR-020, Phase 2
  FR-019, and Phase 3 FR-038 line shape.
- **FR-033**: Client-visible error responses from every Phase 4
  endpoint MUST NOT echo any latitude / longitude /
  coordinates field that may incidentally appear in the
  surrounding context (the chef's kitchen coordinates are
  reachable via the chef relationship — they MUST NOT leak via
  a menu / item error path), mirroring the Phase 2 FR-021 and
  Phase 3 FR-039 scrub contract.

### Key Entities *(include if feature involves data)*

Phase 4 materialises behaviour for two entities the constitution
already defines and the Foundation phase already migrated, and
reads a third in a new way:

- **Menu**: A container of items owned by exactly one verified
  chef, carrying a bilingual name, a single category reference,
  a display order within that chef's menu list, an "available
  every day" flag, the standard timestamps including the
  Foundation's soft-delete marker, and a collection of
  day-of-week availability rows. Phase 4 is the first phase
  that creates, mutates, or soft-deletes rows in this entity.
- **Item**: A menu's individual food offering, identified by an
  internal identifier, carrying a bilingual name and bilingual
  description, a base price (Decimal, monetary), a discount
  value and discount unit pair, a stock count (with a
  platform-defined sentinel value meaning unlimited), an active
  flag, a display order within its menu, an images array, and
  the standard timestamps including the Foundation's
  soft-delete marker. Phase 4 is the first phase that creates,
  mutates, or soft-deletes rows in this entity. The Cart
  (Phase 5) and OrderItem (Phase 6) entities reference items
  but do not create them.
- **MenuAvailability**: A weekday-marker row that, together
  with the Menu's `availableAllDays` flag, decides whether a
  menu is today-available. Each row pairs one menu with one
  weekday integer 0–6. The pair (menu, weekday) is unique per
  menu. Phase 4 is the first phase that creates or deletes
  rows in this entity.
- **Category** (existing, Phase 3): Phase 4 reads it through
  the Phase 3 `GET /categories` endpoint to populate the
  category chips on Home and the category filter on Explore,
  and reads it via the Menu.categoryId relation to surface
  the chef's category chips on the chef profile (Phase 3 FR-018
  already enumerated this on the profile contract). Phase 4
  does not mutate categories.
- **Chef** (existing, Phase 3): Phase 4 reads it through the
  Phase 3 chef discovery and chef profile contracts. Phase 4
  does not mutate the Chef entity. The "today-available"
  filter at FR-017 sits on top of the Phase 3 chef-profile
  read.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A verified chef can create a complete menu
  (bilingual name, category, day-of-week availability or
  "available every day") in under 60 seconds on a real device
  under normal network conditions. (User Story 1.)
- **SC-002**: A menu's day-of-week availability is honoured
  exactly against the Africa/Cairo wall clock: for a menu
  scheduled on Sunday + Wednesday only, a customer reading
  the chef's profile on any other weekday (Cairo-time) does
  NOT see the menu section, in 100% of test cases across
  every weekday. A request that crosses midnight Cairo time
  mid-flight resolves against the wall-clock weekday at
  request-handler entry, not the device's local weekday.
  (User Story 1, FR-017.)
- **SC-003**: A menu whose `availableAllDays` flag is set
  always returns the menu section regardless of weekday, in
  100% of test cases across every weekday (Cairo-time). (User
  Story 1, FR-017.)
- **SC-004**: A verified chef can add a complete item
  (bilingual name and description, price, optional discount,
  stock count, at least one image) under one of their menus in
  under 90 seconds on a real device under normal network
  conditions. (User Story 2.)
- **SC-005**: For every chef-submitted item, the customer-facing
  read returns both the base price and the effective price,
  both formatted as decimal strings, with the effective price
  exactly equal to the value computed by the server-side
  helper for that `(price, discountValue, discountUnit)`
  triple, in 100% of cases. The client never recomputes the
  discount. (User Story 2, FR-016, FR-018.)
- **SC-006**: A chef submission whose `(price, discountValue,
  discountUnit)` would produce a negative effective price is
  refused at validation time with a clear message, in 100% of
  cases. An item with effective price exactly 0 is accepted
  and renders to the customer with effective price "0.00".
  (User Story 2, FR-010.)
- **SC-007**: Image uploads are refused for: any file type
  outside {JPEG, PNG, WebP}; any file larger than 3 MB; any
  upload that would push the item's image count above 5 — in
  100% of cases, with a clear per-violation validation message,
  and the item's existing image array left unchanged. A
  successful upload appends the new image URL(s) at the end of
  the stored order and leaves the previously-stored URLs (and
  their relative order) untouched. (User Story 2, FR-012,
  FR-013.)
- **SC-007a**: A verified chef can remove a single image from
  one of their own items' images array without re-uploading
  the rest; removing the same image a second time resolves
  with an idempotent "already removed" outcome rather than an
  error; removing every image is permitted and the item is
  still readable on the customer surface (rendered with the
  design-system default-item placeholder), in 100% of test
  cases. (User Stories 2 + 5, FR-012a, FR-013.)
- **SC-007b**: A scripted client that issues 25 successive
  image uploads as one verified chef within a 60-second
  window observes exactly the first 20 succeed and the next
  5 refused with the standard rate-limit refusal shape and
  outcome `rate_limited`; the refused uploads consume no
  image storage and surface a clear in-app-language message
  per FR-012b, in 100% of test runs. (User Story 2, FR-012b.)
- **SC-007c**: A chef submission whose trimmed bilingual
  name on `Menu` or `Item` exceeds 60 characters on either
  locale, OR whose trimmed bilingual description on `Item`
  exceeds 500 characters on either locale, OR whose trimmed
  value on any required bilingual field is empty on either
  locale, is refused with a clear per-field, per-locale
  validation message in 100% of cases; the row is not
  created or modified. (User Stories 1 + 2, FR-001, FR-007.)
- **SC-007d**: A verified chef who bulk-reorders their menus
  (or their items inside one menu) sees the new order
  reflected on the next customer read of their profile, in
  the exact sequence they submitted, in 100% of cases. A
  bulk-reorder submission whose identifier set does NOT
  exactly cover the chef's current non-soft-deleted
  collection (missing IDs, unknown IDs, duplicates) is
  refused with a clear validation message and the previously
  stored order is unchanged. A reorder transaction that
  fails mid-way leaves the entire collection at its prior
  order — no partial reorder is ever visible to a reader,
  in 100% of test cases. (User Story 5, FR-002a, FR-009a.)
- **SC-007e**: Two menus or two items under the same parent
  that share a `displayOrder` value (e.g., legacy rows from
  before the first reorder, or rows created between
  reorders) ALWAYS surface in the same deterministic order
  on every read because the read sort is
  `(displayOrder ASC, createdAt ASC, id ASC)` on both the
  customer-facing and chef-facing paths, in 100% of test
  cases. (User Stories 3 + 5, FR-006, FR-018.)
- **SC-008**: For a signed-in customer reading a verified
  chef's profile on a given weekday, the response contains
  EXACTLY the menus that are today-available (per FR-017) and
  EXACTLY the items inside them that are active and not
  soft-deleted (per FR-018), across an exhaustive seeded
  dataset of {soft-deleted menus, inactive items, soft-deleted
  items, menus scheduled for other weekdays, menus with
  `availableAllDays` set}, in 100% of cases. (User Story 3.)
- **SC-009**: A chef whose row is soft-deleted OR not verified
  returns the same response shape on a profile read as a
  genuinely missing chef identifier, in 100% of cases. No
  client can distinguish the two from the response. (User
  Story 3, FR-020.)
- **SC-010**: The Home surface returns the personalised
  greeting, the open-chefs scroll, the category chips, and
  the top-rated grid in a single read; the top-rated grid is
  ordered by current rating descending with a deterministic
  verified-newest-first tiebreaker, in 100% of cases. (User
  Story 4, FR-021, FR-022.)
- **SC-011**: Tapping a category chip on Home navigates to
  Explore with that category pre-applied as a filter, and the
  filter can be removed from the Explore surface, in 100% of
  test cases. (User Story 4, FR-023, FR-025.)
- **SC-012**: Typing a search term on Explore at a realistic
  typing speed (≥ 200 ms between keystrokes triggers a
  request; faster keystrokes do not) produces at most one
  in-flight request at a time; superseded in-flight requests
  are cancelled or their responses ignored such that the
  rendered results always match the last-typed query, in 100%
  of test cases. (User Story 4, FR-024.)
- **SC-013**: A chef-edited price, discount, active flag, or
  soft-delete is reflected on the next read of the chef's
  public profile by a different customer's session, with no
  stale data, in 100% of cases. (User Story 5, FR-009,
  FR-011, FR-014.)
- **SC-014**: A chef A obtaining a mutation request URL for
  any menu, item, availability row, or image upload that
  belongs to a different chef B is refused with the same
  response shape as if the target did not exist, in 100% of
  cases. No cross-chef identifier leak is observable in the
  response. (User Story 5, FR-026.)
- **SC-015**: 100% of strings shown on Phase 4 customer-facing
  mobile surfaces (Home greeting, tab labels, open-chefs
  scroll header, category chips, top-rated grid header,
  Explore search placeholder, category filter labels,
  pagination loaders, menu section headers, item card name
  and description, base price, effective price, discount
  badge copy, in-stock and out-of-stock copy, empty states)
  are localised in both English and Arabic, and the Arabic
  version renders right-to-left end-to-end on a real device.
  (User Story 6, FR-028.)
- **SC-016**: 100% of strings shown on Phase 4 chef-facing
  mobile surfaces (menu editor labels, item editor labels,
  day-of-week picker, image upload dialog, validation error
  messages, empty states in the chef's own browse list) are
  localised in both English and Arabic, and the Arabic
  version renders right-to-left end-to-end on a real device.
  (User Story 6, FR-029.)
- **SC-017**: For each Phase 4 body-accepting endpoint (menu
  create, menu update, menu bulk-reorder, menu availability add
  and remove, item create, item update, item bulk-reorder, item
  soft-delete, item image upload, item image remove) a request
  body containing one extra undocumented field is refused with a
  clear validation error in 100% of cases. (FR-031.)
- **SC-018**: For every Phase 4 event named in FR-032,
  exactly one structured log line is emitted per request
  lifecycle, carrying event type, outcome, timestamp, source
  IP, actor identifier, target identifier, and a correlation
  identifier — and never carrying any latitude / longitude /
  coordinates field. Verified by inspecting the log stream
  during a scripted run that exercises each event type at
  least once. (FR-032, FR-033.)
- **SC-019**: For every Phase 4 client-visible error response
  (validation rejection, ownership refusal, role refusal,
  soft-deleted-category refusal, oversize-image refusal,
  too-many-images refusal, wrong-file-type refusal,
  not-found-or-not-yours refusal on profile / menu / item),
  the response body is inspected and MUST NOT contain
  latitude / longitude / coordinates or any
  coordinate-derived value, in 100% of cases. (FR-033.)
- **SC-020**: A first-time customer who opens the app
  immediately after Phase 4 ships (with a seeded chef who has
  one menu and three items, including one item carrying a
  discount and one item out of stock) can navigate Home →
  chef profile → item card and visually confirm the
  discounted price (with a struck-through original), the
  photos, and the out-of-stock indicator on the second item,
  in under 30 seconds, on a real device. (User Stories 3 + 4
  end-to-end.)

## Assumptions

- The Foundation phase (Phase 0), Phase 1 (Authentication &
  Users), Phase 2 (Addresses & Map Picker), and Phase 3
  (Categories, Chef Application & Verification) are in place:
  a verified-chef role exists, request-shape validation and the
  soft-delete read filter are active, the menu / item / menu
  availability tables are migrated from the canonical schema,
  the category catalogue is seeded, the chef discovery surface
  contracts are live (FR-013 – FR-017 of Phase 3), and the
  chef public profile read returns the chef header (FR-018 of
  Phase 3) onto which Phase 4 grafts the today-available menu
  sections.
- **Bilingual fields are stored as `{ en, ar }` JSON objects**
  on the row, mirroring the Phase 3 category-name contract
  and the Notification payload contract. The client receives
  both locales in every read and renders the locale that
  matches the recipient's current in-app language (FR-030).
- **The discount value, the discount unit, and the base price
  are the only inputs to the effective-price helper.** There
  is no time-windowed promotion, no per-customer pricing, no
  bulk-buy rule, and no chef-set rounding override. Future
  pricing features remain a future, additive change subject to
  a constitution amendment because they touch the
  server-authoritative pricing contract.
- **Stock decrement on order placement and restoration on
  order cancellation are Phase 6 concerns.** Phase 4 only
  STORES the stock count and reports the in-stock flag on
  reads. Phase 6 is responsible for the conditional-update
  decrement pattern (D2 in the implementation plan); Phase 4
  must not pre-empt that contract.
- **Item images are uploaded to platform-controlled storage
  via the same upload pipeline Phase 3 used for chef logo and
  banner.** The exact storage backend is a planning-level
  decision, not a specification decision. The 5-image-per-item
  cap and the 3 MB per-image cap are the Phase 4 contract.
- **The default page size for Home strips and Explore
  pagination is the Phase 3 default** (a sane mobile-list
  default, e.g., 20–30 entries) and is not relitigated here.
- **A chef-set `is_open` toggle (Phase 3) is independent of
  menu day-of-week availability (Phase 4).** A currently-open
  chef whose today's menus are empty will still appear in
  Home's open-chefs scroll but their profile renders the "no
  items available today" empty state. A currently-closed chef
  with today-available menus will still render those menus on
  their profile; whether the customer can order them is the
  Phase 6 order-time check, not a Phase 4 read-time check.
- **The "top-rated" grid on Home reads a chef's current
  rating field (populated by Phase 7 once reviews ship).**
  Until Phase 7 ships, every chef's rating is 0 and the
  ordering collapses to the verified-newest-first tiebreaker,
  which is acceptable — the grid still renders without an
  error.
- **The admin web dashboard does NOT receive new Phase 4
  surfaces.** Admin oversight of menus and items is an admin
  v2 capability (a Phase 11 candidate at most). Phase 4 ships
  only mobile-side chef and customer surfaces and the
  backend contracts that serve them.
- **Performance targets in Success Criteria assume a typical
  mobile network connection and a recent mobile device,
  consistent with the project's baseline expectations** and
  with the Phase 2 / Phase 3 specs' stated baselines.
- **The set of categories a customer sees on Home and Explore
  comes from the Phase 3 `GET /categories` endpoint, not from
  Phase 4.** Phase 4 reads the catalogue; it does not curate
  it. Admin curation of the catalogue is the Phase 3 FR-027
  contract.
