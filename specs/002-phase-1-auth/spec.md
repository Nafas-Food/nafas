# Feature Specification: Authentication, Users, and Phone Verification

**Feature Branch**: `002-phase-1-auth`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "Read phase 1 from docs/IMPLEMENTATION_PLAN.md - and according to the best practices of GitHub's Spec Kit create the second spec."

## Overview *(non-mandatory context)*

Phase 1 is the first phase that turns the Foundation (Phase 0) into something a
real person can actually use. Until Phase 1 lands, no part of the platform
knows who is talking to it: there is no concept of a "signed-in customer", no
way to distinguish two requests from each other, no way to scope data to its
owner. Every later phase — addresses (Phase 2), chef application (Phase 3),
menus (Phase 4), cart (Phase 5), orders (Phase 6) — reads or writes data that
belongs to *somebody*, so they all hard-depend on Phase 1 standing up
identity.

The deliverable is therefore not a feature in the user-facing sense; it is the
**identity substrate** the rest of the product is built on:

1. A way for a brand-new customer to **prove they own a phone number** and
   walk away with a working account.
2. A way for a returning customer to **sign back in** from any device using
   that phone number plus a password they chose.
3. A way for the platform to **keep them signed in** safely — short-lived
   access credentials, longer-lived refresh credentials, rotation on every
   refresh, immediate revocation on sign-out, and rejection of any reused
   credential.
4. A way for the customer to **maintain their own profile** (name, email,
   phone) — with phone changes gated by a fresh phone-verification step
   because the phone is the customer's identity.
5. A **bilingual (English + Arabic) and right-to-left-aware** entry experience
   from the welcome screen onward, because the product targets Egyptian
   customers and the language toggle must be in place before any later
   phase ships UI.
6. **Rate limiting and abuse-resistance** on the public auth endpoints, so
   the SMS-verification flow can't be turned into a spam vector and the
   sign-in endpoint can't be brute-forced.

If any of these is missing or unreliable, every later phase pays the cost
multiple times. So Phase 1 is "done" only when each is verifiable end-to-end
on a real device.

## Clarifications

### Session 2026-05-04

- Q: What constitutes a valid password at registration? → A: Minimum length 8 characters, no character-class rules (no required digits, uppercase, symbols). Aligns with current NIST SP 800-63B guidance — relies on length plus the platform's other controls (phone-OTP at registration, rate-limited sign-in, server-side password hashing) rather than composition rules that demonstrably push users toward predictable patterns without raising entropy.
- Q: What rate-limit threshold applies to the remaining auth endpoints (register, sign-in, refresh)? → A: 10 requests per 15 minutes per source IP, applied uniformly across register, sign-in, and refresh. Tight enough to slow credential-stuffing while loose enough to tolerate a real customer mistyping a password or retrying on a flaky network. (Send-OTP retains its tighter ≤3/min/IP per FR-016.)
- Q: At what granularity does the platform record auth events for later debugging and security review? → A: Structured application logs only — every significant auth event (OTP send, OTP verify, sign-in success, sign-in failure, refresh exchange, sign-out, soft-delete-blocked refresh, password-validation rejection, rate-limit trip) emits a structured log line carrying actor identifier (when known), source IP, timestamp, event type, and outcome. No new database entity is introduced; a persisted audit-log table is deliberately deferred to a future phase via constitution amendment if a real need emerges.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new customer signs up by verifying their phone (Priority: P1)

A first-time visitor opens the app, taps "create account", types in their
phone number, and waits a few seconds for a one-time verification code to
arrive on that phone. They type in the code, fill out their name, password,
and birthdate, and tap "register". They land on the customer home screen
already signed in. From this moment forward they can do anything a customer
can do.

**Why this priority**: Without this story, no customer can reach any other
feature. It is the smallest slice of Phase 1 that delivers real value on its
own — even a visitor who never returns has a verified account.

**Independent Test**: A teammate with a real phone they have never used on
this platform follows the documented sign-up flow on the mobile app, receives
the verification code on that phone, enters it, completes the form, and
arrives at the customer home screen — without using anybody else's
credentials and without intervention from a maintainer.

**Acceptance Scenarios**:

1. **Given** a phone number that no verified account is using, **When** the
   visitor requests a verification code for it, **Then** the platform
   delivers a verification code to that phone within seconds.
2. **Given** the visitor has received a valid verification code within the
   provider's validity window, **When** they submit the code together with
   their full name, password, and birthdate, **Then** the platform creates
   a customer account, marks the phone as verified, signs the customer in,
   and routes them to the customer home screen.
3. **Given** the visitor submits a verification code that does not match the
   one issued (or one that has expired), **When** the platform processes the
   submission, **Then** registration is refused with a clear "code does not
   match or has expired" error and no account is created.
4. **Given** a phone number already attached to a verified account, **When**
   another visitor attempts to register that same phone number, **Then** the
   platform refuses with a clear conflict error indicating the phone is
   already in use.
5. **Given** the visitor has already requested three verification codes from
   the same source within the last minute, **When** they request a fourth,
   **Then** the platform refuses with a clear "wait and retry" message and
   does not send another code.

---

### User Story 2 - A returning customer signs in (Priority: P1)

A customer who has registered before — possibly on another device — opens the
app, types in their phone number and password, and lands back on the customer
home screen with their saved data (favourites, addresses, order history)
ready to use.

**Why this priority**: Equally critical: registration alone is single-use.
Without sign-in, the customer can register but never come back. This unblocks
the second-and-Nth-session use case.

**Independent Test**: A customer who registered earlier signs out on device A
and signs in on device B using the same phone+password. They reach their
home screen with their account state intact.

**Acceptance Scenarios**:

1. **Given** a customer with a verified account, **When** they submit their
   correct phone number and password, **Then** the platform returns an active
   session and routes them to the home screen appropriate to their role.
2. **Given** a customer submits a wrong password (or a phone with no
   account), **When** the platform processes the request, **Then** the
   platform refuses with a generic "phone or password is incorrect" error
   that does not disclose which of the two was wrong.
3. **Given** a customer's account has been soft-deleted, **When** they
   attempt to sign in, **Then** the platform refuses as if the account did
   not exist (the soft-delete is not exposed to the caller).
4. **Given** the same source has exceeded the documented sign-in rate
   threshold, **When** further sign-in attempts arrive, **Then** the
   platform throttles them with a clear retry-after message.

---

### User Story 3 - A customer's session is silently kept alive (Priority: P2)

A customer signed in last week, closes the app, takes the bus to work, opens
the app again. The app does not ask for their password. Behind the scenes,
the app's short-lived access credential has long since expired, but the
customer never notices: the platform mints a new one from the refresh
credential the device kept securely, and the customer's first action lands
on the new credential.

**Why this priority**: Sessions that force a re-login every hour drive
customers away. This is the difference between an app that feels like a
product and an app that feels like a chore. It is also the single biggest
source of subtle correctness bugs (token replay, parallel-request thundering
herd, rotation drift), so the platform's behaviour here must be explicit and
tested.

**Independent Test**: A customer signs in, force-closes the app, waits long
enough that the access credential is past its lifetime, reopens the app, and
watches their profile + recent orders load. They are never prompted to
re-enter their password. A separate test fires many parallel requests at the
moment of credential expiry and observes that exactly one refresh exchange
takes place.

**Acceptance Scenarios**:

1. **Given** a customer who signed in on a device and closed the app, **When**
   they reopen the app while the refresh credential is still within its
   lifetime, **Then** the app silently restores the session and lands the
   customer on their home screen with no password prompt.
2. **Given** an active session whose access credential has just expired,
   **When** the app makes any authenticated request, **Then** the platform
   mints a new access credential using the refresh credential, the original
   request is retried with the new credential, and it succeeds — all without
   surfacing an authentication error to the customer.
3. **Given** the access credential expires while several requests are in
   flight at once, **When** all of those requests receive an
   "unauthenticated" response, **Then** exactly one refresh exchange is
   issued (the others queue), and once it completes every queued request
   retries with the new credential and succeeds.
4. **Given** a refresh credential has just been used (and therefore rotated
   into a new pair), **When** any actor presents that *old* refresh
   credential again, **Then** the platform rejects it, even though its
   signature still verifies and its expiry has not lapsed.
5. **Given** a customer has not used the app for longer than the refresh
   credential's lifetime, **When** they reopen the app, **Then** the
   platform routes them to the welcome screen and they must re-sign-in.

---

### User Story 4 - A customer maintains their own profile (Priority: P2)

The customer realises they signed up with a typo in their name. They open
their profile, fix the name, and save. Months later they switch SIM cards;
they open their profile, type in the new phone number, receive a fresh
verification code on that new phone, and only then is the change committed
to their account. Their old phone number is no longer their identity.

**Why this priority**: Profile correctness drives every order. A wrong name
on an order makes the courier hesitate; a stale phone number makes the chef
unreachable. The phone-change-requires-OTP rule is the security half of this
story — without it, anyone who steals a session could move the account onto
their own phone.

**Independent Test**: A customer changes their full name and confirms it
appears correctly in their profile reads. A separate test changes the phone
number, observes that the change is *not* applied until a verification code
delivered to the *new* phone is verified, and confirms the change conflicts
with another verified account using that new phone.

**Acceptance Scenarios**:

1. **Given** an authenticated customer, **When** they submit a change to any
   subset of {full name, email}, **Then** the change is accepted and visible
   in subsequent profile reads.
2. **Given** an authenticated customer wants to change their phone number,
   **When** they submit a new phone number, **Then** the platform issues a
   verification code to the *new* phone and does not apply the change until
   the customer submits the matching code.
3. **Given** the customer attempts to change their phone to one that is
   already attached to another verified account, **When** they submit,
   **Then** the platform refuses with a clear conflict error.
4. **Given** an authenticated customer registers a push-notification token
   for their current device, **When** they later register a different token
   from a different (or re-installed) device, **Then** the platform stores
   the most recently registered token for that customer and uses it for any
   subsequent push.

---

### User Story 5 - A customer signs out and their refresh credential is immediately revoked (Priority: P3)

A customer hands their unlocked phone to a friend who they trust right now
but maybe not in six weeks. The customer signs out. The platform must treat
the refresh credential the customer was holding as dead from this moment on
— not at the end of its lifetime, but right now. If the friend later finds
that credential cached somewhere on the device and tries to use it, the
platform must refuse.

**Why this priority**: Lower frequency than sign-in/sign-up but very
high-stakes when it happens. It is the only mechanism the customer has to
revoke a session under their own control.

**Independent Test**: A customer signs out. An attacker (simulated by a test)
captures the customer's refresh credential before sign-out and tries to use
it after sign-out. The platform refuses.

**Acceptance Scenarios**:

1. **Given** an authenticated customer, **When** they sign out, **Then** the
   platform records their current refresh credential as revoked and clears
   the local session state on the device.
2. **Given** a refresh credential that has been signed out, **When** any
   actor presents it to mint a new session, **Then** the platform refuses
   even if the signature still verifies and the expiry has not lapsed.

---

### User Story 6 - The customer reaches the app in their language, with proper layout direction (Priority: P3)

The customer's phone is set to Arabic. They open the app for the first time
and the welcome screen, the sign-in form, the registration form, the OTP
screen, and every validation message they see along the way are all in
Arabic, with right-to-left layout. Later they tap a language toggle to
switch to English; the app remembers that override across app restarts
( persisted in AsyncStorage — not across reinstalls, which would require
account-backed storage out of Phase 1 scope).

**Why this priority**: Lower priority than the auth flow itself (a customer
can struggle through English to register), but the language infrastructure
must be in place from Phase 1 because every subsequent phase ships
user-facing UI on top of it. Adding bilingual + RTL after the fact is a
class of work that compounds across screens.

**Independent Test**: A customer with an Arabic-locale device opens the app
fresh and reaches the customer home screen having seen Arabic + RTL on every
auth screen. A second customer with an English-locale device sees English
+ LTR on every auth screen. A third customer toggles language manually,
restarts the app, and observes the override has stuck.

**Acceptance Scenarios**:

1. **Given** a device whose system language is Arabic, **When** the customer
   opens the app for the first time, **Then** the welcome / sign-in /
   register / verify-OTP screens render in Arabic with right-to-left layout.
2. **Given** a customer manually switches the in-app language to English,
   **When** they close and reopen the app, **Then** the manual override is
   honoured (English + LTR), regardless of the device system language.
3. **Given** validation errors occur during sign-in or registration in
   Arabic mode, **When** they are displayed, **Then** they are rendered in
   Arabic.

---

### Edge Cases

- **OTP delivery fails on the provider's side**: The verification provider
  is reachable but reports a transient failure (or the SMS never arrives
  due to a carrier issue). The app surfaces a clear "couldn't send code,
  try again" error and lets the customer retry without an infinite spinner.
- **Customer denies push-notification permission**: After successful
  registration, the app asks for notification permission. If the customer
  denies, the app continues without registering a push token. Subsequent
  permission state changes are honoured but Phase 1 does not pester.
- **Customer is signed in on multiple devices**: Each device holds its own
  refresh credential. Signing out on device A does not sign out device B
  (the refresh-credential blacklist is per-credential, not per-user).
  Global-sign-out is explicitly out of scope for Phase 1.
- **Network offline during sign-in**: The app surfaces a clear network
  error. A previously restored session continues to be honoured locally
  (read-only behaviour from cached state) until the network returns; that
  behaviour is owned by individual feature phases, not by Phase 1.
- **Clock skew between client and server**: Access-credential expiry is
  server-authoritative. Small client clock drift is tolerated by the
  refresh flow because expiry is checked on the server.
- **Verification code intercepted and replayed**: A code, once verified
  successfully, MUST NOT be reusable for another registration or another
  phone change. The verification provider enforces single-use; the
  platform does not store or echo codes.
- **Customer is soft-deleted while signed in**: The current access
  credential continues to work until it expires (no out-of-band revocation
  in v1), but the next refresh attempt MUST be refused so the customer
  cannot extend their session indefinitely. Hard real-time revocation is
  out of scope for Phase 1.
- **Refresh-credential lifetime exhausted**: When the refresh credential
  expires, the customer is shown the welcome screen and re-signs-in. No
  refresh-of-refresh mechanism in v1.
- **Daily cleanup of the revocation list**: The list grows without bound
  if not pruned. The platform's daily cleanup job (already wired in
  Phase 0) MUST visibly run and remove entries past their expiry from this
  phase onward (Phase 0 ran the job over an empty list; from Phase 1 it
  has real work).

## Requirements *(mandatory)*

### Functional Requirements

#### Identity model & registration

- **FR-001**: The platform MUST treat the phone number as the customer's
  primary identity. Phone numbers MUST be unique across all verified
  customer accounts.
- **FR-002**: An unauthenticated visitor MUST be able to request a one-time
  phone-verification code be delivered to a phone number. Code delivery
  MUST go through a third-party verification provider rather than be
  generated and stored by the platform itself.
- **FR-003**: Registration MUST require a valid one-time code obtained from
  the platform's send-code flow within the provider's documented validity
  window. A registration that does not present a matching, unexpired code
  MUST be refused with a clear error and MUST NOT create an account.
- **FR-004**: A successful registration MUST persist a customer account
  with a verified phone number, the customer-chosen full name, password,
  and birthdate, with the role "customer" by default.
- **FR-005**: The platform MUST refuse to register a phone number that is
  already attached to a verified customer account, with a clear conflict
  error.

#### Password handling

- **FR-006**: Customer passwords MUST be persisted as a one-way
  cryptographic hash; the platform MUST NEVER store, log, transmit, or
  return the plaintext password or any reversible encryption of it. The
  hashing algorithm MUST be a current, salted, work-factor-tunable
  password-hashing function.
- **FR-006a**: A customer-chosen password MUST be at least 8 characters
  long. The platform MUST NOT impose any character-class rules (no
  required digits, uppercase letters, or special characters), in line
  with current public guidance that composition rules push users toward
  predictable substitutions without measurably raising entropy. A
  password shorter than 8 characters MUST be refused at registration
  (and at any future password-change flow) with a clear validation
  error that names the minimum-length requirement.

#### Sessions, rotation, revocation

- **FR-007**: A successful authentication (registration or sign-in) MUST
  produce a session represented by two credentials: a *short-lived access
  credential* used to authenticate API requests, and a *longer-lived
  refresh credential* used only to mint new access credentials. The
  refresh credential's lifetime MUST be longer than the access credential's,
  and both MUST have a finite expiry.
- **FR-008**: On every refresh exchange the platform MUST rotate the
  refresh credential: the caller surrenders their current refresh
  credential, the platform records its identifier as revoked, and a new
  refresh credential is issued. Any subsequent presentation of the old
  (now-rotated) refresh credential MUST be refused, even if its signature
  still verifies and its expiry has not lapsed.
- **FR-009**: Sign-out MUST immediately record the customer's current
  refresh credential as revoked. Subsequent presentation of that
  credential MUST be refused, regardless of remaining expiry.
- **FR-010**: The revocation list MUST live on the platform's primary
  data store (no separate cache or external service in v1) and MUST be
  pruned by a scheduled job that removes entries past their expiry. The
  job runs from Phase 1 onward and MUST emit a log line on each run for
  verifiability.
- **FR-011**: A request to a non-public route without a valid access
  credential MUST be refused with a clear "unauthenticated" error. Routes
  MUST be authenticated by default; opting a route out of authentication
  MUST be an explicit, code-visible decision.

#### Profile & device

- **FR-012**: An authenticated customer MUST be able to update any subset
  of {full name, email}. The platform MUST validate the new values against
  the same shape rules used at registration.
- **FR-013**: An authenticated customer MUST be able to request a phone
  number change. The platform MUST issue a verification code to the *new*
  phone, and MUST NOT apply the change until the customer submits the
  matching code. Changing the phone to one already attached to another
  verified account MUST be refused with a clear conflict error.
- **FR-014**: An authenticated customer MUST be able to register the
  push-notification token for their current device. The platform MUST
  store at most one such token per customer; submitting a new token
  replaces any previously stored one for that customer.

#### Rate limiting & abuse resistance

- **FR-015**: Public auth endpoints (request code, register, sign-in,
  refresh) MUST be rate-limited per source IP to resist credential-
  stuffing and SMS-spam abuse.  Per-phone-number throttling is
  documented as an optional hardening measure for Phase 2; the Phase 1
  implementation uses a single per-IP tier (see research R7 and plan.md
  analysis A1 for why two named tiers would compound and over-throttle).
- **FR-016**: The send-code endpoint MUST throttle to no more than three
  requests per minute per source IP. Beyond that, the platform MUST
  refuse with a clear "wait and retry" message and MUST NOT incur any
  third-party cost.
- **FR-016a**: The remaining public auth endpoints — register, sign-in,
  and refresh — MUST throttle to no more than 10 requests per 15-minute
  rolling window per source IP, uniformly. Beyond the threshold the
  platform MUST refuse further requests with a clear "wait and retry"
  message naming the retry-after duration. The threshold MAY be
  tightened (but not loosened) by the Phase 12 security audit without
  invalidating this specification.
- **FR-017**: The platform MUST distinguish "phone not registered" from
  "wrong password" only internally; the externally visible sign-in error
  MUST be a single generic "phone or password is incorrect" message that
  does not disclose which of the two was wrong, so that valid phone
  numbers cannot be enumerated through the sign-in endpoint.

#### Internationalization & input shape

- **FR-018**: The customer-facing entry experience (welcome, sign-in,
  registration, OTP entry, and any validation messages they encounter on
  those screens) MUST be available in both English and Arabic. The
  platform MUST honour the device system language on first run, MUST
  honour and persist a manual in-app language override across app
  restarts, and MUST render Arabic with right-to-left layout end-to-end.
- **FR-019**: All Phase 1 request shapes MUST inherit, not re-implement,
  the Foundation phase's request-shape validation: requests with extra
  fields beyond the documented shape MUST be refused with a clear
  validation error. (This phase is the first that exercises that
  Foundation guarantee against real body-accepting endpoints, completing
  Phase 0's deferred SC-006 acceptance verification.)

#### Observability of auth events

- **FR-020**: Every significant auth event MUST emit a structured
  application-log line so that support and the Phase 12 security review
  have a uniform diagnostic surface. The set of significant events is:
  OTP-send (success and provider failure), OTP-verify (success and
  failure), sign-in (success, password-failure, unknown-phone,
  rate-limit trip), refresh (success, rotated/replayed credential,
  soft-deleted account), sign-out, password-validation rejection
  (FR-006a), and any rate-limit trip on FR-016 / FR-016a. The platform
  does NOT distinguish a soft-deleted-account sign-in attempt from an
  unknown-phone sign-in attempt in its log outcomes — both surface as
  `unknown_phone` because the platform's account lookup goes through the
  default soft-delete filter (Foundation phase). The distinction
  persists for `auth.refresh` only, where the bare-client lookup can
  detect a soft-deleted subject. Each log line MUST carry: event type,
  outcome, timestamp, source IP, actor identifier when known (customer
  ID, never plaintext password and never the OTP code), and a correlation
  identifier that ties together the events of one request lifecycle.
- **FR-021**: The platform MUST NOT persist auth-event records to the
  primary data store in Phase 1. A persisted audit-log entity is
  deliberately deferred to a future phase that, if and when introduced,
  MUST first amend the constitution's data-model section. Until then,
  application logs are the canonical diagnostic surface.

### Key Entities *(include if feature involves data)*

Phase 1 introduces no new business entities — it materialises behaviour for
two entities the constitution already defines and the Foundation phase
already migrated:

- **User**: A person with an account on the platform, identified by phone
  number, with a role (customer in Phase 1's registration path), an
  optional email, a full name, a birthdate, a phone-verified flag, an
  optional push-notification token, and standard timestamps including the
  Foundation's soft-delete marker. Phase 1 *populates* this entity for the
  first time.
- **Invalidated Token**: An auth-internal record that names a specific
  refresh credential as revoked. Holds the credential's identifier, the
  owning customer, and an expiry after which the row may be cleaned up.
  The Foundation phase migrated the table and stood up the daily cleanup
  job; Phase 1 is the first phase that actually writes rows into it (on
  every refresh exchange and on every sign-out).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new customer can complete the full sign-up flow on a real
  device — from the welcome screen through phone-OTP verification to the
  customer home screen — in under 90 seconds under normal network and
  carrier-SMS-delivery conditions. (User Story 1.)
- **SC-002**: A returning customer can complete sign-in on a real device in
  under 15 seconds from welcome screen to customer home screen. (User
  Story 2.)
- **SC-003**: A previously authenticated customer who reopens the app
  within the refresh-credential lifetime reaches the home screen without a
  password prompt in 100% of cases. (User Story 3, FR-007.)
- **SC-004**: A refresh credential, once used or signed-out, is refused on
  any subsequent presentation in 100% of cases. Verified end-to-end with a
  captured-credential replay test. (FR-008, FR-009.)
- **SC-005**: When the access credential expires while N parallel
  authenticated requests are in flight, exactly one refresh exchange is
  issued and all N requests succeed using the new credential. Verified with
  N ≥ 5. (User Story 3, FR-008.)
- **SC-006**: Registration with a phone number that is already attached to
  a verified account is refused in 100% of cases with a clear conflict
  error. (FR-005.)
- **SC-007**: An attempt to request a fourth verification code from the
  same source IP within one minute is refused in 100% of cases with a
  clear retry-after message, and incurs no third-party cost. (FR-016.)
- **SC-008**: An attempt to sign in to a soft-deleted account is refused as
  if the account did not exist in 100% of cases. (User Story 2.)
- **SC-009**: A profile-phone change is not committed to the customer's
  account until a verification code delivered to the *new* phone is
  verified, in 100% of cases. (User Story 4, FR-013.)
- **SC-010**: For each Phase 1 body-accepting endpoint (request code,
  register, sign-in, refresh, profile update, push-token register) a
  request body containing one extra undocumented field is refused with a
  clear validation error in 100% of cases. This completes the Phase 0
  SC-006 deferred acceptance verification. (FR-019.)
- **SC-011**: 100% of strings shown on the welcome, sign-in, register, and
  OTP-entry screens are localised in both English and Arabic, and the
  Arabic version renders with right-to-left layout end-to-end on a real
  device. (User Story 6, FR-018.)
- **SC-012**: A wrong-password sign-in attempt and an unknown-phone sign-in
  attempt return the same externally visible error message in 100% of
  cases (no enumeration possible). (FR-017.)
- **SC-013**: An attempt to access a non-public route without a valid
  access credential is refused with a clear unauthenticated error in 100%
  of cases. (FR-011.)
- **SC-014**: A registration attempt with a password shorter than 8
  characters is refused with a clear minimum-length validation error in
  100% of cases. A registration with an 8-character password is accepted
  in 100% of cases (no rejected-for-composition false positives).
  (FR-006a.)
- **SC-015**: An eleventh request to register, sign-in, or refresh from
  the same source IP within a 15-minute rolling window is refused with a
  clear retry-after message in 100% of cases, and the message names the
  remaining wait duration. Verified per endpoint independently.
  (FR-016a.)
- **SC-016**: For every significant auth event named in FR-020, exactly
  one structured log line is emitted, carrying event type, outcome,
  timestamp, source IP, actor identifier (when known), and a correlation
  identifier — and never carrying the plaintext password or the OTP
  code. Verified by inspecting the log stream during a scripted run that
  exercises each event type at least once. (FR-020.)

## Assumptions

- The Foundation phase (Phase 0) is in place: the User and Invalidated
  Token tables are migrated, the global request-shape validation pipe is
  registered, the soft-delete extension is active, the daily cleanup job
  is scheduled, and per-environment configuration is in place.
- A third-party phone-verification provider is configured by Phase 1's
  end. Per-message cost (recorded as Open Item A2 in the implementation
  plan) is acceptable at v1 volumes; revisit if registration volume scales
  materially.
- The choice of password-hashing function, the choice of access / refresh
  credential mechanism (signing algorithm, signing-key custody, exact
  lifetimes), the choice of phone-verification provider, the choice of
  secure storage on the device for the refresh credential, and the choice
  of rate-limit storage are all planning-level decisions recorded in the
  implementation plan; the spec stays vendor-agnostic on all of them.
  Substituting any one MUST NOT invalidate this specification.
- Concrete credential lifetimes (e.g., minutes for access, days/weeks for
  refresh) are planning-level. The spec only requires "access is
  short-lived, refresh is longer-lived, both finite, refresh rotates on
  use" (FR-007, FR-008).
- Phase 1 covers customer accounts only. Chef accounts are granted in
  Phase 3 by an admin verifying a customer's chef application; no separate
  "chef sign-up" exists. Admin accounts are seeded at deployment time
  (Phase 13). Driver accounts are out of scope for v1.
- Multiple-device sessions: each device holds its own refresh credential
  and is revoked independently on sign-out. Global-sign-out (revoke all
  sessions for a user) is out of scope for Phase 1.
- Real-time revocation when an account is soft-deleted is out of scope for
  Phase 1: the customer's current access credential continues to work
  until it expires, but their next refresh exchange MUST be refused.
- Performance targets in Success Criteria assume a typical mobile network
  connection, typical carrier SMS delivery latency, and a recent mobile
  device, consistent with the project's baseline device/network
  expectations.
