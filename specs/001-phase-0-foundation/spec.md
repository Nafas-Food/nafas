# Feature Specification: Foundation

**Feature Branch**: `001-phase-0-foundation`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Read Phase 0 Foundation from docs/IMPLEMENTATION_PLAN.md and create the first spec."

## Overview *(non-mandatory context)*

Phase 0 establishes the foundation that every subsequent phase will build on. It
is the only phase whose primary "user" is not a customer or chef but the people
(and AI agents) who will assemble the rest of the platform: a developer joining
the project, an automated agent picking up the next phase, a code reviewer
checking that constitutional guarantees hold, and the future operations team
that will deploy what gets built.

The Foundation must deliver four things to those people:

1. A **runnable environment** they can stand up locally without tribal knowledge.
2. A **canonical data model** that exactly matches the constitution and is
   already migrated into the live database.
3. **Built-in guardrails** (soft-delete enforcement, validation, secret hygiene,
   CI gates) that downstream phases inherit instead of reinventing.
4. A **health signal** that proves the foundation itself is alive and the
   database is reachable.

If any of these is missing or unreliable, every later phase pays the cost
multiple times. So Phase 0 is "done" only when each of them is verifiable.

## Clarifications

### Session 2026-05-03

- Q: How should the default chef logo/banner placeholder assets (FR-011) be sourced for Phase 0 readiness? → A: Ship a brand-aligned generated placeholder (gradient + Nafas wordmark from the design system) at the canonical storage URLs; the designer can later swap the files in-place without code or schema changes.
- Q: At which layer should the "no hard deletes on soft-delete entities" rule (FR-005) be enforced? → A: A continuous-integration gate that scans the backend source tree for forbidden delete calls on soft-delete entities and fails the pull request before merge.
- Q: Who may use the soft-delete escape hatch (FR-004) that includes deleted rows in reads? → A: Admin-context handlers only — the opt-in is enforced by the admin role guard so customer- and chef-facing handlers cannot bypass soft-delete even by accident.
- Q: How does a fresh contributor obtain dev database credentials within the SC-001 five-minute boot budget? → A: Each contributor creates their own free Supabase project and copies its keys into a local `.env`; the README walks them through it. No shared secrets, isolated data per contributor.
- Q: How is the daily cleanup of the invalidated-token table (FR-017) scheduled? → A: An in-process scheduler running inside the backend service. No extra container, no extra credentials; a log line confirms each daily run. Runs from Phase 0 onward (cleanup is a no-op until Phase 1 starts populating the table).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new contributor can run the project end-to-end on their own machine (Priority: P1)

A developer (human or agent) joining the project should be able to clone the
repository, follow the README, and reach a working backend with a connected
database in a small number of steps — without DM'ing anyone for missing
configuration. This is the entry point to every other phase. If it doesn't
work, no other work can begin.

**Why this priority**: Foundation has zero user-facing value on its own; its
value is *unblocking* everything else. The smallest possible MVP of the
Foundation is "I can boot the system and see it report healthy". Without that,
no further phase can be specced, planned, or implemented.

**Independent Test**: A teammate who has never seen the repo before clones it,
provisions only the secrets the README documents, runs the documented startup
command, and observes a healthy response from the health endpoint within five
minutes — without consulting anyone.

**Acceptance Scenarios**:

1. **Given** the repository is cloned to a fresh machine and required secrets
   are set per the README, **When** the contributor runs the documented dev
   start-up command, **Then** the backend service starts, connects to the
   database, and the health endpoint reports a healthy status.
2. **Given** the database is unreachable (e.g., the contributor mistypes the
   connection string), **When** the contributor calls the health endpoint,
   **Then** the endpoint responds with a clear "database down" status rather
   than hanging or crashing the service.
3. **Given** the contributor opens a pull request that touches one of the
   workspaces (backend, mobile, or admin), **When** continuous integration
   runs, **Then** automated quality checks for that workspace report a clear
   pass/fail outcome within a few minutes.

---

### User Story 2 - The canonical data model exists in the live database before any feature work begins (Priority: P1)

Every later phase reads or writes one or more of the entities defined in the
constitution (Users, Chefs, Menus, Items, Cart, Orders, Transactions,
Reviews, Notifications, Favorites, Categories, plus the auth-internal token
blacklist). If the schema isn't in place — or differs from the constitution —
each later phase will either invent its own version or hit migration churn.

**Why this priority**: Schema-first is one of the seven non-negotiable
principles of the constitution. The schema must be migrated and verifiable in
the database before Phase 1 can touch authentication, because authentication
depends on Users + the token-blacklist table existing.

**Independent Test**: A reviewer connects to the development database (read-only
credentials) and confirms every entity named in the constitution — and the
auth-internal token blacklist — exists, with the right uniqueness, ownership,
and soft-delete columns where applicable.

**Acceptance Scenarios**:

1. **Given** the foundation has been set up, **When** a reviewer lists the
   tables in the development database, **Then** every entity defined in the
   constitution data model is present, plus the auth-internal token blacklist.
2. **Given** the schema is in place, **When** a reviewer compares the live
   schema against the canonical schema definition file in the repository,
   **Then** there is no drift (no extra tables, no missing columns).
3. **Given** the schema has been migrated once, **When** a contributor pulls
   the latest schema definition and re-runs the migration command, **Then**
   the system reports "no pending migrations" rather than re-applying or
   conflicting.

---

### User Story 3 - The platform's guardrails are enforced from day one (Priority: P2)

The constitution mandates: soft-delete on every major entity, no client-trusted
secrets, secrets never committed, validation on every request, and centralized
file storage. These guardrails must be in place before any feature code is
written, so that no feature is born violating them and no reviewer has to
re-litigate them on every PR.

**Why this priority**: Guardrails added retroactively rarely catch up to all
the code that already bypassed them. Adding them in Phase 0 is the only way to
make subsequent phases inherit them by default.

**Independent Test**: A reviewer attempts each of the following and observes
the platform refuse: (a) hard-deleting a row from a soft-delete table through
application code, (b) sending a request with extra fields beyond the documented
shape, (c) finding any secret value committed to the repository, (d) uploading
a file directly to storage from the client.

**Acceptance Scenarios**:

1. **Given** application code attempts to permanently remove a row from any
   entity that the constitution marks as soft-delete-only, **When** the
   pull request is opened, **Then** the continuous-integration gate detects
   the forbidden call and fails the pull request before it can be merged.
2. **Given** a request body includes fields not declared in the request shape,
   **When** the request reaches the platform, **Then** the request is rejected
   with a clear validation error rather than silently accepted. **Phase 0
   verification**: confirms the global `ValidationPipe` is registered with
   `forbidNonWhitelisted: true` (verifiable by code inspection of
   `backend/src/main.ts`); behavioral verification across body-accepting
   endpoints is deferred to Phase 1 per SC-006.
3. **Given** a contributor opens a pull request, **When** continuous
   integration scans the changes, **Then** any committed secret-shaped value
   (private keys, API tokens) blocks the merge.
4. **Given** a query against a soft-delete table is issued without explicit
   instruction to include deleted rows, **When** the query runs, **Then** the
   result excludes soft-deleted rows by default. A documented opt-in to
   include deleted rows MUST exist, but it MUST be usable only inside
   admin-context handlers — calling it from a customer- or chef-facing
   handler MUST fail.

---

### User Story 4 - The foundation is observable enough to monitor (Priority: P3)

The deployment phase will need an external uptime monitor. To set one up, the
platform must expose a stable, low-cost endpoint that reports both "service is
up" and "database is reachable" — and that an operator can query without
authentication.

**Why this priority**: It is not strictly blocking for Phase 1 development, but
without it, Phase 13's deployment readiness has no acceptance criterion. Adding
it now (rather than at deployment time) avoids re-opening the foundation
phase later.

**Independent Test**: An operator can call the health endpoint anonymously, get
a sub-second response that names the platform version and database state, and
configure an external monitor against it without further changes.

**Acceptance Scenarios**:

1. **Given** the platform is running normally, **When** an unauthenticated
   caller queries the health endpoint, **Then** the response indicates the
   service is up and the database is reachable, and includes the platform
   version.
2. **Given** the database becomes unreachable, **When** an unauthenticated
   caller queries the health endpoint, **Then** the response still arrives and
   indicates the database is down (so external monitors can distinguish
   "service crashed" from "database problem").

---

### Edge Cases

- **Empty database, no seed data**: A reviewer exploring the running system
  finds the schema present but no rows. This is expected for Phase 0 — feature
  data is seeded by later phases (categories in Phase 3, the admin user in
  Phase 13).
- **Soft-delete escape hatch misuse**: A contributor invokes the "include
  deleted rows" opt-in in a customer- or chef-facing read path. The platform
  MUST refuse the call at runtime (because the opt-in is gated by the admin
  role guard) so the misuse cannot reach production even if it slips
  through review.
- **Schema drift at runtime**: The schema definition file in the repository
  is ahead of the live database. Migration must be the only path to closing
  the gap; the platform must surface the drift rather than silently working
  against an outdated schema.
- **Health endpoint under partial degradation**: The service is up but the
  database is unreachable. The endpoint must remain responsive (so monitors
  can read it) and must report the degraded state — not crash, not time out.
- **Continuous integration on a no-op pull request**: Every workspace's
  quality gate must run successfully even if the PR makes no changes to that
  workspace's source — i.e., quality gates must not bit-rot when a workspace
  goes untouched for weeks.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST be a single monorepo containing three
  workspaces — backend, mobile client, admin web — at known top-level paths,
  with shared infrastructure files (development orchestration, reverse-proxy
  configuration template, continuous-integration workflows) at the repository
  root.
- **FR-002**: The system MUST provide a documented, single-command way to
  start a working development environment locally without requiring access to
  any production infrastructure.
- **FR-003**: The system MUST persist a canonical data model that exactly
  matches the entities, fields, enums, and relationships defined in the
  constitution data-model section, plus one additional entity that records
  invalidated authentication tokens.
- **FR-004**: Every entity that the constitution lists as soft-delete-protected
  MUST have a soft-delete column, and the platform MUST default to excluding
  soft-deleted rows from reads. A documented opt-in MUST exist for callers
  that legitimately need to include deleted rows; that opt-in MUST be
  authorized only inside admin-context handlers (those guarded by the admin
  role guard) so that customer- and chef-facing handlers cannot bypass
  soft-delete even by accident.
- **FR-005**: The platform MUST forbid permanently deleting rows from
  soft-delete-protected entities through application code. Enforcement MUST
  be a continuous-integration gate that scans the backend source tree for
  forbidden delete calls on those entities and fails the pull request before
  merge.
- **FR-006**: The platform MUST expose an unauthenticated health endpoint that
  reports (a) whether the service is up, (b) whether the database is
  reachable, and (c) the running platform version, and that responds in
  sub-second time under normal conditions.
- **FR-007**: The health endpoint MUST remain responsive when the database is
  unreachable, returning a clear "database down" indication rather than
  hanging, crashing, or timing out.
- **FR-008**: The platform MUST reject any request whose body contains fields
  beyond the documented request shape, with a clear validation error.
- **FR-009**: Application secrets (database connection strings, signing keys,
  third-party API keys) MUST NOT be committed to the repository in any form;
  every workspace MUST instead read its secrets from per-environment
  configuration that is documented in the README and excluded from version
  control.
- **FR-010**: File storage MUST be intermediated by the platform — clients
  MUST NOT receive direct write credentials to the storage backend. The
  storage system MUST be reachable from the foundation, with the buckets that
  later phases will use already provisioned and accessible.
- **FR-011**: Default placeholder assets for chef profile imagery (logo and
  banner) MUST exist in the storage backend at known, public-readable
  locations so that the chef-application phase can reference them as defaults
  for newly applied chefs whose images are not yet uploaded. For Phase 0
  acceptance, brand-aligned generated placeholders (a gradient plus the
  Nafas wordmark drawn from the design system) suffice; the files at those
  canonical URLs MAY be replaced in-place later by designer-approved art
  without any code or schema change.
- **FR-012**: For each workspace, every pull request that modifies that
  workspace's source MUST automatically trigger quality gates (static analysis
  + build) and report a clear pass/fail outcome within a small number of
  minutes.
- **FR-013**: Schema changes MUST be applied exclusively through
  forward-versioned migrations stored in the repository; the platform MUST
  detect (and surface) any drift between the canonical schema definition and
  the live database state.
- **FR-014**: Monetary fields in the data model MUST use a decimal-precision
  type (not a binary floating-point type) to preserve cent-level accuracy for
  later financial calculations.
- **FR-015**: Identifier fields for primary entities MUST use opaque,
  non-sequential values (not auto-increment integers) so that knowing one
  entity's identifier does not let a caller enumerate others.
- **FR-016**: The data store's row-level access control MUST be disabled at
  the database layer; access control is enforced exclusively at the
  application layer.
- **FR-017**: A daily cleanup process MUST exist for the invalidated-token
  table so that it does not grow unboundedly over time. The cleanup MUST run
  as an in-process scheduled job inside the backend service (no external
  cron, no database-side scheduler) and MUST emit a log line on each run so
  its execution is verifiable. The job runs from Phase 0 onward; cleanup
  passes are no-ops until Phase 1 begins populating the table.

### Key Entities *(include if feature involves data)*

The Foundation does not introduce new business entities — it materializes the
ones the constitution already defines. The complete list (with descriptions
preserved from the constitution) is:

- **User**: A person with an account on the platform, identified by phone
  number, with one of four roles (admin, customer, chef, driver). Carries
  optional profile fields, a phone-verification flag, an optional push-token,
  and standard timestamps including a soft-delete marker.
- **Chef**: A homemaker selling food. One-to-one with a user. Carries
  display name, biography, location coordinates, kitchen-open flag, rolling
  rating + review count, minimum order price, and references to logo and
  banner imagery in storage.
- **User Address**: A saved delivery address belonging to a user. Carries
  coordinates and human-readable address fields.
- **Category**: A food-type label (Koshary, Mahshi, etc.). Bilingual name,
  optional icon, display order, active/inactive flag.
- **Menu**: A grouping of items belonging to a chef and a category, with a
  bilingual name, display order, "available all days" flag, and a join table
  for per-day availability.
- **Menu Availability**: The day-of-week mapping for menus that are not
  available every day.
- **Item**: A specific dish on a menu. Bilingual name and description, base
  price, discount value + unit (fixed or percentage), stock quantity (with -1
  meaning unlimited), gallery of images, display order, active flag.
- **Cart** & **Cart Item**: The customer's in-progress order. One cart per
  user; items reference dishes by id and quantity. Constraint: all items must
  belong to the same chef.
- **Order**: A placed order. References user, chef, address, optional
  scheduled date, computed totals (subtotal, post-discount subtotal, delivery
  fee, service fee, grand total), customer notes, optional cancellation
  reason, and a status drawn from the documented state machine.
- **Order Item**: Snapshots of items at order time. Records both the
  effective price and the original-before-discount price so historical orders
  survive item edits.
- **Transaction**: The payment record for an order. References the order,
  payment method (cash now; visa/instapay reserved), amount, status, and
  optional gateway-side reference + paid-at timestamp + failure reason.
- **User Review**: A rating + optional notes + optional images, attached to a
  delivered order, contributing to the chef's rolling rating.
- **Favorite**: A many-to-many record linking a user to a saved chef.
- **Notification**: A message sent to a user, with a type, bilingual title +
  body, read flag, and read-at timestamp.
- **Invalidated Token**: An auth-internal record of refresh tokens that have
  been used or revoked. Carries the token identifier, the owning user, and an
  expiry after which the row may be cleaned up.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor following the README from a freshly cloned
  repository — including the documented step of creating their own free
  Supabase project and copying its keys into a local `.env` — can reach a
  healthy response from the platform's health endpoint in under five
  minutes of work, without consulting a teammate or accessing any shared
  secret store.
- **SC-002**: 100% of the entities defined in the constitution's data-model
  section exist in the development database with the documented columns, plus
  the invalidated-token table.
- **SC-003**: A reviewer querying the schema-drift check observes zero drift
  between the canonical schema definition file and the live development
  database.
- **SC-004**: For each of the three workspaces, a no-op pull request triggers
  the workspace's quality gate and the gate reports a pass within five
  minutes.
- **SC-005**: An attempt by application code to permanently delete a row from
  any soft-delete-protected entity is caught by the continuous-integration
  gate and blocks the pull request in 100% of cases.
- **SC-006**: A request body containing one extra undocumented field is
  rejected with a clear error in 100% of cases (sampled across at least three
  endpoints). **Phase scope**: the rejecting validator is wired in Phase 0
  (global ValidationPipe with `forbidNonWhitelisted: true`); the
  three-endpoint sampling is verified in Phase 1 once body-accepting
  endpoints (`/auth/register`, `/auth/sign-in`, `/auth/send-otp`) are
  implemented. Phase 0 acceptance verifies the pipe is configured, not the
  runtime sample.
- **SC-007**: The health endpoint returns within one second under normal
  conditions, and within five seconds when the database is unreachable
  (instead of hanging).
- **SC-008**: A repository scan finds zero committed secret-shaped values
  (private keys, API tokens, database connection strings) in tracked files.
- **SC-009**: An operator can configure an external uptime monitor against
  the health endpoint without any code or configuration changes to the
  platform.

## Assumptions

- The development database is a Supabase-hosted Postgres instance, per the
  constitution's technology-stack section. Each contributor creates their
  own free-tier Supabase project for development; data is not shared across
  contributors. The README documents the project-creation steps and how to
  copy the resulting keys into a local `.env` file.
- The local development environment runs in containers, allowing a
  one-command bring-up; the contributor has a working container runtime
  installed.
- Production deployment, including provisioning a virtual private server,
  purchasing a domain, and obtaining TLS certificates, is explicitly out of
  scope for Phase 0 and deferred to Phase 13.
- Third-party integrations referenced by later phases (SMS verification, push
  notifications, mapping, error tracking) are not configured in Phase 0; the
  Foundation only ensures their later configuration is not blocked by
  schema, environment, or process gaps.
- Default placeholder chef-imagery assets (logo and banner) ship as
  brand-aligned generated artwork (gradient + Nafas wordmark from the design
  system) for Phase 0 acceptance. The exact pixel content is a design-team
  deliverable tracked separately as Open Item A5 in the project
  implementation plan; designer-approved art will replace the placeholder
  files in-place later, without any code or schema change required.
- The workspace tooling decision (independent installs per workspace versus a
  shared workspace tool) defaults to independent installs per the
  implementation plan's Open Item A1, and may be revisited later without
  invalidating this specification.
- The repository is greenfield with no existing scaffolded code in any of the
  three workspaces; this specification covers initial scaffolding rather than
  migration of existing code.
