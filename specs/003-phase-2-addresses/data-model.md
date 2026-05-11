# Phase 2 Data Model: Saved Delivery Addresses

Phase 2 introduces **no new entities** — it materialises behaviour
for one entity the constitution already defines and the Foundation
phase already migrated, plus one read against another:

- `UserAddress` — populated for the first time in this phase
  (Phase 0 created the table; Phase 2 creates the rows).
- `Order` — read once (FR-013 in-flight check via
  `OrdersService.hasActiveOrderForAddress`) but never written.
  Phase 6 will own the writes.

This document is the human-readable usage map for those entities in
Phase 2. The canonical schema lives at
`backend/prisma/schema.prisma`; no field definitions in this
document override that schema.

---

## Conventions inherited from Phase 0 / Phase 1

- **ID columns**: `UserAddress.id` is
  `@db.Uuid @default(dbgenerated("gen_random_uuid()"))`. `Order.id`
  is the same shape.
- **Timestamps**: `UserAddress` carries `createdAt`, `updatedAt`,
  and the Foundation soft-delete marker `deletedAt`.
- **Reads on `UserAddress`**: List, single-row fetch (for edit), and
  the FR-013 ownership check use
  `prismaService.extended.userAddress.*` so soft-deleted rows are
  invisible by construction (delivers SC-009 — soft-deleted address
  refused as if it did not exist).
- **Reads on `Order`** (FR-013 only): Use
  `prismaService.extended.order.findFirst({ where: { addressId,
  userId, status: { notIn: ['DELIVERED', 'CANCELLED'] } } })`. The
  extended client transparently filters `deletedAt: null` if Phase 6
  later enables soft-delete on `Order`; today there is no
  `deletedAt` enforcement difference vs the bare client because no
  rows exist yet.
- **Writes on `UserAddress`**:
  - Create: `prismaService.userAddress.create({ data })`. No
    extension call needed — the Phase 0 extension only intercepts
    reads and the `softDelete` model method.
  - Update: `prismaService.userAddress.update({ where: { id }, data })`
    *after* a `findFirst({ where: { id, userId } })` confirms the
    row exists and is owned (R4).
  - Soft-delete: `prismaService.userAddress.softDelete({ where: { id } })`.
    Mandatory route — hard `prisma.userAddress.delete` is blocked
    at CI by `backend/scripts/ci-no-hard-delete.sh`.

---

## UserAddress

### Fields used in Phase 2

| Field | Type | Phase 2 usage |
|---|---|---|
| `id` | UUID | Returned in every response. Used as the path parameter on `PATCH /addresses/:id` and `DELETE /addresses/:id`. |
| `userId` | UUID | Set at create from `req.user.sub` (server-authoritative; the create DTO does **not** accept this field — see DTO rules below). Used in the ownership filter on every read/update/delete (FR-015 / R4). |
| `label` | String, required | Customer-chosen label (FR-001, FR-003). Validated as 1–80 chars after trim. |
| `streetName` | String, required at the schema level | Customer-readable street text (FR-001). Validated as 0–200 chars (the spec permits empty per FR-003 — the schema requires a non-null string, so an empty string is acceptable; the service stores empty exactly as provided, never coercing to null). |
| `building` | String? | Optional Egyptian-apartment-detail field (R7). Validated as 0–80 chars. |
| `floor` | String? | Optional. 0–20 chars. |
| `apartment` | String? | Optional. 0–20 chars. |
| `latitude` | Decimal(10, 7) | Coordinate (FR-001, FR-002). Validated as a number in `[-90, 90]`. The `Decimal` type is delivered to the client as a JS string; the mobile parses to a number for the map view. |
| `longitude` | Decimal(10, 7) | Coordinate (FR-001, FR-002). Validated as a number in `[-180, 180]`. Delivered as a string. |
| `notes` | String? | Optional free-text (R7). 0–500 chars. |
| `createdAt` | DateTime | Auto. |
| `updatedAt` | DateTime | Auto-updated by Prisma `@updatedAt`. |
| `deletedAt` | DateTime? | Soft-delete marker. Set by `softDelete` only (R5). Phase 2 never reads it directly; the extension filters it. |

### Relations exercised in Phase 2

| Relation | Direction | Phase 2 usage |
|---|---|---|
| `User` | `userId → users.id` | Filter target on every read. The relation is *not* eagerly loaded on the list/get response — only the address shape is returned. |
| `Order[]` | `orders.addressId → user_addresses.id` | Read **only** by `OrdersService.hasActiveOrderForAddress` (FR-013). `AddressesService` never traverses this relation directly per Constitution Principle III. |

### Validation rules (DTO-level)

| Rule | Source | Where validated |
|---|---|---|
| `label` 1–80 chars, trimmed, non-empty | FR-003 | `@IsString()` + `@Length(1, 80)` + `@Transform(trim)` on `CreateAddressDto.label` and `UpdateAddressDto.label`. |
| `streetName` 0–200 chars | FR-003 + R7 | `@IsString()` + `@Length(0, 200)` on `CreateAddressDto.streetName` (allow empty). |
| `building` / `floor` / `apartment` / `notes` length-bounded, optional | R7 | `@IsOptional()` + `@IsString()` + `@Length(...)` per the column's max in the table above. |
| `latitude` ∈ [-90, 90] | FR-001 / standard geographic range | `@IsLatitude()` from `class-validator`. |
| `longitude` ∈ [-180, 180] | FR-001 / standard geographic range | `@IsLongitude()` from `class-validator`. |
| Body MUST NOT contain `userId`, `id`, `createdAt`, `updatedAt`, `deletedAt`, or any other field | FR-018 + Phase 0 global pipe | `whitelist: true, forbidNonWhitelisted: true` is already configured globally in `app.module.ts` (Phase 0); the DTOs simply do not declare those fields. A request that sends `userId` is refused with `400 VALIDATION_ERROR` — verifies SC-008. |

### Lifecycle in Phase 2

```text
[no row] --POST /addresses (FR-001..006)--> UserAddress { userId=req.user.sub, deletedAt=null }
       --PATCH /addresses/:id (FR-010)----> UserAddress (label/streetName/coords/optional fields updated)
       --DELETE /addresses/:id (FR-012)---> [FR-013 check]
                                              ├─ if hasActiveOrderForAddress(id, userId) → 409 ADDRESS_IN_USE (no DB write)
                                              └─ else --softDelete--> UserAddress { deletedAt=now() }
```

### Indexes consumed

| Index | Source | Phase 2 query that uses it |
|---|---|---|
| `(userId)` | `@@index([userId])` declared in schema | List query: `findMany({ where: { userId } })`. |
| Primary key on `id` | implicit | Single-row fetch / update / soft-delete: `findFirst({ where: { id, userId } })`. |

No new indexes are introduced. The `(userId)` index covers the only
multi-row query Phase 2 emits against `UserAddress`.

---

## Order (read only)

`OrdersService.hasActiveOrderForAddress(addressId, userId)` is the
single Phase 2 read against `Order`.

### Fields used in Phase 2

| Field | Type | Phase 2 usage |
|---|---|---|
| `id` | UUID | Selected for the boolean check (`select: { id: true }`); never returned to the client by Phase 2 — the FR-013 refusal payload mentions only the address ID and the active-order count. |
| `userId` | UUID | Filter — narrows the check to the customer's own orders (defence in depth on top of the `addressId` filter). |
| `addressId` | UUID | Filter target (FR-013). |
| `status` | enum `OrderStatus` | Filter — `notIn: ['DELIVERED', 'CANCELLED']`. The active set is `PENDING / CONFIRMED / PREPARING / READY / ON_THE_WAY` per Constitution Principle VI. |

### Validation rules

None at the DTO layer — `OrdersService.hasActiveOrderForAddress` is
called with values already validated by `AddressesController` (the
addressId is a UUID that round-tripped through the path param;
`userId` comes from the verified JWT subject).

### Indexes consumed

| Index | Source | Phase 2 query that uses it |
|---|---|---|
| `(status)` | `@@index([status])` declared in schema | Status filter on the `findFirst`. |
| (no dedicated `(addressId)` index) | — | Phase 6 may add one when order placement gets hot; in v1 the address-by-FK lookup is rare enough that the existing indexes suffice. **Not** added here to keep the schema unchanged. |

### Lifecycle in Phase 2

Phase 2 makes no writes to `Order`. No row transitions, no state
changes. The single read is informational and idempotent.

---

## Ownership and isolation matrix

| Verb | Path | Owner check | Soft-delete read filter |
|---|---|---|---|
| `GET /addresses` | list-of-many | `where: { userId: sub }` | `prismaService.extended` (auto) |
| `POST /addresses` | create | `data.userId = sub` (server-set) | n/a (write) |
| `PATCH /addresses/:id` | update-one | `findFirst({ where: { id, userId: sub } })` precondition; 404 if empty | `prismaService.extended` (auto) |
| `DELETE /addresses/:id` | soft-delete-one | same `findFirst` precondition + `OrdersService.hasActiveOrderForAddress(id, sub)` | `prismaService.extended` (auto on the precondition); `softDelete` for the write |

No path returns or refuses based on ownership without going through
the `findFirst` shape above (R4). No path accepts `userId` from the
client (FR-018 + Phase 0 global pipe rejects the field).

---

## Observability shape

The FR-019 structured log line format is published in
`event.logger.ts`. Phase 2's `address` namespace emits:

| Event | Outcome | Trigger |
|---|---|---|
| `address.create` | `success` | `POST /addresses` 201. |
| `address.create` | `validation_rejected` | `POST /addresses` 400 from the global pipe. |
| `address.update` | `success` | `PATCH /addresses/:id` 200. |
| `address.update` | `validation_rejected` | `PATCH /addresses/:id` 400 from the global pipe. |
| `address.update` | `not_found` | `PATCH /addresses/:id` 404 (covers both genuine not-found and ownership-refusal per R4 — the log line carries the same `not_found` outcome for both, mirroring the externally visible response). |
| `address.delete` | `success` | `DELETE /addresses/:id` 204. |
| `address.delete` | `in_use` | `DELETE /addresses/:id` 409 from the FR-013 check. |
| `address.delete` | `not_found` | `DELETE /addresses/:id` 404 (same dual-meaning as `update.not_found`). |

Each line carries: `event` (from the table), `outcome` (from the
table), `timestamp` (ISO 8601), `sourceIp` (from
`X-Forwarded-For` / connection address), `actor.userId` (from JWT
`sub`), `correlationId` (from `correlation-id.middleware.ts`), and
`addressId` when an address ID is in scope. Per FR-021, **no
`latitude`, `longitude`, `coordinates`, or any coordinate-derived
value** ever appears in the line.

---

## Test fixtures

Phase 2 integration tests reuse Phase 1's signed-in-customer
fixture and add:

- `ownedAddress(user, overrides?)` — calls the real `POST /addresses`
  flow to seed an address whose `userId` is the customer's. Used by
  every test that needs a starting saved address.
- `seedChef(prisma)` — seeds a verified Chef row (and its owning
  User row, since Chef has a 1:1 to User). Required because
  `Order.chefId` is a non-null FK; the in-flight-order fixtures
  below need a real Chef to point at. Returns the seeded Chef.
- `seedActiveOrder(user, address, chef)` — bypasses the
  (yet-unbuilt) Phase 6 placement flow by inserting an `Order` row
  directly via the test Prisma client with `status: 'PENDING'`,
  `addressId: address.id`, `userId: user.id`, `chefId: chef.id`.
  Used solely by the FR-013 in-use-by-order test.
- `seedTerminalOrder(user, address, chef)` — same as above but
  `status: 'DELIVERED'`. Used to verify that delete is allowed once
  the order is terminal.

All fixtures are local to `test/`; no production code paths exist
for inserting an Order without going through Phase 6's placement
flow.
