# Phase 0 Data Model: Foundation

This document catalogs every entity that ships in the Phase 0 schema. The
schema is the canonical Prisma definition stored at
`backend/prisma/schema.prisma`; this file is the human-readable map of
that schema. The full schema source is also captured at
`contracts/schema.prisma` for review without leaving the spec folder.

The Foundation does **not** introduce business entities of its own —
every business entity comes from the constitution. The single exception
is `InvalidatedToken`, an auth-internal table that the spec adds in
support of FR-017.

---

## Conventions

- **ID columns**: All primary entity IDs are UUID (`@db.Uuid`,
  `@default(dbgenerated("gen_random_uuid()"))`). FR-015 forbids
  auto-increment IDs. `InvalidatedToken` is keyed by `jti` (the refresh
  token's JWT ID), which is opaque by design.
- **Timestamps**: By default, entities carry `createdAt` (`@default(now())`);
  many also carry `updatedAt` (`@updatedAt`). Some Phase 0 models
  (`MenuAvailability`, `OrderItem`, `Favorite`, `Notification`,
  `InvalidatedToken`) include only `createdAt`. Soft-delete entities
  additionally carry `deletedAt DateTime?`.
- **Soft-delete entities**: `User`, `UserAddress`, `Chef`, `Category`,
  `Menu`, `Item`, `Order`, `UserReview`, `Transaction`. The Prisma Client
  Extension default-filters `deletedAt: null` for these on read; the
  `prisma.<model>.softDelete()` helper is the only sanctioned write path
  for deletion. CI grep gate blocks `prisma.<model>.delete(`.
- **Hard-delete entities** (no `deletedAt`): `MenuAvailability`, `Cart`,
  `CartItem`, `OrderItem`, `Favorite`, `Notification`, `InvalidatedToken`.
  These are either join tables, request-scoped (cart), order snapshots
  (`OrderItem`), or operational records (`Notification`,
  `InvalidatedToken`) where audit value of the row past its useful life
  is zero.
- **Decimal columns**: All money fields use `Decimal @db.Decimal(10, 2)`.
  Prisma is configured to emit Decimal as JS `string`; services use
  `decimal.js` for arithmetic (see research R6).
- **Bilingual columns**: Bilingual `name`, `title`, `body` fields are
  stored as `Json` with shape `{ ar: string, en: string }`. The
  application enforces both keys at DTO validation time.
- **JSON arrays**: Image gallery columns (`Item.images`,
  `UserReview.images`) are `String[]` of public URLs.
- **Row-level security**: RLS is disabled at the database layer per
  Constitution / FR-016. Application-layer guards are the only access
  control.

---

## Entities

### 1. User
- **Fields**: `id`, `phone` (unique), `email?` (unique), `fullName`,
  `birthdate?`, `passwordHash`, `role` (enum: `ADMIN | CUSTOMER | CHEF |
  DRIVER`), `phoneVerified` (default `false`), `fcmToken?`, `isTest`
  (default `false`), `createdAt`, `updatedAt`, `deletedAt?`.
- **Relations**: `addresses[]` (UserAddress), `chef?` (Chef), `cart?`
  (Cart), `orders[]` (Order), `reviews[]` (UserReview), `favorites[]`
  (Favorite), `notifications[]` (Notification),
  `invalidatedTokens[]` (InvalidatedToken).
- **Notes**: Phone is the unique identifier (Egyptian-market design).
  `DRIVER` role is reserved per Constitution Principle VII; no logic
  ships in v1. `isTest` flag excludes the row from analytics
  aggregations starting in Phase 9.

### 2. UserAddress
- **Fields**: `id`, `userId`, `label` (e.g., "Home"), `streetName`,
  `building?`, `floor?`, `apartment?`, `latitude` (Decimal 10,7),
  `longitude` (Decimal 10,7), `notes?`, `createdAt`, `updatedAt`,
  `deletedAt?`.
- **Relations**: `user` (User), `orders[]` (Order).

### 3. Chef
- **Fields**: `id`, `userId` (unique — one-to-one with User), `chefName`,
  `bio?`, `latitude` (Decimal 10,7), `longitude` (Decimal 10,7),
  `isVerified` (default `false`), `isOpen` (default `false`), `ratings`
  (Decimal 3,2 default 0), `totalReviews` (Int default 0),
  `minOrderPrice` (Decimal 10,2), `logo` (URL, defaulted to placeholder
  per R9), `banner` (URL, defaulted to placeholder per R9), `createdAt`,
  `updatedAt`, `deletedAt?`.
- **Relations**: `user` (User), `menus[]` (Menu), `orders[]` (Order),
  `reviews[]` (UserReview), `favorites[]` (Favorite).

### 4. Category
- **Fields**: `id`, `name` (Json: `{ ar, en }`), `icon?` (Feather icon
  name), `displayOrder`, `isActive` (default `true`), `createdAt`,
  `updatedAt`, `deletedAt?`.
- **Relations**: `menus[]` (Menu).

### 5. Menu
- **Fields**: `id`, `chefId`, `categoryId`, `name` (Json: `{ ar, en }`),
  `displayOrder`, `availableAllDays` (default `false`), `createdAt`,
  `updatedAt`, `deletedAt?`.
- **Relations**: `chef` (Chef), `category` (Category), `items[]` (Item),
  `availability[]` (MenuAvailability).
- **Indexes**: `@@index([chefId])`.

### 6. MenuAvailability
- **Fields**: `id`, `menuId`, `dayOfWeek` (Int 0-6), `createdAt`.
- **Relations**: `menu` (Menu).
- **Notes**: Hard-delete; pure join table.
- **Indexes**: `@@unique([menuId, dayOfWeek])`.

### 7. Item
- **Fields**: `id`, `menuId`, `name` (Json: `{ ar, en }`), `description`
  (Json: `{ ar, en }`), `price` (Decimal 10,2), `discountValue` (Decimal
  10,2 default 0), `discountUnit` (enum: `FIXED | PERCENT`, default
  `FIXED`), `quantity` (Int — `-1` means unlimited stock), `images`
  (String[]), `displayOrder`, `isActive` (default `true`), `createdAt`,
  `updatedAt`, `deletedAt?`.
- **Relations**: `menu` (Menu), `cartItems[]` (CartItem), `orderItems[]`
  (OrderItem).
- **Indexes**: `@@index([menuId])`.

### 8. Cart
- **Fields**: `id`, `userId` (unique — one cart per user), `createdAt`,
  `updatedAt`.
- **Relations**: `user` (User), `items[]` (CartItem).
- **Notes**: Hard-delete; cart is request-scoped state.

### 9. CartItem
- **Fields**: `id`, `cartId`, `itemId`, `quantity` (Int), `createdAt`,
  `updatedAt`.
- **Relations**: `cart` (Cart), `item` (Item).
- **Notes**: Hard-delete. Application-layer constraint ensures all
  CartItems in one Cart reference Items belonging to a single Chef.

### 10. Order
- **Fields**: `id`, `userId`, `chefId`, `addressId`, `scheduledDate?`
  (Date), `subtotal` (Decimal 10,2), `subtotalAfterDiscount` (Decimal
  10,2), `deliveryFee` (Decimal 10,2), `serviceFee` (Decimal 10,2),
  `total` (Decimal 10,2), `notes?`, `cancelledReason?`, `status` (enum:
  `PENDING | CONFIRMED | PREPARING | READY | ON_THE_WAY | DELIVERED |
  CANCELLED`, default `PENDING`), `createdAt`, `updatedAt`, `deletedAt?`.
- **Relations**: `user` (User), `chef` (Chef), `address` (UserAddress),
  `items[]` (OrderItem), `transaction?` (Transaction), `review?`
  (UserReview).
- **Indexes**: `@@index([userId])`, `@@index([chefId])`,
  `@@index([status])`.

### 11. OrderItem
- **Fields**: `id`, `orderId`, `itemId`, `quantity` (Int), `price`
  (Decimal 10,2 — effective at order time), `priceBeforeDiscount`
  (Decimal 10,2 — original at order time), `nameSnapshot` (Json:
  `{ ar, en }`), `createdAt`.
- **Relations**: `order` (Order), `item` (Item).
- **Notes**: Hard-delete. Snapshots are intentional per Constitution
  Principle VI (audit trail survives item edits).

### 12. Transaction
- **Fields**: `id`, `orderId` (unique), `paymentMethod` (enum: `CASH |
  VISA | INSTAPAY` — VISA + INSTAPAY reserved per Principle VII),
  `amount` (Decimal 10,2), `cardAmount?` (Decimal 10,2 — reserved for
  future split-payment), `status` (enum: `PENDING | COMPLETED | FAILED |
  REFUNDED`, default `PENDING`), `gatewayReference?`, `paidAt?`,
  `failureReason?`, `createdAt`, `updatedAt`, `deletedAt?`.
- **Relations**: `order` (Order).

### 13. UserReview
- **Fields**: `id`, `userId`, `chefId`, `orderId` (unique — one review
  per order), `rating` (Int 1-5), `notes?`, `images` (String[]),
  `createdAt`, `updatedAt`, `deletedAt?`.
- **Relations**: `user` (User), `chef` (Chef), `order` (Order).
- **Indexes**: `@@index([userId])`, `@@index([chefId])`.

### 14. Favorite
- **Fields**: `id`, `userId`, `chefId`, `createdAt`.
- **Relations**: `user` (User), `chef` (Chef).
- **Notes**: Hard-delete; pure many-to-many record.
- **Indexes**: `@@unique([userId, chefId])`.

### 15. Notification
- **Fields**: `id`, `userId`, `type` (enum: `ORDER_PLACED |
  ORDER_CONFIRMED | ORDER_PREPARING | ORDER_READY | ORDER_ON_THE_WAY |
  ORDER_DELIVERED | ORDER_CANCELLED | ORDER_REVIEW | CHEF_VERIFIED |
  CHEF_REJECTED | SYSTEM`), `title` (Json: `{ ar, en }`), `body` (Json:
  `{ ar, en }`), `data?` (Json — deep-link payload), `readAt?`,
  `createdAt`.
- **Relations**: `user` (User).
- **Notes**: Hard-delete. Bilingual payload satisfies Constitution
  Principle I.
- **Indexes**: `@@index([userId, readAt])`.

### 16. InvalidatedToken (Phase 0 addition — auth-internal)
- **Fields**: `jti` (String, primary key — the refresh token's JWT ID),
  `userId`, `expiresAt`, `createdAt` (default `now()`).
- **Relations**: `user` (User).
- **Notes**: Hard-delete is intentional — see research R5. Cleanup runs
  daily at 03:00 UTC via in-process scheduler. CI grep gate's allowlist
  permits `prisma.invalidatedToken.deleteMany` because this entity is
  not in the constitution's soft-delete list.
- **Indexes**: `@@index([expiresAt])`.

---

## Enums

| Enum | Values | Notes |
|---|---|---|
| `Role` | `ADMIN`, `CUSTOMER`, `CHEF`, `DRIVER` | DRIVER reserved per Principle VII. |
| `OrderStatus` | `PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `ON_THE_WAY`, `DELIVERED`, `CANCELLED` | Transitions enforced in Phase 6. |
| `PaymentMethod` | `CASH`, `VISA`, `INSTAPAY` | VISA + INSTAPAY reserved per Principle VII. |
| `TransactionStatus` | `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED` | |
| `DiscountUnit` | `FIXED`, `PERCENT` | |
| `NotificationType` | (see Notification entry above) | |

---

## Soft-delete coverage matrix

| Entity | Soft-delete? | Reason |
|---|---|---|
| User | yes | Audit & payout history. |
| UserAddress | yes | Order history references it. |
| Chef | yes | Audit, dispute history, revenue records. |
| Category | yes | Old menus/items reference it. |
| Menu | yes | Order history references it via items. |
| Item | yes | OrderItem snapshots `nameSnapshot` and `price`, but Item is preserved for analytics. |
| Order | yes | Audit-critical. |
| UserReview | yes | Reputation history. |
| Transaction | yes | Financial audit. |
| MenuAvailability | no | Join table; rebuilt at will. |
| Cart / CartItem | no | Request-scope state. |
| OrderItem | no | Snapshot rows; deleted only with parent Order (which is soft-deleted itself). |
| Favorite | no | Many-to-many record. |
| Notification | no | Operational; cleanup later if volume requires. |
| InvalidatedToken | no | Operational; daily cleanup. |

---

## Reserved-for-v2 schema slots (Constitution Principle VII)

These columns/enum members exist in the schema but no Phase 0–13 code
path writes or reads them. They are preserved so v2 migrations remain
clean.

- `Role.DRIVER` — driver role logic deferred.
- `PaymentMethod.VISA`, `PaymentMethod.INSTAPAY` — gateway integration
  deferred.
- `Transaction.cardAmount` — split-payment deferred.

---

## Validation rules summary (DTO-side, enforced in later phases)

Phase 0 sets up `ValidationPipe({ whitelist: true,
forbidNonWhitelisted: true, transform: true })` globally so every later
phase inherits FR-008 (extra-fields rejection). The DTO definitions
themselves arrive with their owning module in later phases. The schema-
level constraints (uniqueness, NOT NULL, foreign keys) above are the
last line of defense and apply from Phase 0 onward.
