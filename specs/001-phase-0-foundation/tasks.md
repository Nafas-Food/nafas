---
description: "Phase 0 Foundation — implementation tasks"
---

# Tasks: Foundation

**Input**: Design documents from `/specs/001-phase-0-foundation/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓
**Branch**: `001-phase-0-foundation`
**Repo root**: `C:\Users\faragelo\Desktop\nafas` (referred to below as `<repo>`)

> **Implementer guidance**: Each task is atomic and self-contained. File paths
> are absolute or repo-relative. Where a file's full content matters, the
> content is inlined verbatim — copy it directly. Where the content is large
> (Prisma schema), the task points at the canonical artifact under
> `specs/001-phase-0-foundation/contracts/`. Run commands exactly as written.
> If a command fails, do not improvise — re-read the task and the referenced
> artifact, then ask for help.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks → safe to parallelize.
- **[Story]**: Maps to a user story in `spec.md` (`US1`–`US4`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the three workspaces and the root configuration.

- [X] T001 Verify the working directory. From PowerShell, run `Get-Location` and confirm the path ends in `nafas`. Confirm `.specify\` and `specs\001-phase-0-foundation\` exist (`Test-Path .specify`, `Test-Path specs\001-phase-0-foundation`). Do not proceed unless both return `True`.

- [X] T002 [P] Scaffold the backend workspace. From `<repo>` run:
  ```powershell
  npx -y -p @nestjs/cli@10 nest new backend --strict --skip-git --package-manager npm
  ```
  When prompted to overwrite an existing folder, answer no and stop — the folder must not pre-exist. Expected outcome: `<repo>\backend\package.json` and `<repo>\backend\src\main.ts` exist.

- [X] T003 [P] Scaffold the mobile workspace. From `<repo>` run:
  ```powershell
  npx -y create-expo-app@latest mobile --template blank-typescript
  ```
  Expected outcome: `<repo>\mobile\package.json` exists and contains `"expo"` in dependencies. No further mobile work happens in Phase 0 — this is a scaffold only so `mobile.yml` CI has something to build.

- [X] T004 [P] Scaffold the admin workspace. From `<repo>` run:
  ```powershell
  npx -y create-next-app@14 admin --typescript --tailwind --app --no-src-dir --no-eslint --use-npm --import-alias "@/*"
  ```
  Expected outcome: `<repo>\admin\package.json` exists, `<repo>\admin\app\page.tsx` exists. No further admin work in Phase 0.

- [X] T005 Create `<repo>\.gitignore` with the following exact content (overwrite if it exists):
  ```gitignore
  # Dependencies
  node_modules/
  **/node_modules/

  # Build artifacts
  dist/
  build/
  .next/
  .expo/
  *.tsbuildinfo

  # Environment files (NEVER commit)
  .env
  .env.local
  .env.*.local
  **/.env
  !**/.env.example

  # Keys (NEVER commit)
  *.pem
  *.key

  # OS / Editor
  .DS_Store
  Thumbs.db
  .vscode/
  .idea/

  # Per-user Claude Code settings (do not share)
  .claude/settings.local.json

  # Logs
  *.log
  npm-debug.log*
  yarn-debug.log*

  # Prisma generated client (regenerated on install)
  backend/node_modules/.prisma/

  # Test coverage
  coverage/
  ```

- [X] T006 Create `<repo>\README.md` with the following exact content (overwrite if scaffolders created one):
  ```markdown
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
  5. `cd .. && docker compose -f docker-compose.dev.yml up backend`
  6. `curl http://localhost:3000/api/v1/health` → `{ "status": "ok", ... }`

  ## Constitution

  Read `.specify/memory/constitution.md` before contributing. The seven core
  principles are non-negotiable.
  ```

- [X] T007 Create `<repo>\backend\.env.example` with the following exact content:
  ```env
  # Database (per-contributor Supabase project — see README)
  DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"

  # Supabase Storage (used from Phase 3)
  SUPABASE_URL="https://PROJECT.supabase.co"
  SUPABASE_SERVICE_KEY="REPLACE_WITH_SERVICE_ROLE_KEY"

  # JWT (RS256) — base64-encoded PEMs (used from Phase 1)
  # Generate with:
  #   openssl genrsa -out private.pem 2048
  #   openssl rsa -in private.pem -pubout -out public.pem
  #   base64 -w 0 private.pem  (Linux/WSL) or [Convert]::ToBase64String([IO.File]::ReadAllBytes("private.pem"))  (PowerShell)
  JWT_PRIVATE_KEY=""
  JWT_PUBLIC_KEY=""

  # Backend port
  BACKEND_PORT=3000

  # Service version (read into health endpoint)
  npm_package_version=0.1.0
  ```

- [X] T008 Edit `<repo>\backend\tsconfig.json`. Ensure the `compilerOptions` object contains all of: `"strict": true`, `"strictNullChecks": true`, `"noImplicitAny": true`, `"esModuleInterop": true`, `"skipLibCheck": true`, `"target": "ES2022"`, `"module": "commonjs"`, `"moduleResolution": "node"`, `"emitDecoratorMetadata": true`, `"experimentalDecorators": true`, `"sourceMap": true`, `"outDir": "./dist"`. The `nest new --strict` scaffold sets most of these; verify and add any that are missing. Do not remove other existing options.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend deps, bootstrap files, and Docker scaffold. Must complete before any user-story phase.

**⚠️ CRITICAL**: No US1–US4 task may begin until this phase is complete.

- [X] T009 Install backend runtime dependencies. From `<repo>\backend` run:
  ```powershell
  npm install @nestjs/swagger@7 @nestjs/throttler@5 @nestjs/schedule@4 @nestjs/terminus@10 @nestjs/config@3 @prisma/client@5 helmet@7 class-validator@0.14 class-transformer@0.5 decimal.js@10 reflect-metadata@0.2 rxjs@7
  ```
  Expected outcome: all packages appear under `dependencies` in `backend/package.json`.

- [X] T010 Install backend dev dependencies. From `<repo>\backend` run:
  ```powershell
  npm install --save-dev prisma@5 @types/node@20 supertest@6 @types/supertest@6
  ```
  Expected outcome: packages appear under `devDependencies`.

- [X] T011 Initialize Prisma in the backend. From `<repo>\backend` run:
  ```powershell
  npx prisma init --datasource-provider postgresql
  ```
  Expected outcome: `<repo>\backend\prisma\schema.prisma` exists with a `datasource db { url = env("DATABASE_URL") }` block. Delete the `<repo>\backend\.env` file that `prisma init` creates (we manage `.env` separately and don't want a half-populated copy committed by mistake).

- [X] T012 Create `<repo>\backend\src\common\prisma\prisma.service.ts` with the following exact content (base PrismaService — soft-delete `$extends` is added in T037 under US3):
  ```ts
  import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
  import { PrismaClient } from '@prisma/client';

  @Injectable()
  export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit(): Promise<void> {
      await this.$connect();
      this.logger.log('Prisma connected');
    }

    async onModuleDestroy(): Promise<void> {
      await this.$disconnect();
      this.logger.log('Prisma disconnected');
    }
  }
  ```

- [X] T013 Create `<repo>\backend\src\common\prisma\prisma.module.ts` with the following exact content:
  ```ts
  import { Global, Module } from '@nestjs/common';
  import { PrismaService } from './prisma.service';

  @Global()
  @Module({
    providers: [PrismaService],
    exports: [PrismaService],
  })
  export class PrismaModule {}
  ```

- [X] T014 Replace `<repo>\backend\src\main.ts` with the following exact content (overwrites the scaffold):
  ```ts
  import { ValidationPipe } from '@nestjs/common';
  import { NestFactory } from '@nestjs/core';
  import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
  import helmet from 'helmet';
  import { AppModule } from './app.module';

  async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);

    app.use(helmet());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nafas API')
      .setDescription('Phase 0 Foundation')
      .setVersion(process.env.npm_package_version ?? '0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/v1/docs', app, document);

    const port = Number(process.env.BACKEND_PORT ?? 3000);
    await app.listen(port, '0.0.0.0');
  }

  void bootstrap();
  ```

- [X] T015 Replace `<repo>\backend\src\app.module.ts` with the following exact content (HealthModule import is added in T022 — for now, leave it commented as shown):
  ```ts
  import { Module } from '@nestjs/common';
  import { ConfigModule } from '@nestjs/config';
  import { ScheduleModule } from '@nestjs/schedule';
  import { ThrottlerModule } from '@nestjs/throttler';
  import { PrismaModule } from './common/prisma/prisma.module';
  // import { HealthModule } from './modules/health/health.module'; // added in T022

  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ScheduleModule.forRoot(),
      ThrottlerModule.forRoot([
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'auth', ttl: 15 * 60_000, limit: 10 },
      ]),
      PrismaModule,
      // HealthModule,
    ],
  })
  export class AppModule {}
  ```

- [X] T016 Delete `<repo>\backend\src\app.controller.ts`, `<repo>\backend\src\app.service.ts`, `<repo>\backend\src\app.controller.spec.ts` if they exist (the scaffold creates them; we replace them with `HealthModule` in US1).

- [X] T017 Create `<repo>\backend\Dockerfile.dev` with the following exact content:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app

  COPY package.json package-lock.json ./
  RUN npm ci

  COPY . .
  RUN npx prisma generate

  EXPOSE 3000
  CMD ["npm", "run", "start:dev"]
  ```

- [X] T018 Create `<repo>\docker-compose.dev.yml` with the following exact content:
  ```yaml
  services:
    backend:
      build:
        context: ./backend
        dockerfile: Dockerfile.dev
      container_name: nafas-backend-dev
      restart: unless-stopped
      ports:
        - "${BACKEND_PORT:-3000}:3000"
      env_file:
        - ./backend/.env
      volumes:
        - ./backend/src:/app/src
        - ./backend/prisma:/app/prisma
        - /app/node_modules
      command: npm run start:dev
  ```

- [X] T019 Create directory `<repo>\backend\src\modules\` (empty for now — modules land in T021/T037/T039) and `<repo>\backend\src\common\admin-context\` (empty for now — populated in T038).

- [X] T020 Verify foundational install succeeds. From `<repo>\backend` run:
  ```powershell
  npm run build
  ```
  Expected outcome: build completes with no TypeScript errors. If errors mention missing modules referenced in commented lines (e.g., HealthModule), confirm those imports are in fact commented in T015.

**Checkpoint**: Foundation ready. User stories may now begin.

---

## Phase 3: User Story 1 — Contributor can boot the project end-to-end (Priority: P1) 🎯 MVP

**Goal**: A teammate clones the repo, follows the README, sets up their own Supabase project, and reaches a healthy `GET /api/v1/health` response within five minutes — without consulting anyone (FR-002, FR-006, FR-012, SC-001, SC-004).

**Independent Test**: From a fresh checkout, a teammate runs through the README quickstart, calls `curl http://localhost:3000/api/v1/health`, and observes a `200` response with `{ "status": "ok", "checks": { "db": "ok" }, "version": "0.1.0" }`. Separately, a no-op PR triggering each workspace's CI (touch a comment in each workspace) shows a green check within five minutes.

- [X] T021 [US1] Create `<repo>\backend\src\modules\health\prisma.health.ts` with the following exact content (custom Terminus indicator with explicit two-second short-circuit per research R4):
  ```ts
  import { Injectable } from '@nestjs/common';
  import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
  import { PrismaService } from '../../common/prisma/prisma.service';

  @Injectable()
  export class PrismaHealthIndicator extends HealthIndicator {
    constructor(private readonly prisma: PrismaService) {
      super();
    }

    async pingCheck(key: string): Promise<HealthIndicatorResult> {
      const timeoutMs = 2000;
      try {
        await Promise.race([
          this.prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('db timeout')), timeoutMs),
          ),
        ]);
        return this.getStatus(key, true);
      } catch {
        return this.getStatus(key, false, { reason: 'unreachable' });
      }
    }
  }
  ```

- [X] T022 [US1] Create `<repo>\backend\src\modules\health\health.controller.ts` with the following exact content:
  ```ts
  import { Controller, Get, HttpCode } from '@nestjs/common';
  import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
  import { HealthCheckService } from '@nestjs/terminus';
  import { PrismaHealthIndicator } from './prisma.health';

  @ApiTags('Health')
  @Controller('health')
  export class HealthController {
    constructor(
      private readonly health: HealthCheckService,
      private readonly prismaHealth: PrismaHealthIndicator,
    ) {}

    @Get()
    @HttpCode(200)
    @ApiOperation({ summary: 'Service + database liveness probe' })
    @ApiResponse({ status: 200, description: 'Service up; db state in payload.' })
    async check(): Promise<{
      status: 'ok' | 'degraded';
      checks: { db: 'ok' | 'down' };
      version: string;
    }> {
      const result = await this.health.check([() => this.prismaHealth.pingCheck('db')]);
      const dbOk = result.info?.db?.status === 'up';
      return {
        status: dbOk ? 'ok' : 'degraded',
        checks: { db: dbOk ? 'ok' : 'down' },
        version: process.env.npm_package_version ?? '0.1.0',
      };
    }
  }
  ```
  > Note: `@HealthCheck()` is intentionally omitted so Terminus never auto-returns 503. `pingCheck` catches its own errors and reports `down` via `getStatus`, so the endpoint always returns 200 with the degraded payload — matching FR-007 ("remain responsive") and the `health.openapi.yaml` contract.

- [X] T023 [US1] Create `<repo>\backend\src\modules\health\health.module.ts` with the following exact content:
  ```ts
  import { Module } from '@nestjs/common';
  import { TerminusModule } from '@nestjs/terminus';
  import { HealthController } from './health.controller';
  import { PrismaHealthIndicator } from './prisma.health';

  @Module({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [PrismaHealthIndicator],
  })
  export class HealthModule {}
  ```

- [X] T024 [US1] Edit `<repo>\backend\src\app.module.ts`. Uncomment the `HealthModule` import line and the `HealthModule` entry inside `imports`. Final `imports` array must include `HealthModule` as the last entry. Leave every other line unchanged.

- [X] T025 [P] [US1] Create `<repo>\.github\workflows\backend.yml` with the following exact content:
  ```yaml
  name: backend

  on:
    pull_request:
      paths:
        - 'backend/**'
        - '.github/workflows/backend.yml'
    push:
      branches: [main]
      paths:
        - 'backend/**'

  jobs:
    build:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: backend
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: 'npm'
            cache-dependency-path: backend/package-lock.json
        - run: npm ci
        - run: npx prisma generate
        - run: npm run lint
        - run: npm run build
        - name: Hard-delete CI gate
          run: bash scripts/ci-no-hard-delete.sh
  ```

- [X] T026 [P] [US1] Create `<repo>\.github\workflows\mobile.yml` with the following exact content:
  ```yaml
  name: mobile

  on:
    pull_request:
      paths:
        - 'mobile/**'
        - '.github/workflows/mobile.yml'
    push:
      branches: [main]
      paths:
        - 'mobile/**'

  jobs:
    build:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: mobile
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: 'npm'
            cache-dependency-path: mobile/package-lock.json
        - run: npm ci
        - run: npx tsc --noEmit
  ```

- [X] T027 [P] [US1] Create `<repo>\.github\workflows\admin.yml` with the following exact content. Note: the admin workspace was scaffolded with `--no-eslint` (T004), so eslint is not installed and `npm run lint` would fail. We use `npx tsc --noEmit` for type-check parity with mobile, and rely on `next build` for any remaining static checks:
  ```yaml
  name: admin

  on:
    pull_request:
      paths:
        - 'admin/**'
        - '.github/workflows/admin.yml'
    push:
      branches: [main]
      paths:
        - 'admin/**'

  jobs:
    build:
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: admin
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            cache: 'npm'
            cache-dependency-path: admin/package-lock.json
        - run: npm ci
        - run: npx tsc --noEmit
        - run: npm run build
  ```

- [X] T028 [US1] Verify the health endpoint locally. With `<repo>\backend\.env` populated (per `quickstart.md`) and the schema migrated (US2 must complete before this verification can return `db: ok`), from `<repo>` run:
  ```powershell
  docker compose -f docker-compose.dev.yml up --build backend
  ```
  In a second terminal: `curl http://localhost:3000/api/v1/health`. Expected: HTTP 200 with `{"status":"ok","checks":{"db":"ok"},"version":"0.1.0"}` once US2 is done. Until US2 completes, expect `{"status":"degraded","checks":{"db":"down"},"version":"0.1.0"}` — that itself proves the timeout/degraded path works (US1 acceptance scenario 2).

**Checkpoint**: User Story 1 backend code is in place. Endpoint will report `db: ok` once US2 migrates the schema; until then it correctly reports `db: down`. CI workflows will fire on PRs touching each workspace.

---

## Phase 4: User Story 2 — Canonical data model exists in the live database (Priority: P1)

**Goal**: All 16 constitutional entities + `InvalidatedToken` exist in the development database before any feature work begins, with no drift from the canonical schema (FR-003, FR-013, FR-014, FR-015, FR-016, SC-002, SC-003).

**Independent Test**: A reviewer with read-only DB credentials lists tables and finds all 17 (16 constitutional + InvalidatedToken). `npx prisma migrate status` reports "Database schema is up to date!" Re-running `npx prisma migrate dev` reports "no pending migrations."

- [X] T029 [US2] Replace `<repo>\backend\prisma\schema.prisma` with the canonical schema. The full content lives at `<repo>\specs\001-phase-0-foundation\contracts\schema.prisma`. Copy it byte-for-byte into `<repo>\backend\prisma\schema.prisma`. Do not edit either copy. (The two files are kept identical so reviewers can read the contract without leaving the spec folder.)

- [X] T030 [US2] In the Supabase dashboard for your dev project, navigate to **Authentication → Policies** and confirm Row Level Security is **disabled** on the `public` schema. This is FR-016. If you cannot disable it via the UI, run this SQL once in **SQL Editor**: `ALTER TABLE [each table] DISABLE ROW LEVEL SECURITY;` after T031 completes. (Phase 0 ships no app code that depends on RLS; the disable is to prevent surprise denials when tables are created.)

- [X] T031 [US2] Apply the schema. Confirm `<repo>\backend\.env` has a working `DATABASE_URL`, then from `<repo>\backend` run:
  ```powershell
  npx prisma migrate dev --name init
  ```
  Expected outcome: a new `<repo>\backend\prisma\migrations\<timestamp>_init\migration.sql` file is created and applied. The terminal output should show `Applying migration` followed by `Your database is now in sync with your schema`.

- [X] T032 [US2] Verify table count. From `<repo>\backend` run:
  ```powershell
  npx prisma db execute --stdin --url $env:DATABASE_URL
  ```
  When the prompt appears, paste `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';` and press Ctrl+Z then Enter. Expected: 17 tables total (16 application tables — `User`, `UserAddress`, `Chef`, `Category`, `Menu`, `MenuAvailability`, `Item`, `Cart`, `CartItem`, `Order`, `OrderItem`, `Transaction`, `UserReview`, `Favorite`, `Notification`, `InvalidatedToken` — plus `_prisma_migrations`).

  > If `npx prisma db execute` is awkward in your shell, the equivalent test is to open Supabase **Table Editor** and visually confirm the 16 application tables are present: `User`, `UserAddress`, `Chef`, `Category`, `Menu`, `MenuAvailability`, `Item`, `Cart`, `CartItem`, `Order`, `OrderItem`, `Transaction`, `UserReview`, `Favorite`, `Notification`, `InvalidatedToken`. (Prisma capitalizes model names by default; if your Supabase view is lowercase that is also OK — Postgres is case-folded unless quoted, and Prisma quotes them.)

- [X] T033 [US2] Verify zero schema drift. From `<repo>\backend` run:
  ```powershell
  npx prisma migrate status
  ```
  Expected: `Database schema is up to date!`. If output instead says "drift detected" or "following migration(s) have not yet been applied", stop and re-read the canonical schema in T029 — your local copy diverged.

- [X] T034 [US2] Verify the canonical schema and the live schema agree. In the Supabase Table Editor, click any one of `User`, `Order`, `Item`, `Transaction`, `UserReview` and confirm:
  - Primary key is `uuid` (not `int`/`serial`) — FR-015.
  - Money columns (`amount`, `total`, `price`, `subtotal`, `deliveryFee`, `serviceFee`, `subtotalAfterDiscount`, `priceBeforeDiscount`, `minOrderPrice`) are `numeric(10,2)` — FR-014.
  - Soft-delete columns (`deletedAt`) exist on the soft-delete entities listed in `data-model.md`'s coverage matrix.

**Checkpoint**: User Story 2 complete. Re-run T028 from US1 — health endpoint should now report `db: ok`.

---

## Phase 5: User Story 3 — Platform guardrails enforced from day one (Priority: P2)

**Goal**: Soft-delete is enforced by default, the admin-context-only escape hatch works, hard deletes on soft-delete entities are blocked at CI, validation rejects extra fields, secrets stay out of the repo, storage buckets exist with brand-aligned default chef placeholders, and the daily token-cleanup job runs (FR-004, FR-005, FR-008, FR-009, FR-010, FR-011, FR-017, SC-005, SC-006, SC-008).

**Independent Test**: (a) A line of application code calling `prisma.user.delete(...)` is detected and the PR fails CI; (b) `POST` to a future endpoint with an extra field returns a clear validation error (covered by `forbidNonWhitelisted` from T014 — no new endpoint needed in Phase 0); (c) `git ls-files | grep -E '\\.env$|\\.pem$|\\.key$'` returns empty; (d) the four Supabase Storage buckets exist with the two default placeholder files; (e) the cleanup job log line appears at next 03:00 UTC.

### Soft-delete extension (FR-004)

- [X] T035 [US3] Create `<repo>\backend\src\common\admin-context\admin-context.service.ts` with the following exact content:
  ```ts
  import { Injectable } from '@nestjs/common';
  import { AsyncLocalStorage } from 'node:async_hooks';

  export interface AdminContextStore {
    includeDeleted: boolean;
  }

  @Injectable()
  export class AdminContextService {
    private readonly als = new AsyncLocalStorage<AdminContextStore>();

    run<T>(store: AdminContextStore, callback: () => T): T {
      return this.als.run(store, callback);
    }

    getStore(): AdminContextStore | undefined {
      return this.als.getStore();
    }
  }
  ```

- [X] T036 [US3] Create `<repo>\backend\src\common\admin-context\admin-context.module.ts` with the following exact content:
  ```ts
  import { Global, Module } from '@nestjs/common';
  import { AdminContextService } from './admin-context.service';

  @Global()
  @Module({
    providers: [AdminContextService],
    exports: [AdminContextService],
  })
  export class AdminContextModule {}
  ```

- [X] T037 [US3] Replace `<repo>\backend\src\common\prisma\prisma.service.ts` with the following exact content (adds the soft-delete `$extends` plus a `softDelete()` model helper, gated by AdminContextService):
  ```ts
  import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
  import { Prisma, PrismaClient } from '@prisma/client';
  import { AdminContextService } from '../admin-context/admin-context.service';

  const SOFT_DELETE_MODELS = new Set([
    'User',
    'UserAddress',
    'Chef',
    'Category',
    'Menu',
    'Item',
    'Order',
    'UserReview',
    'Transaction',
  ]);

  type ExtendedClient = ReturnType<typeof buildExtended>;

  function buildExtended(base: PrismaClient, adminContext: AdminContextService) {
    return base.$extends({
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (
              SOFT_DELETE_MODELS.has(model) &&
              !adminContext.getStore()?.includeDeleted
            ) {
              args.where = { ...(args.where ?? {}), deletedAt: null };
            }
            return query(args);
          },
          async findFirst({ model, args, query }) {
            if (
              SOFT_DELETE_MODELS.has(model) &&
              !adminContext.getStore()?.includeDeleted
            ) {
              args.where = { ...(args.where ?? {}), deletedAt: null };
            }
            return query(args);
          },
          async findUnique({ model, args, query }) {
            const result = await query(args);
            if (
              SOFT_DELETE_MODELS.has(model) &&
              !adminContext.getStore()?.includeDeleted &&
              result &&
              (result as { deletedAt?: Date | null }).deletedAt !== null
            ) {
              return null as never;
            }
            return result;
          },
          async count({ model, args, query }) {
            if (
              SOFT_DELETE_MODELS.has(model) &&
              !adminContext.getStore()?.includeDeleted
            ) {
              args.where = { ...(args.where ?? {}), deletedAt: null };
            }
            return query(args);
          },
          async aggregate({ model, args, query }) {
            if (
              SOFT_DELETE_MODELS.has(model) &&
              !adminContext.getStore()?.includeDeleted
            ) {
              args.where = { ...(args.where ?? {}), deletedAt: null };
            }
            return query(args);
          },
        },
      },
      model: {
        $allModels: {
          async softDelete<T>(this: T, where: unknown): Promise<unknown> {
            const ctx = Prisma.getExtensionContext(this) as unknown as {
              update: (args: { where: unknown; data: { deletedAt: Date } }) => Promise<unknown>;
              name: string;
            };
            if (!SOFT_DELETE_MODELS.has(ctx.name)) {
              throw new Error(
                `softDelete() called on non-soft-delete model: ${ctx.name}`,
              );
            }
            return ctx.update({ where, data: { deletedAt: new Date() } });
          },
        },
      },
    });
  }

  @Injectable()
  export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    public readonly extended: ExtendedClient;

    constructor(private readonly adminContext: AdminContextService) {
      super();
      this.extended = buildExtended(this, adminContext);
      return new Proxy(this, {
        get: (target, prop) => {
          if (prop === 'extended') return target.extended;
          if (prop === '$connect') return target.$connect.bind(target);
          if (prop === '$disconnect') return target.$disconnect.bind(target);
          if (prop === '$queryRaw') return target.$queryRaw.bind(target);
          if (prop === 'onModuleInit') return target.onModuleInit.bind(target);
          if (prop === 'onModuleDestroy') return target.onModuleDestroy.bind(target);
          if (prop === 'logger') return target.logger;
          if (typeof prop === 'string' && prop.startsWith('$')) {
            return (target as any)[prop];
          }
          const ext = target.extended[prop as string];
          if (ext !== undefined) return ext;
          return (target as any)[prop];
        },
      }) as any;
    }

    async onModuleInit(): Promise<void> {
      await this.$connect();
      this.logger.log('Prisma connected (soft-delete extension active)');
    }

    async onModuleDestroy(): Promise<void> {
      await this.$disconnect();
      this.logger.log('Prisma disconnected');
    }
  }
  ```
  > **Important**: The PrismaService constructor returns a Proxy that routes model property accesses (e.g., `prismaService.user.findMany(...)`) to `this.extended`, so soft-delete filtering is applied by default. Prisma-native methods prefixed with `$` (`$queryRaw`, `$connect`, `$disconnect`, `$transaction`, etc.) and NestJS lifecycle hooks remain on the raw `super` client. This means `prismaService.user.findMany()` and `prismaService.extended.user.findMany()` are functionally equivalent — the extension is the default surface.
  >
  > `findUnique` returns `null` for soft-deleted rows via post-fetch suppression — the row is fetched but discarded. If you legitimately need to know a soft-deleted row exists, run inside an admin context with `adminContext.run({ includeDeleted: true }, () => ...)`.
  >
  > Document this convention in T052's CLAUDE.md update.

- [X] T038 [US3] Edit `<repo>\backend\src\common\prisma\prisma.module.ts`. Replace its content with:
  ```ts
  import { Global, Module } from '@nestjs/common';
  import { AdminContextModule } from '../admin-context/admin-context.module';
  import { PrismaService } from './prisma.service';

  @Global()
  @Module({
    imports: [AdminContextModule],
    providers: [PrismaService],
    exports: [PrismaService],
  })
  export class PrismaModule {}
  ```

- [X] T039 [US3] Edit `<repo>\backend\src\app.module.ts`. Add `import { AdminContextModule } from './common/admin-context/admin-context.module';` near the other imports, and add `AdminContextModule` to the `imports` array (place it before `PrismaModule`). Leave every other line unchanged.

### CI grep gate (FR-005)

- [X] T040 [US3] Create `<repo>\backend\scripts\ci-no-hard-delete.sh` with the following exact content (LF line endings — if your editor saves CRLF, run `dos2unix` or set `core.autocrlf=input` for this file):
  ```bash
  #!/usr/bin/env bash
  # CI gate: forbid prisma.<SoftDeleteModel>.delete( and deleteMany( calls.
  # See specs/001-phase-0-foundation/research.md R3.

  set -euo pipefail

  SOFT_DELETE_MODELS=(user userAddress chef category menu item order userReview transaction)

  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  SRC_DIR="$ROOT_DIR/src"

  if [ ! -d "$SRC_DIR" ]; then
    echo "ci-no-hard-delete: $SRC_DIR not found"
    exit 1
  fi

  fail=0
  for model in "${SOFT_DELETE_MODELS[@]}"; do
    pattern="prisma(Service)?(\.extended)?\.${model}\.(delete|deleteMany)\\("
    if grep -RInE "$pattern" "$SRC_DIR" --include='*.ts' --exclude-dir=node_modules; then
      echo ""
      echo "FORBIDDEN: hard delete on soft-delete model '$model'."
      echo "Use prisma.<model>.softDelete({ where: { id } }) instead."
      fail=1
    fi
  done

  if [ "$fail" -ne 0 ]; then
    exit 1
  fi
  echo "ci-no-hard-delete: OK (no forbidden delete calls found)"
  ```

- [X] T041 [US3] Verify the gate works locally. From `<repo>\backend` run:
  ```powershell
  bash scripts/ci-no-hard-delete.sh
  ```
  Expected: `ci-no-hard-delete: OK (no forbidden delete calls found)`. To prove the gate detects offenders, temporarily add a line `prisma.user.delete({ where: { id: '1' } });` anywhere under `backend/src/`, re-run the script, observe non-zero exit + the FORBIDDEN message, then remove the test line.

### Storage buckets + default placeholders (FR-010, FR-011)

- [X] T042 [US3] **Document the per-contributor Storage bucket setup.** Because each contributor uses their own free-tier Supabase project (research R10), the four buckets must be created in each contributor's project, not centrally. Action: confirm `<repo>\README.md` and `<repo>\specs\001-phase-0-foundation\quickstart.md` Step 5 instruct the contributor to create buckets named exactly `chef-logos`, `chef-banners`, `item-images`, `review-images`, each marked **Public bucket**, in their own Supabase project. If the wording is missing or has drifted, fix README/quickstart now. Then create the four buckets in *your own* dev Supabase project to verify the documented steps work.

- [X] T043 [US3] **Generate the brand-aligned default chef placeholders and document the upload step.** Invoke the design-system skill (`/nafas-design-system`) and request: "default chef logo (512×512) and banner (1600×600) PNGs — gradient background + Nafas wordmark, no text in either Arabic or English beyond the wordmark itself." Commit the generated PNGs to `<repo>\backend\assets\defaults\default-logo.png` and `<repo>\backend\assets\defaults\default-banner.png` (create the directory) so every contributor has the same source artwork. Then:
  1. Confirm the README and `quickstart.md` Step 5 instruct the contributor to upload `default-logo.png` to the `chef-logos` bucket (root, no subfolder) and `default-banner.png` to the `chef-banners` bucket in their own Supabase project, and to copy the resulting public URLs into `<repo>\backend\.env` as `DEFAULT_CHEF_LOGO_URL` and `DEFAULT_CHEF_BANNER_URL`.
  2. Add the two new variables to `<repo>\backend\.env.example` (append after `SUPABASE_SERVICE_KEY`):
     ```env
     # Default chef placeholders (uploaded per-contributor; see quickstart Step 5)
     DEFAULT_CHEF_LOGO_URL=""
     DEFAULT_CHEF_BANNER_URL=""
     ```
  3. Verify on your own Supabase project: upload both PNGs, confirm each is accessible via **Get URL** → public URL opens in a browser, paste both URLs into your local `<repo>\backend\.env`. Phase 3 will read those env vars when creating new Chef rows.

### InvalidatedToken cleanup job (FR-017)

- [X] T044 [US3] Create `<repo>\backend\src\common\jobs\invalidated-token-cleanup.job.ts` with the following exact content:
  ```ts
  import { Injectable, Logger } from '@nestjs/common';
  import { Cron, CronExpression } from '@nestjs/schedule';
  import { PrismaService } from '../prisma/prisma.service';

  @Injectable()
  export class InvalidatedTokenCleanupJob {
    private readonly logger = new Logger(InvalidatedTokenCleanupJob.name);

    constructor(private readonly prisma: PrismaService) {}

    @Cron(CronExpression.EVERY_DAY_AT_3AM, {
      name: 'invalidated-token-cleanup',
      timeZone: 'UTC',
    })
    async run(): Promise<void> {
      const result = await this.prisma.invalidatedToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      this.logger.log(`InvalidatedToken cleanup: deleted ${result.count} rows`);
    }
  }
  ```

- [X] T045 [US3] Create `<repo>\backend\src\common\jobs\jobs.module.ts` with the following exact content, then edit `<repo>\backend\src\app.module.ts` to add `import { JobsModule } from './common/jobs/jobs.module';` and append `JobsModule` to the `imports` array:
  ```ts
  import { Module } from '@nestjs/common';
  import { InvalidatedTokenCleanupJob } from './invalidated-token-cleanup.job';

  @Module({
    providers: [InvalidatedTokenCleanupJob],
  })
  export class JobsModule {}
  ```

### Secrets verification (FR-009, SC-008)

- [X] T046 [US3] Confirm zero secret-shaped values are tracked. From `<repo>` run:
  ```powershell
  git ls-files | Select-String -Pattern '\.env$|\.pem$|\.key$|\.p12$|\.pfx$'
  ```
  Expected: no matches except `backend/.env.example`. If anything else matches, immediately `git rm --cached <file>` and add it to `<repo>\.gitignore`. Then run:
  ```powershell
  git ls-files | Select-String -Pattern 'BEGIN (RSA )?PRIVATE KEY|service_role'
  ```
  Expected: no matches. If matches appear, redact and rewrite history before merging.

**Checkpoint**: All four guardrails active. Soft-delete default filter, admin-context escape hatch, CI grep gate, Supabase buckets + placeholders, daily cleanup job, secrets clean. `npm run build` in `<repo>\backend` should still succeed.

---

## Phase 6: User Story 4 — Foundation is observable enough to monitor (Priority: P3)

**Goal**: An operator can configure an external uptime monitor against `GET /api/v1/health` without further code or configuration changes (FR-006, FR-007, SC-007, SC-009).

**Independent Test**: From any external machine (or just `curl` from the host), an unauthenticated GET to the health URL returns within one second under normal conditions and within five seconds when the database is unreachable, with a payload that names the platform version.

> **Note**: T021–T024 already implemented the full Terminus indicator with the
> two-second short-circuit and the version field. US4 is intentionally thin
> because US1's acceptance criteria already required a working health endpoint
> with a degraded path. The remaining US4 work is verification + operator
> documentation.

- [X] T047 [US4] Verify the normal-condition response time. From `<repo>` (with backend running and DB reachable) run:
  ```powershell
  Measure-Command { Invoke-WebRequest -Uri http://localhost:3000/api/v1/health -UseBasicParsing }
  ```
  Expected: `TotalMilliseconds` < 1000.

- [X] T048 [US4] Verify the degraded-path response time. Edit `<repo>\backend\.env` and change `DATABASE_URL` to a deliberately-bad host (e.g., change the project subdomain to `db.invalid.supabase.co`). Restart `docker compose -f docker-compose.dev.yml up backend` (Ctrl+C, then up again). Then run:
  ```powershell
  Measure-Command { Invoke-WebRequest -Uri http://localhost:3000/api/v1/health -UseBasicParsing }
  ```
  Expected: `TotalMilliseconds` < 5000, response body contains `"status":"degraded"` and `"db":"down"`. Restore the correct `DATABASE_URL` and restart.

- [X] T049 [US4] Verify the version field is populated. The `version` field reads `process.env.npm_package_version`. When started via `npm run start:dev`, npm sets this from `backend/package.json`'s `version` field. Confirm `<repo>\backend\package.json` has `"version": "0.1.0"` (the scaffold defaults to this; if it's something else, change to `0.1.0`). The health response's `version` should match.

- [X] T050 [US4] Append a new section to `<repo>\README.md` titled `## Operating the health endpoint` with the following exact content:
  ````markdown
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
  ````

**Checkpoint**: All four user stories independently verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T051 [P] Update `<repo>\CLAUDE.md`. From `<repo>` run:
  ```powershell
  bash .specify/scripts/bash/update-agent-context.sh claude
  ```
  Confirm CLAUDE.md now reflects this feature (script reads `plan.md`).

- [X] T052 [P] Add a one-paragraph "Phase 0 conventions" note between the markers `<!-- MANUAL ADDITIONS START -->` and `<!-- MANUAL ADDITIONS END -->` in `<repo>\CLAUDE.md` with this exact content:
  ```markdown
  ## Phase 0 conventions (do not regress)

  - All reads on soft-delete models go through
    `prismaService.extended.<model>` (e.g.,
    `prismaService.extended.user.findMany(...)`,
    `prismaService.extended.user.findUnique({ where: { id } })`). The
    extension transparently filters or post-filters `deletedAt`. The bare
    `prismaService.<model>` client is reserved for the health probe and
    migration tooling only.
  - Hard `prisma.<model>.delete(...)` on soft-delete entities is blocked at
    CI by `backend/scripts/ci-no-hard-delete.sh`. Use
    `prisma.<model>.softDelete({ where })` instead.
  - The admin-context escape hatch lives in
    `backend/src/common/admin-context/admin-context.service.ts`. A handler
    that legitimately needs deleted rows wraps its call in
    `adminContext.run({ includeDeleted: true }, () => ...)`. The wrapper is
    only valid inside admin-only handlers (Phase 11 will wire the role
    guard); Phase 0 ships the mechanism, not the gating.
  - Every monetary field is `Decimal(10,2)` and is delivered as a JS
    string. Do all money math with `decimal.js`. Never call
    `Number(amount)`.
  - Each contributor uses their own free-tier Supabase project. There is
    no shared dev secret store.
  ```

- [X] T053 Run the full quickstart from a clean state to validate SC-001. With a stopwatch: clone the repo to a fresh folder, follow `specs/001-phase-0-foundation/quickstart.md` step by step, and confirm `curl http://localhost:3000/api/v1/health` returns `{"status":"ok",...}` in under five minutes (excluding pre-installed prerequisites). Document any step that took longer than expected as a follow-up improvement to the quickstart.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** — no dependencies.
- **Foundational (Phase 2)** — depends on Setup. Blocks all user stories.
- **US1 (Phase 3)** — depends on Foundational. Independently testable once US2 also lands (so the `db: ok` path can be proven), but the code is independently complete after T028.
- **US2 (Phase 4)** — depends on Foundational only. Can run in parallel with US1's code tasks.
- **US3 (Phase 5)** — depends on Foundational; T037 depends on T035 + T036; T044 depends on US2 (needs the `InvalidatedToken` table to exist).
- **US4 (Phase 6)** — depends on US1 (the endpoint exists). Mostly verification + docs.
- **Polish (Phase 7)** — depends on US1–US4 done.

### Within-Story Order

- **US1**: T021 → T022 → T023 → T024 (sequential — same module being built up). T025/T026/T027 in parallel after T020. T028 last.
- **US2**: T029 → T030 → T031 → T032 → T033 → T034 (strictly sequential).
- **US3**: T035 → T036 → T037 → T038 → T039 (PrismaService rebuild path); T040 → T041 in parallel with the PrismaService chain; T042 → T043 in parallel; T044 → T045 after US2 + after T037; T046 last.
- **US4**: T047 → T048 → T049 → T050 (sequential — share manual verification flow).

### Parallel Opportunities

- T002 / T003 / T004 (workspace scaffolds — independent folders).
- T025 / T026 / T027 (three CI workflows — different files).
- Across-story parallelism: with two implementers, one runs US1 (T021–T028), the other runs US2 (T029–T034) once Foundational is done. US3 starts after US2 because T044 needs the `InvalidatedToken` table.

---

## Parallel Example: User Story 1 (CI workflows after foundational is done)

```bash
# Three editor windows, three writes — none touch the same file:
Task: "Create .github/workflows/backend.yml per T025"
Task: "Create .github/workflows/mobile.yml per T026"
Task: "Create .github/workflows/admin.yml per T027"
```

---

## Implementation Strategy

### MVP first (US1 + US2)

Both P1 stories must complete to call Phase 0 done. Order:

1. Phase 1 Setup (T001–T008).
2. Phase 2 Foundational (T009–T020).
3. Phase 4 US2 (T029–T034) — schema must exist before health can return `db: ok`.
4. Phase 3 US1 (T021–T028) — verify health endpoint goes green with the live schema.
5. **STOP and validate**: `curl http://localhost:3000/api/v1/health` returns `{"status":"ok","checks":{"db":"ok"},"version":"0.1.0"}`.

### Add guardrails (US3)

6. Phase 5 US3 (T035–T046).

### Add observability polish (US4) and polish

7. Phase 6 US4 (T047–T050).
8. Phase 7 Polish (T051–T053).

### Notes for the implementer

- Run `npm run build` in `<repo>\backend` after every backend code change. If the build breaks, the next task that depends on it will not work.
- Commit after each phase checkpoint. Suggested commit messages:
  - After Phase 1: `chore(setup): scaffold backend, mobile, admin workspaces`
  - After Phase 2: `feat(backend): foundational deps, prisma init, bootstrap`
  - After Phase 3: `feat(health): GET /api/v1/health with terminus + CI workflows`
  - After Phase 4: `feat(prisma): canonical 17-table schema migrated`
  - After Phase 5: `feat(guardrails): soft-delete extension, CI gate, storage, cleanup job`
  - After Phase 6: `docs(health): operating notes for external monitors`
  - After Phase 7: `chore(docs): refresh CLAUDE.md and validate quickstart`
- If a task references behavior in a later phase (e.g., the admin role guard in T037's note), do NOT implement the later behavior here — Phase 0 ships only the mechanism.
- If you hit a constitution-related decision not covered by this task list, stop and ask — Phase 0's success depends on shipping exactly the seven principles' guarantees, no more and no less.
