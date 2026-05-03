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

## Constitution

Read `.specify/memory/constitution.md` before contributing. The seven core
principles are non-negotiable.
