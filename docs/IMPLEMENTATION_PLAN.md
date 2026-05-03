# Nafas — Implementation Plan

> Sequential, executable plan for building the Nafas marketplace v1. Aligned with
> the project Constitution (`.specify/memory/constitution.md`, v1.0.0). Do not
> start a phase until the previous one is done. Each task has an ID and clear
> acceptance criteria.

## Context

This plan was revised from an initial ChatGPT-drafted version to close gaps
against the just-ratified Nafas Constitution and to resolve open architectural
questions. Key issues addressed:

- The plan now uses the real Spec Kit workflow (`/speckit-*`) rather than a
  fictional `spec-kit` CLI.
- Stock decrement uses **conditional UPDATE + retry** in pure Prisma (no raw
  SQL — Constitution Principle IV).
- Refresh-token blacklist lives in **Postgres** (`invalidated_tokens` table) —
  no Redis added to the stack.
- Phone verification is wired via **Twilio Verify** (the `phoneVerified` schema
  field is now meaningful).
- A `GET /api/v1/health` endpoint is explicitly created in Phase 0.
- Map provider, mobile token storage, VPS readiness, and domain ownership are
  decided below.
- Admin-only flows referenced by mobile/admin frontends now have matching
  backend endpoints planned.
- `OrderItem` price snapshots, soft-delete enforcement (Prisma Client
  Extensions, not deprecated middleware), and Decimal handling in JS are all
  specified.

**Goal**: a single, executable, sequential plan that satisfies all seven
constitution principles, matches the chosen stack exactly, and ships a v1 that
a real customer can use to order from a real chef. The codebase is **one
monorepo** (`backend/`, `mobile/`, `admin/` as siblings).

---

## Decisions Captured

| # | Decision | Implication |
|---|---|---|
| D1 | **Phone verification via Twilio Verify** | Adds `TwilioModule` wrapper, `/auth/send-otp` + `/auth/verify-otp` endpoints, new env vars, gating logic on register |
| D2 | **Stock concurrency via conditional UPDATE + retry** (pure Prisma) | `OrdersService.placeOrder` uses `prisma.$transaction([...updateMany(where: stock available)...])` and rolls back on `count === 0`. No raw SQL. |
| D3 | **Refresh-token blacklist in Postgres** (`invalidated_tokens` table) | One additional Prisma model + a daily cleanup cron. No Redis. |
| D4a | **Hostinger VPS NOT yet provisioned** | Phase 0 verifies on local Docker only. Phase 13 starts with provisioning subtasks. |
| D4b | **`nafas.app` domain NOT yet owned** | Phase 13 DNS + Certbot subtasks blocked on domain purchase. |
| D4c | **Maps via `react-native-maps` + Google Maps** | Requires Google Cloud project + Maps API key (free tier ample for v1). Used for chef coordinates and customer address coordinates. |
| D4d | **Refresh tokens in Expo SecureStore** (not AsyncStorage) | More secure on iOS/Android. AsyncStorage still used for non-sensitive prefs (language, last-seen tutorial). |
| D5 | **Single monorepo** | `backend/`, `mobile/`, `admin/` siblings under repo root, with shared root-level `docker-compose.yml`, `.github/workflows/`, `nginx/`. |

---

## Repo Layout (Monorepo)

```
nafas/
├── backend/                      # NestJS (Phase 0–9, 11 backend tasks)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── modules/{auth,users,addresses,chefs,categories,menus,items,
│   │   │            cart,orders,transactions,reviews,favorites,
│   │   │            notifications,storage,twilio,admin,health}/
│   │   ├── common/{decorators,guards,filters,interceptors,pipes,prisma}/
│   ├── Dockerfile
│   └── package.json
├── mobile/                       # Expo SDK 52
│   ├── app/{(auth),(tabs),(chef)}/
│   ├── context/, components/, services/, hooks/, constants/
│   └── package.json
├── admin/                        # Next.js 14 App Router
│   ├── app/{(auth),(dashboard)}/
│   └── package.json
├── docs/
│   └── IMPLEMENTATION_PLAN.md    # This document
├── nginx/nginx.conf
├── docker-compose.yml            # prod
├── docker-compose.dev.yml        # dev
└── .github/workflows/{backend.yml,mobile.yml,admin.yml,deploy.yml}
```

---

## Phase 0 — Foundation

**Branch**: `feature/phase-0-foundation` (created via `/speckit-git-feature`)

| # | Task |
|---|---|
| 0.1 | Initialize monorepo: scaffold `backend/`, `mobile/`, `admin/` empty workspaces. Independent installs per project (see Open Items §A1). |
| 0.2 | `nest new backend --strict` (Node 20, TypeScript strict). Add Prettier + ESLint. |
| 0.3 | `npx create-expo-app mobile` (SDK 52, Expo Router v6, TypeScript). Install: `expo-secure-store`, `expo-localization`, `expo-haptics`, `expo-notifications`, `expo-image-picker`, `react-native-maps`, `axios`, `@expo/vector-icons`, `expo-google-fonts/inter`. |
| 0.4 | `npx create-next-app admin --typescript --tailwind --app`. Install: `next-auth`, `axios`, `@tanstack/react-table`, `@dnd-kit/sortable`. |
| 0.5 | Create Supabase project. Copy `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. **Disable RLS** (app-layer auth governs). |
| 0.6 | Create Supabase Storage buckets: `chef-logos`, `chef-banners`, `item-images`, `review-images` (public-read). Upload default `default-logo.png` + `default-banner.png` into the first two; capture their public URLs as constants in backend config. |
| 0.7 | Add Prisma to backend. Write `schema.prisma` from constitution §6 — all 16 models + enums **plus**: `InvalidatedToken { jti String @id, userId String @db.Uuid, expiresAt DateTime, createdAt DateTime @default(now()) }`. |
| 0.8 | `prisma migrate dev --name init`. Verify all 17 tables in Supabase. |
| 0.9 | `PrismaService` extends `PrismaClient` with `$extends` to: (a) auto-filter `deletedAt: null` on all `findMany`/`findFirst`/`findUnique` for soft-delete models; (b) auto-set `deletedAt: new Date()` when `softDelete()` model method is called. Configure Decimal field handler to return strings (avoid JS float math). |
| 0.10 | Create `HealthModule` with `GET /api/v1/health` → `{ status: "ok", db: "ok" \| "down", version: pkg.version }`. |
| 0.11 | `docker-compose.dev.yml` — backend hot-reload via volume mount. No nginx, no admin (admin runs `next dev` separately). |
| 0.12 | GitHub Actions: three workflow files (`backend.yml`, `mobile.yml`, `admin.yml`) — each runs lint + type-check + build on PRs touching the matching path. |
| 0.13 | **Local-only verification**: `docker compose -f docker-compose.dev.yml up` → `curl http://localhost:3000/api/v1/health` returns 200. (VPS provisioning deferred to Phase 13.) |

**Done when**: All 17 tables visible in Supabase. Health endpoint green locally.
Lint + build CI green on a no-op PR for each workspace.

---

## Phase 1 — Authentication, Users, OTP

**Branch**: `feature/phase-1-auth`

### Backend

| # | Task |
|---|---|
| 1.1 | Generate RS256 keypair (`openssl genrsa -out private.pem 2048` + extract pub). Base64-encode each, store in env (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`). |
| 1.2 | `AuthModule`: `AuthController`, `AuthService`, `JwtStrategy` (verifies access via public key), `RefreshStrategy`. |
| 1.3 | `TwilioModule`: wraps `twilio` SDK; exposes `sendOtp(phone)` + `checkOtp(phone, code)` against Twilio Verify Service. Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. |
| 1.4 | `POST /auth/send-otp` — DTO: `{ phone }`. Calls Twilio Verify. Public, throttled (3/min/IP). |
| 1.5 | `POST /auth/register` — DTO: `{ fullName, phone, password, birthdate, otpCode }`. Validate OTP via Twilio. Hash password bcrypt(12). Create `User` with `phoneVerified=true`. Return token pair. |
| 1.6 | `POST /auth/sign-in` — DTO: `{ phone, password }`. Validate. Return token pair + user. |
| 1.7 | `POST /auth/refresh` — DTO: `{ refreshToken }`. Verify signature + expiry; check jti not in `InvalidatedToken`. Insert old jti into blacklist; issue new pair. |
| 1.8 | `POST /auth/sign-out` — Insert current refresh jti into `InvalidatedToken`. |
| 1.9 | `GET /auth/me` — Return user from JWT subject. |
| 1.10 | `JwtAuthGuard` registered as global default in `app.module.ts`. `@Public()` decorator opts routes out. `RolesGuard` + `@Roles()` decorator. |
| 1.11 | `UsersModule`: `PATCH /users/me` (update `fullName`, `email`, `phone` — phone change re-triggers OTP). `POST /users/me/fcm-token` (upsert). |
| 1.12 | Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. Helmet. `ThrottlerModule` (10/15min on `/auth/*`). |
| 1.13 | Swagger: `@nestjs/swagger`, bearer auth, all DTOs annotated. Mounted at `/api/v1/docs`. |
| 1.14 | Daily cleanup cron (`@nestjs/schedule`) deletes `InvalidatedToken` rows where `expiresAt < now()`. |

### Mobile

| # | Task |
|---|---|
| 1.15 | `services/api.ts` — Axios instance. Request interceptor attaches `Authorization`. Response interceptor: on 401 → `POST /auth/refresh` (single-flight; queue concurrent 401s) → retry. |
| 1.16 | `services/auth.ts` — `sendOtp`, `register`, `signIn`, `signOut`, `refreshToken`, `getMe`. |
| 1.17 | `context/AuthContext.tsx` — refresh token in **Expo SecureStore**, access token in memory only. Restores session on mount via `getMe()`. Exposes `user`, `isLoading`, `signIn`, `signOut`, `register`. |
| 1.18 | `app/_layout.tsx` — `RouteGuard`: unauthenticated → `/(auth)/welcome`; chef → `/(chef)`; customer → `/(tabs)`. Splash while `isLoading`. |
| 1.19 | `app/(auth)/welcome.tsx` — bilingual, design-system styling per `nafas-design-system` skill (welcome screen mockup). |
| 1.20 | `app/(auth)/sign-in.tsx` — phone + password. |
| 1.21 | `app/(auth)/register.tsx` — fullName, phone, password, confirm, birthdate. On submit: send OTP → navigate to OTP screen. |
| 1.22 | `app/(auth)/verify-otp.tsx` — 6-digit input, resend timer (60s), submit registers user. |
| 1.23 | `LanguageContext` — bound to `expo-localization`; persists to AsyncStorage; toggles `isRTL`; provides `t(key)`. Locale dictionaries in `constants/i18n/{en,ar}.ts`. |
| 1.24 | After auth resolves: register Expo push token via `POST /users/me/fcm-token`. Permission denial: app continues with no FCM. |

**Done when**: Customer registers via mobile (OTP received on real phone); signs in;
`GET /auth/me` returns user; refresh rotates and old token is rejected.

---

## Phase 2 — Addresses (with Map Picker)

**Branch**: `feature/phase-2-addresses`

### Backend

| # | Task |
|---|---|
| 2.1 | `AddressesModule` — `GET /addresses`, `POST /addresses`, `PATCH /addresses/:id`, `DELETE /addresses/:id`. All ownership-checked. |
| 2.2 | DELETE rejects with 409 if address is referenced by any `Order` whose `status NOT IN (DELIVERED, CANCELLED)`. |

### Mobile

| # | Task |
|---|---|
| 2.3 | Procure Google Maps API key (Cloud project, restrict to Android + iOS app bundle IDs). Configure in `app.json`/`app.config.ts`. |
| 2.4 | `services/addresses.ts` |
| 2.5 | `components/AddressPickerMap.tsx` — `react-native-maps` view with draggable pin; reverse-geocodes via Google Geocoding API to pre-fill streetName. |
| 2.6 | `app/(tabs)/profile/addresses.tsx` — list + add + edit + delete. |
| 2.7 | Address selection sheet — used at checkout (Phase 5). |

**Done when**: Customer adds 2 addresses (including one via map drag) and they
appear in the saved list across app restarts.

---

## Phase 3 — Categories, Chef Application, Verification

**Branch**: `feature/phase-3-chefs`

### Backend

| # | Task |
|---|---|
| 3.1 | `CategoriesModule` — `GET /categories` (public, active, ordered). `POST/PATCH/DELETE /categories` (admin). |
| 3.2 | Seed initial categories (in `prisma/seed.ts`): Koshary/كشري, Mahshi/محشي, Molokheya/ملوخية, Hawawshi/حواوشي, Sweets/حلويات, Feteer/فطير, Fattah/فتة, Other/أخرى. Each with `displayOrder` and Feather icon name. |
| 3.3 | `ChefsModule` |
| 3.4 | `POST /chef/apply` — auth(Customer). DTO: `{ chefName, bio, latitude, longitude, minOrderPrice }`. Creates Chef row with `is_verified=false`, `logo` and `banner` set to default-asset URLs from Phase 0.6. |
| 3.5 | `PATCH /chef/profile` — chef-only update. |
| 3.6 | `PATCH /chef/availability` — toggle `is_open`. |
| 3.7 | `POST /chef/logo`, `POST /chef/banner` — multipart via Multer → `StorageModule.upload()` → update Chef row. |
| 3.8 | `StorageModule` — `upload(bucket, path, buffer, mimeType) → publicUrl`, `delete(bucket, path)`. Uses `@supabase/supabase-js` service key. |
| 3.9 | `GET /chefs` — public; only `is_verified=true`. Filters: `is_open`, `category_id` (joined via menus), `q` (ilike on chefName/bio), `lat`+`lng`+`radius_km` (Haversine via Prisma `$queryRaw` — **narrow exception, justified in plan/complexity tracking**), pagination. |
| 3.10 | `GET /chefs/:id` — full profile + active menus, items filtered to today's availability. |
| 3.11 | `GET /chefs/:id/reviews` — paginated. |
| 3.12 | `AdminModule`: `GET /admin/chefs/pending`, `PATCH /admin/chefs/:id/verify` (sets `is_verified=true`, sets `user.role=CHEF`, creates SYSTEM Notification, sends FCM), `PATCH /admin/chefs/:id/reject` (records reason, optional FCM), `GET /admin/users` (paginated, role filter). |

> **Constitution exception note** (Task 3.9): Haversine distance ranking inside
> Postgres requires raw SQL. We accept a narrow `$queryRaw` exception scoped to
> the chef-discovery query, isolated to one repository method, with a unit test
> proving the contract. Recorded in Complexity Tracking.

### Mobile

| # | Task |
|---|---|
| 3.13 | `app/(auth)/chef-apply.tsx` — form + map picker for chef coordinates. |
| 3.14 | "Pending verification" holding screen — shown when user has a pending Chef row. |
| 3.15 | Customer tab bar: Home / Explore / Favorites / Orders / Profile (placeholders). |
| 3.16 | Chef tab bar (floating pill UI per design system): Dashboard / Orders / Menu / Stats / Schedule / Profile (placeholders). |
| 3.17 | `services/chefs.ts`, `services/categories.ts`. |

### Admin

| # | Task |
|---|---|
| 3.18 | NextAuth Credentials provider that POSTs to backend `/auth/sign-in`; rejects unless `user.role === ADMIN`. JWT session strategy. |
| 3.19 | Admin layout: sidebar nav (Dashboard, Chef Applications, Users, Orders, Categories, Chefs, Analytics) + header with current user + sign-out. |
| 3.20 | `/dashboard/chef-applications` — table of pending chefs; Verify / Reject buttons with confirmation dialogs (Reject requires reason). |
| 3.21 | `/dashboard/categories` — CRUD table. |

**Done when**: Customer applies → admin verifies via web → user re-signs-in and
sees chef tab bar. Categories endpoint returns seed data.

---

## Phase 4 — Menus & Items

**Branch**: `feature/phase-4-menus`

### Backend

| # | Task |
|---|---|
| 4.1 | `MenusModule` — `GET /chef/menus` (own, with items + availability), `POST /chef/menus`, `PATCH /chef/menus/:id`, `DELETE /chef/menus/:id`. |
| 4.2 | `POST /chef/menus/:id/availability` (validate dayOfWeek 0–6, idempotent), `DELETE /chef/menus/:id/availability/:dayId`. |
| 4.3 | `ItemsModule` — `GET /chef/menus/:menuId/items` (incl inactive), `POST /chef/menus/:menuId/items`, `PATCH /chef/items/:id`, `DELETE /chef/items/:id`. |
| 4.4 | `POST /chef/items/:id/images` — multi-file (max 5, 3MB each) → `item-images` bucket → append URLs. |
| 4.5 | `effectivePrice(item)` helper exported from `ItemsModule`; used by Cart, Orders, public chef profile. Uses `decimal.js`. |
| 4.6 | `GET /chefs/:id` filters items to today-available menus only. |

### Mobile

| # | Task |
|---|---|
| 4.7 | `services/menus.ts`, `services/items.ts`. |
| 4.8 | `context/ChefMenuContext.tsx`. |
| 4.9 | `app/(chef)/menu.tsx` — collapsible menu sections, item cards, add/edit modals, image picker (`expo-image-picker`), availability day chips. |
| 4.10 | `app/chef/[id].tsx` — public chef profile per design-system mockup (banner, logo, rating, bio, category chips, menu sections, item cards with discount badges). |
| 4.11 | `app/(tabs)/index.tsx` — Home: greeting, open chefs horizontal scroll, category chips, top-rated grid. |
| 4.12 | `app/(tabs)/explore.tsx` — search input (debounced) + category filter + paginated results list. |

**Done when**: Chef creates a menu with 3 items + day availability + images.
Customer views chef profile and sees only today-available items.

---

## Phase 5 — Cart

**Branch**: `feature/phase-5-cart`

### Backend

| # | Task |
|---|---|
| 5.1 | `CartModule` — `GET /cart` (own; items + subtotal + subtotalAfterDiscount; auto-create empty cart if missing). |
| 5.2 | `POST /cart/items` — `{ itemId, quantity }`. Validate item active + stock. If existing cart items belong to a different chef → `409 CART_CONFLICT { existingChefId, existingChefName }`. |
| 5.3 | `PATCH /cart/items/:id` — update quantity (qty=0 deletes). Validate stock + ownership. |
| 5.4 | `DELETE /cart/items/:id`, `DELETE /cart`. |
| 5.5 | Cart response shape: `{ id, chefId?, chefName?, items: [...], itemCount, subtotal, subtotalAfterDiscount, minOrderPrice }` (totals are display-only; final fees computed at order placement). |

### Mobile

| # | Task |
|---|---|
| 5.6 | `services/cart.ts`. |
| 5.7 | `context/CartContext.tsx` — `addItem`, `updateQty`, `removeItem`, `clearCart`, `cartCount`, `cartTotal`, `cartChefId`. Refetches after every mutation. |
| 5.8 | "Add to cart" CTA on item cards. On `409 CART_CONFLICT` → modal: "Clear cart and add from {existingChefName}?" |
| 5.9 | Floating cart bar (chef profile only) — count + total preview + tap to open cart. |
| 5.10 | `app/cart.tsx` — list with qty steppers, address picker, payment method selector (only CASH active in v1; VISA/INSTAPAY shown disabled with "Coming soon"), notes, optional schedule date picker (constrained per scheduled-order rules), live total breakdown, Place Order button. |

**Done when**: Customer fills cart from one chef. Conflict alert blocks
cross-chef. Cart count + total accurate after every change.

---

## Phase 6 — Orders & Notifications

**Branch**: `feature/phase-6-orders`

**Scheduled-order rules** (enforced server-side in `OrdersService`):
`scheduledDate` must be ≥ today, ≤ 7 days ahead, and the chef must have menu
availability that covers that weekday.

### Backend

| # | Task |
|---|---|
| 6.1 | `OrdersModule`. |
| 6.2 | `POST /orders` — DTO: `{ addressId, paymentMethod, scheduledDate?, notes? }`. **Inside `prisma.$transaction`**: validate chef.is_verified; chef.is_open (skip if scheduledDate); validate scheduled date rules; for each cart item run `updateMany({ where: { id, OR: [{ quantity: -1 }, { quantity: { gte: needed } }], deletedAt: null, isActive: true }, data: { quantity: { decrement: needed } } })` — if any returns `count===0`, throw `409 OUT_OF_STOCK { itemId }` (D2). Compute fees (constitution §13) using `decimal.js`. Create Order + OrderItem[] (snapshot `price` and `priceBeforeDiscount`). Create Transaction (PENDING). Clear cart. Outside transaction: create Notification + send FCM to chef. |
| 6.3 | `OrderStatusService.transition(orderId, fromActor, nextStatus, reason?)` — enforces Constitution §10 state machine; returns `409 INVALID_TRANSITION` otherwise. On `DELIVERED` → flip Transaction to `COMPLETED`. On `CANCELLED` → restore stock with the same conditional updateMany pattern. Always: write Notification + dispatch FCM (graceful: log+continue on FCM failure). |
| 6.4 | `PATCH /chef/orders/:id/status` — chef ownership check → `transition()`. |
| 6.5 | `PATCH /orders/:id/cancel` — customer-only, only `PENDING`, requires `cancelledReason` → `transition()`. |
| 6.6 | `GET /chef/orders` — filters: `status`, `scheduled=true`, `date=YYYY-MM-DD`, pagination. |
| 6.7 | `GET /orders` (customer history) and `GET /orders/:id` (customer or chef ownership). |
| 6.8 | `NotificationsModule` — `create(userId, type, titleJson, bodyJson, data?)` writes row + invokes `FcmService.send(fcmToken, …)`. FCM failures logged via `Logger.error` but never throw. |
| 6.9 | `GET /admin/orders` — full filters (status, chefId, userId, from, to). |

### Mobile

| # | Task |
|---|---|
| 6.10 | `services/orders.ts`. |
| 6.11 | `app/cart.tsx` Place Order → `POST /orders` → on success: refetch cart (now empty) → navigate `/(tabs)/orders`. |
| 6.12 | `app/(tabs)/orders.tsx` — order list with design-system status pills; pull-to-refresh + 30s polling while screen is focused. |
| 6.13 | Order detail sheet — items, fees breakdown, status timeline, cancel CTA when PENDING. |
| 6.14 | `app/(chef)/orders.tsx` — tabs (All / Pending / Active / Done), advance-status buttons matching state machine. |
| 6.15 | `app/(chef)/schedule.tsx` — `scheduledDate` orders grouped by date. |
| 6.16 | Configure `expo-notifications`: request permission on first auth; foreground handler shows in-app toast; tapping a push deep-links to the order. |
| 6.17 | If permission denied: in-app polling still surfaces order updates (no UX gap). |

**Done when**: Full lifecycle works end-to-end on a real device. All 9
notification events fire FCM **and** create Notification rows. Stock survives
20 concurrent `POST /orders` for the same low-stock item with no oversell.

---

## Phase 7 — Reviews & Favorites

**Branch**: `feature/phase-7-reviews-favs`

### Backend

| # | Task |
|---|---|
| 7.1 | `ReviewsModule` — `POST /orders/:id/review`: validate `DELIVERED`, ownership, no existing review. Create UserReview. **Recompute `chef.ratings` and `chef.totalReviews`** via Prisma `aggregate` inside a transaction with the insert. Create ORDER_REVIEW Notification + FCM to chef. |
| 7.2 | `POST /orders/:id/review/images` — up to 3, → `review-images`. |
| 7.3 | `FavoritesModule` — `GET /favorites` (saved chefs with profile), `POST /favorites/:chefId` (idempotent via `upsert`), `DELETE /favorites/:chefId`. |

### Mobile

| # | Task |
|---|---|
| 7.4 | "Leave review" CTA on delivered orders → review sheet (5-star picker, text, image picker). |
| 7.5 | `app/(tabs)/favorites.tsx` — saved chefs grid. |
| 7.6 | Heart toggle on chef profile + `context/FavoritesContext`. |

**Done when**: Review with photo updates chef rating immediately. Favorite
persists across restarts.

---

## Phase 8 — Notifications Centre

**Branch**: `feature/phase-8-notifications`

### Backend

| # | Task |
|---|---|
| 8.1 | `GET /notifications` — own, newest first, filters (`isRead`, `type`), pagination. |
| 8.2 | `PATCH /notifications/:id/read` (own, sets `readAt`). |
| 8.3 | `PATCH /notifications/read-all`. |
| 8.4 | `GET /notifications/unread-count`. |

### Mobile

| # | Task |
|---|---|
| 8.5 | `services/notifications.ts`. |
| 8.6 | Header bell icon — unread badge polled every 60s while app is foregrounded. |
| 8.7 | `app/notifications.tsx` — list rendering `title[lang]` + `body[lang]`; tap marks read; pull-to-refresh. |

**Done when**: Order placed → chef sees notification in Arabic when Arabic is
selected; unread badge clears on read-all.

---

## Phase 9 — Chef Dashboard & Analytics

**Branch**: `feature/phase-9-chef-stats`

### Backend

| # | Task |
|---|---|
| 9.1 | `GET /chef/stats?period=week\|month` — aggregate revenue, deliveredCount, cancelledCount, avgOrderValue, daily chart points, top-5 items by `OrderItem.quantity`. **Exclude `is_test=true` users** (Constitution §15.10). |

### Mobile

| # | Task |
|---|---|
| 9.2 | `app/(chef)/dashboard.tsx` — greeting, kitchen toggle (`PATCH /chef/availability`), quick stat cards, today's orders preview, scheduled preview, latest reviews. Polls every 60s. |
| 9.3 | `app/(chef)/stats.tsx` — summary cards, revenue bar chart (`react-native-svg-charts` or `victory-native`), orders chart, top items list, rating breakdown. |
| 9.4 | `services/chef.ts`. |

**Done when**: Dashboard shows real counts; revenue chart matches sum of
delivered orders in DB.

---

## Phase 10 — Profiles & Settings

**Branch**: `feature/phase-10-profiles`

| # | Task |
|---|---|
| 10.1 | `app/(tabs)/profile.tsx` — initials avatar, lifetime stats, editable user fields, addresses link, language toggle, sign-out. |
| 10.2 | `app/(chef)/profile.tsx` — chef stats row, editable Chef + User fields, logo/banner upload, language toggle, sign-out. |
| 10.3 | Language toggle persists in AsyncStorage; restored before first render. |
| 10.4 | Sign-out: `POST /auth/sign-out` → clear SecureStore + reset navigation to welcome. |

**Done when**: Both profiles save through API; language change survives full app
restart; sign-out returns to welcome.

---

## Phase 11 — Admin Dashboard (full)

**Branch**: `feature/phase-11-admin`

### Backend (additions)

| # | Task |
|---|---|
| 11.0a | `PATCH /admin/chefs/:id/availability` — admin force-sets `is_open`. Sends FCM to chef. |
| 11.0b | `PATCH /admin/categories/reorder` — body: `[{ id, displayOrder }]` array; bulk update in one transaction. |
| 11.0c | `PATCH /admin/users/:id` — update role, soft-delete (deactivate). |
| 11.0d | `GET /admin/stats` — platform totals: users, verified chefs, orders today, revenue this month, weekly trend. |

### Admin Web

| # | Task |
|---|---|
| 11.1 | `/dashboard` home — KPI cards from `/admin/stats`. |
| 11.2 | `/dashboard/users` — searchable, role filter, deactivate. |
| 11.3 | `/dashboard/orders` — filters, drawer with full detail + fee breakdown. |
| 11.4 | `/dashboard/categories` — `@dnd-kit/sortable` reorder → `/admin/categories/reorder`. |
| 11.5 | `/dashboard/chefs` — verified chefs list, view menus, force-close availability. |
| 11.6 | `/dashboard/analytics` — orders over time, revenue over time, top chefs by revenue. |

**Done when**: Admin can verify chefs, manage categories, view full order
history without DB access.

---

## Phase 12 — Hardening & QA

**Branch**: `feature/phase-12-hardening`

| # | Task |
|---|---|
| 12.1 | Backend integration tests: all auth endpoints (valid + invalid + OTP failures). |
| 12.2 | Order placement tests: stock decrement, fee calc, cart clear, scheduled-date validation. |
| 12.3 | State-machine tests: every valid transition + every invalid transition returns 409. |
| 12.4 | E2E test: customer registers → applies → admin verifies → menu → cart → order → all status transitions → review. |
| 12.5 | Security audit: every route has correct guard; no unguarded admin/chef routes. |
| 12.6 | DTO fuzz: extra fields, wrong types — verify `forbidNonWhitelisted` rejects all. |
| 12.7 | **Concurrency test**: 50 parallel `POST /orders` for an item with `quantity=10` — exactly 10 succeed, 40 receive `409 OUT_OF_STOCK` (validates D2). |
| 12.8 | Soft-delete consistency: assert no application code calls `prisma.X.delete()`; lint rule via custom ESLint rule or grep gate in CI. |
| 12.9 | Refresh-rotation test: old refresh token rejected post-rotation; blacklist row exists. |
| 12.10 | FCM graceful failure: stub Firebase to throw → order placement still succeeds. |
| 12.11 | Verify DB indexes match schema (`menus.chefId`, `items.menuId`, `orders.userId/chefId/status`, `user_reviews.userId`). |
| 12.12 | Mobile error boundary per route group; graceful messages. |
| 12.13 | Mobile offline detection — network banner via `@react-native-community/netinfo`. |
| 12.14 | Load test: k6 — `POST /orders` + `GET /chefs` at 100 concurrent users on staging. |
| 12.15 | Add Sentry to backend + mobile + admin (free tier; release tagging via CI). |
| 12.16 | `is_test` exclusion check: snapshot every analytics query, assert `WHERE isTest=false` is present. |

---

## Phase 13 — Deployment

**Branch**: `feature/phase-13-deploy`. **Blocked on operational prereqs (13.0a, 13.0b).**

| # | Task |
|---|---|
| 13.0a | **Purchase `nafas.app` domain** (or chosen alternative). |
| 13.0b | **Provision Hostinger VPS** (Ubuntu 22.04, ≥2 vCPU, ≥4 GB RAM). Install Docker, Docker Compose, Certbot, configure UFW (allow 22/80/443). |
| 13.1 | Backend prod `Dockerfile` — multi-stage (build → distroless or `node:20-alpine` runtime). |
| 13.2 | Admin prod `Dockerfile` — Next.js standalone output. |
| 13.3 | `docker-compose.yml` — backend + admin + nginx; restart=always; named networks. |
| 13.4 | `nginx/nginx.conf` — TLS, `api.nafas.app` → backend:3000, `admin.nafas.app` → admin:4000, gzip, security headers. |
| 13.5 | DNS: A records for both subdomains → VPS IP. |
| 13.6 | Certbot: certificates for both subdomains; auto-renew systemd timer. |
| 13.7 | `.github/workflows/deploy.yml` — on push to `main`, SSH to VPS → `git pull` → `docker compose up -d --build`. |
| 13.8 | Production `.env` files written directly on VPS (never committed). |
| 13.9 | `prisma migrate deploy` on prod DB. |
| 13.10 | Run `prisma/seed.ts` against prod (admin user from `ADMIN_PHONE`/`ADMIN_PASSWORD` env + categories). |
| 13.11 | Smoke test: register → apply → verify → order → deliver from a real device. |
| 13.12 | UptimeRobot on `https://api.nafas.app/api/v1/health` (5-min interval). |

**Done when**: Health endpoint green over HTTPS; full lifecycle completed on
prod from a real device.

---

## Dependency Map

```
Phase 0 (Foundation)
  └── Phase 1 (Auth + OTP + Users)
        ├── Phase 2 (Addresses + Maps)
        │     └── Phase 5 (Cart) ← needs addresses for checkout
        └── Phase 3 (Categories + Chef Application + Verification)
              ├── Phase 4 (Menus & Items)
              │     └── Phase 5 (Cart)
              │           └── Phase 6 (Orders + Notifications)
              │                 ├── Phase 7 (Reviews & Favorites)
              │                 ├── Phase 8 (Notifications Centre)
              │                 └── Phase 9 (Chef Dashboard & Analytics)
              └── Phase 11 (Admin Dashboard)
Phase 10 (Profiles) ← can start any time after Phase 1
Phase 12 (Hardening) ← after Phases 1–11
Phase 13 (Deployment) ← after Phase 12 + operational prereqs (13.0a, 13.0b)
```

---

## Spec Kit Workflow Per Phase

Each phase becomes one Spec Kit feature. The recommended sequence:

```
/speckit-specify "Phase N — <name>"     # creates feature + branch via hook
/speckit-clarify                        # only if the spec has open questions
/speckit-plan                           # generates plan.md with Constitution Check
/speckit-tasks                          # generates tasks.md
/speckit-implement                      # executes tasks
```

Hooks in `.specify/extensions.yml` automatically create the feature branch
(`speckit.git.feature` before `/speckit-specify`) and offer auto-commits after
each step.

---

## Critical Files to Create

**Root**: `docker-compose.yml`, `docker-compose.dev.yml`, `nginx/nginx.conf`,
`.github/workflows/{backend,mobile,admin,deploy}.yml`.

**Backend**: `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`,
`backend/src/main.ts`, `backend/src/app.module.ts`,
`backend/src/common/prisma/prisma.service.ts` (Client Extensions for soft-delete),
`backend/src/common/guards/{jwt-auth.guard.ts,roles.guard.ts}`,
plus 17 module folders under `backend/src/modules/` (auth, users, addresses,
chefs, categories, menus, items, cart, orders, transactions, reviews, favorites,
notifications, storage, twilio, admin, health).

**Mobile**: `mobile/app/_layout.tsx`, route groups `(auth)`, `(tabs)`, `(chef)`,
`mobile/context/{Auth,Language,Cart,ChefMenu,Favorites}Context.tsx`,
`mobile/services/*.ts` (one file per backend module),
`mobile/components/AddressPickerMap.tsx`,
`mobile/constants/i18n/{en,ar}.ts`.

**Admin**: `admin/app/layout.tsx`, `admin/app/(auth)/sign-in/page.tsx`,
`admin/app/(dashboard)/{,users,orders,categories,chefs,chef-applications,analytics}/page.tsx`,
`admin/lib/auth.ts` (NextAuth config), `admin/lib/api.ts`.

---

## Reusable Assets (already present)

- **Constitution** at `.specify/memory/constitution.md` — seven principles enforced
  by every phase's design and code review.
- **Design system** at `.claude/skills/nafas-design-system/` — colors, typography,
  spacing, radius, shadows, status pill styles, button/card/chip/input previews,
  customer + chef UI-kit HTML mockups. Reference before composing **any** screen
  (mobile + admin). The skill is invokable as `/nafas-design-system`.
- **Spec Kit workflow** — `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
  → `/speckit-implement` per phase, with `speckit.git.feature` creating the
  branch and `speckit.git.commit` auto-committing after each step.

---

## Verification Strategy

| Layer | How verified | When |
|---|---|---|
| Constitution alignment | `/speckit-plan` Constitution Check section per feature | Before starting each phase |
| Backend correctness | Jest integration tests against test Postgres (Supabase test project) + Swagger contract review | Per phase + Phase 12 sweep |
| Stock concurrency (D2) | k6 / `Promise.all` test at Phase 12.7 | Phase 12 |
| Soft-delete enforcement | Custom ESLint rule + grep CI gate forbidding `prisma.*.delete(` | Phase 0 + every CI run |
| Mobile UX | Real-device smoke per phase Done criteria; final E2E on iOS + Android | Per phase + Phase 12 |
| Bilingual / RTL parity | Locale switch test (every screen, EN ↔ AR) | Phase 12 |
| Notification matrix | Manual lifecycle run with FCM monitoring + Notification table inspection | End of Phase 6 + Phase 12 |
| Production health | UptimeRobot + manual full-lifecycle order on prod from real device | Phase 13.11–13.12 |

---

## Go/No-Go Checklist Before Phase 13

- [ ] All 17 Prisma models migrated and verified in Supabase
- [ ] Soft-delete extension active — no `prisma.X.delete()` in app code (CI gate)
- [ ] All auth endpoints return correct codes for valid + invalid input
- [ ] OTP send + verify flow works end-to-end on a real phone (Twilio Verify)
- [ ] Cart conflict detection working (one chef per cart)
- [ ] Order placement: fees calculated server-side via `decimal.js`, client totals ignored
- [ ] Order state machine rejects all invalid transitions with 409
- [ ] Stock decrement: 50 concurrent placeOrder calls on `quantity=10` item → exactly 10 succeed
- [ ] FCM push received on real device for all 9 notification events
- [ ] All 9 notification events create a `Notification` DB record
- [ ] Notifications bilingual (title/body JSON includes `ar` and `en`)
- [ ] Admin verify/reject chef working end-to-end
- [ ] Admin force-close availability + bulk reorder categories working
- [ ] Chef cannot access customer routes; customer cannot access chef routes
- [ ] `is_test` users excluded from analytics
- [ ] No secrets in codebase or Docker images
- [ ] At least one full order lifecycle on staging (register → apply → verify → menu → cart → order → deliver → review)
- [ ] Refresh token rotation: old token rejected after use; blacklist row written

---

## Open Items (still unresolved — flag during implementation if priority changes)

- **A1. Monorepo tooling.** `npm` workspaces vs `pnpm` workspaces vs no workspace tool
  (each project independently installed). Default plan assumes **independent installs**
  — simplest for three different frameworks. Revisit if shared TS types between backend
  and mobile become attractive.
- **A2. Twilio Verify cost.** ~$0.05/SMS to Egypt. At 1000 registrations/mo = $50/mo.
  Acceptable for v1; revisit if registration volume scales.
- **A3. Shared API types.** Backend Swagger could generate mobile + admin clients
  (e.g., `openapi-typescript`). Adds CI step. Deferred — manual `services/` files
  per the constitution coding standards are enough for v1.
- **A4. Prisma `$queryRaw` exception register.** The Haversine query in 3.9 will be
  the first justified exception. If a second exception is requested, escalate to a
  constitution amendment.
- **A5. Default chef logo + banner art.** Need designer-approved placeholder images
  (or a generic Nafas-branded image from the design system) before Phase 0.6.
