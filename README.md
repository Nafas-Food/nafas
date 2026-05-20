# Nafas (نفَس)

Two-sided marketplace for authentic Egyptian home-cooked food.

## Repo layout

- `backend/` — NestJS API (Node 20 LTS, TypeScript strict)
- `mobile/` — Expo SDK 54 customer + chef app (scaffold only in Phase 0)
- `admin/` — Next.js 14 admin web (scaffold only in Phase 0)
- `docs/IMPLEMENTATION_PLAN.md` — Full 13-phase roadmap
- `.specify/` — Spec Kit workflow (constitution, templates, scripts)
- `specs/001-phase-0-foundation/` — Active feature spec (Phase 0)

## Quickstart (Phase 0)

See `specs/001-phase-0-foundation/quickstart.md` for the five-minute boot
path that satisfies success criterion SC-001.

Short version:
1. Create your own free Supabase project at https://supabase.com
2. Disable Row Level Security on the `public` schema in Supabase
   (Constitution / FR-016 — application-layer guards are the only access
   control)
3. `cd backend && cp .env.example .env`, fill in `DATABASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
4. `npm install && npx prisma migrate dev --name init`
5. In Supabase Storage, create four **public** buckets: `chef-logos`,
   `chef-banners`, `item-images`, `review-images`. Upload
   `assets/defaults/default-logo.png` → `chef-logos` and
   `assets/defaults/default-banner.png` → `chef-banners`, then
   paste the public URLs into `.env` as `DEFAULT_CHEF_LOGO_URL` and
   `DEFAULT_CHEF_BANNER_URL` (see `quickstart.md` Step 5 for details)
6. `cd .. && docker compose -f docker-compose.dev.yml up backend`
7. `curl http://localhost:3000/api/v1/health` → `{ "status": "ok", ... }`

## Operating the health endpoint

The platform exposes a single unauthenticated probe at:

- Local: `http://localhost:3000/api/v1/health`
- Production (Phase 13+): `https://api.nafas.app/api/v1/health`

Response shape:

```json
{ "status": "ok" | "degraded", "checks": { "db": "ok" | "down" }, "version": "0.1.0" }
```

- `status` is `"ok"` when every entry in `checks` is `"ok"`, otherwise
  `"degraded"`. External monitors should treat `200 + degraded` as a
  paging-worthy event distinct from a connection failure.
- The endpoint short-circuits the database probe at two seconds, so the
  HTTP response always returns within five seconds regardless of database
  state.
- No authentication is required. Recommended monitor cadence: 5 minutes
  (UptimeRobot's free tier).

## Recent changes

- **Phase 4** ships the chef menu/item editor, today-available customer chef profile (Africa/Cairo wall clock), Home composer, and the server-authoritative `effectivePrice` helper. See `specs/005-phase-4-menus/quickstart.md` for the verification path. Zero new npm dependencies; migration is index-only (`0004_item_active_displayorder_indexes`). The `effectivePrice` helper lives at `backend/src/modules/items/effective-price.ts` for Phase 5 (cart) and Phase 6 (order snapshot) to import.
- **Phase 3**: Chef application + admin verification/rejection/revocation, public chef discovery (Haversine bounding-box), chef profile self-edit, seeded categories + admin CRUD/reorder, FCM push via `firebase-admin`, role-driven mobile tab switch.
- **Phase 2**: Saved customer addresses + map picker, in-flight-order delete safety rail, coordinate-redaction in error responses.

## Constitution

Read `.specify/memory/constitution.md` before contributing. The seven core
principles are non-negotiable.
