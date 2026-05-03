# Phase 0 Quickstart

This is the five-minute boot path that satisfies success criterion
SC-001: a fresh contributor reaching a healthy `GET /api/v1/health`
response without consulting a teammate or accessing any shared secret.

The same path will live in the project `README.md` once Phase 0 lands;
this document is the spec-side reference.

---

## Prerequisites (verify first)

These should already be installed on the contributor's machine. They
are not counted against the five-minute budget.

- Node.js 20 LTS (`node --version` → `v20.x`)
- Docker Desktop (or Docker Engine on Linux) running
- `git`, `curl`, `openssl`
- A web browser (for Supabase project creation)

---

## Step 1 — Clone the repository (~30 s)

```bash
git clone https://github.com/<owner>/nafas.git
cd nafas
```

---

## Step 2 — Create your own Supabase project (~90 s)

Each contributor uses an isolated free-tier Supabase project. No
shared dev secret exists.

1. Open `https://supabase.com` and sign in.
2. Click **New Project**. Name it `nafas-dev-<your-handle>`. Choose any
   region. Pick a password for the database; you will copy it back to
   the connection string in step 3.
3. Wait for the project to provision (~60 s).
4. In **Settings → Database**, copy the **Connection string** (URI
   format).
5. In **Settings → API**, copy the **Project URL** and the
   **service_role** key.
6. In **Authentication → Policies**, **disable Row Level Security** on
   the public schema. (Application-layer guards are the only access
   control per Constitution / FR-016.)

---

## Step 3 — Configure backend environment (~30 s)

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set:

```env
DATABASE_URL="postgresql://postgres:<your-db-password>@db.<project>.supabase.co:5432/postgres"
SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_SERVICE_KEY="<service-role-key>"
```

For the JWT signing keys (used from Phase 1 onward — Phase 0 will
auto-generate development-only keys with a startup warning if these are
absent, but populating them now means no warnings later):

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Then base64-encode each and paste into `.env`:

```env
JWT_PRIVATE_KEY="<base64 of private.pem>"
JWT_PUBLIC_KEY="<base64 of public.pem>"
```

(These keys are used only locally; never commit them. `.env` is in
`.gitignore`.)

---

## Step 4 — Apply the schema (~45 s)

```bash
npm install
npx prisma migrate dev --name init
```

You should see Prisma create all 17 tables. Verify:

```bash
npx prisma migrate status
```

Expected output: `Database schema is up to date!`

---

## Step 5 — Seed the default chef placeholders into Supabase Storage (~60 s)

1. In the Supabase dashboard, open **Storage → Create a new bucket** and
   create four buckets with these exact names: `chef-logos`,
   `chef-banners`, `item-images`, `review-images`. Mark each as **Public
   bucket**.
2. Upload `<repo>/backend/assets/defaults/default-logo.png` to
   `chef-logos` (root path) and `<repo>/backend/assets/defaults/default-banner.png`
   to `chef-banners`. The PNGs are committed to the repo (generated from
   the `nafas-design-system` skill — see tasks.md T043) so you don't have
   to regenerate them.
3. Click each uploaded file → **Get URL** → copy the public URL.
4. Paste the two URLs into `<repo>/backend/.env`:
   ```env
   DEFAULT_CHEF_LOGO_URL="https://<project>.supabase.co/storage/v1/object/public/chef-logos/default-logo.png"
   DEFAULT_CHEF_BANNER_URL="https://<project>.supabase.co/storage/v1/object/public/chef-banners/default-banner.png"
   ```
   Phase 3 reads these when creating new Chef rows.

Designer-approved replacements can be uploaded over the bucket files
later without any code change (FR-011); the env-var URLs stay the same.

---

## Step 6 — Boot the backend (~30 s)

From the repository root:

```bash
docker compose -f docker-compose.dev.yml up backend
```

The backend starts on port 3000 with hot reload via volume mount.

---

## Step 7 — Verify health (~5 s)

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "checks": { "db": "ok" },
  "version": "0.1.0"
}
```

If you see `"status": "degraded"` and `"db": "down"`, your `DATABASE_URL`
is wrong; fix `.env` and `docker compose restart backend`.

---

## You are done

Total elapsed: under five minutes on a machine with prerequisites
already installed. You can now:

- Open Swagger at `http://localhost:3000/api/v1/docs` to browse the
  registered endpoints (only `/health` in Phase 0).
- Read `docs/IMPLEMENTATION_PLAN.md` for the rest of the roadmap.
- Pick up Phase 1 (auth + OTP + users) per the Spec Kit workflow:
  `/speckit-specify` to draft Phase 1's spec.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `prisma migrate dev` hangs | Wrong `DATABASE_URL` host or password | Re-copy from Supabase Settings → Database |
| `health` returns `degraded` immediately on boot | Backend started before DB connection finished — Supabase free tier sometimes wakes lazily | Wait ten seconds and retry |
| `docker compose up` errors with `port 3000 already in use` | Another local service holds the port | Stop the other service or change `BACKEND_PORT` in `.env` |
| CI gate `ci-no-hard-delete.sh` flags a legitimate `InvalidatedToken` cleanup | Allowlist regression | Confirm the matched line targets `prisma.invalidatedToken.deleteMany`; the script's allowlist permits this exact identifier |
