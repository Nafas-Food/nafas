import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  ChefFixtureCtx,
  seedUser,
  signedInAdmin,
  pendingApplication,
  verifiedChef,
} from './helpers/chef.fixtures';

describe('Chefs (e2e) — US1 apply + chef-self-mutation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;

  const cleanupIds: {
    users: string[];
    chefs: string[];
    notifications: string[];
  } = {
    users: [],
    chefs: [],
    notifications: [],
  };
  const trackUser = (id: string) => cleanupIds.users.push(id);
  const trackChef = (id: string) => cleanupIds.chefs.push(id);

  beforeAll(async () => {
    // The Phase 1 throttler is widened to 1M req/min in NODE_ENV=test
    // (Jest's default) via app.module.ts, so the shared-IP traffic in
    // this suite can't trip the limiter.
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    ctx = {
      server: app.getHttpServer(),
      prisma,
      sign: (userId: string, role: string) =>
        jwt.sign({ sub: userId, role, type: 'access' }, { expiresIn: 900 }),
    };
  });

  afterEach(async () => {
    if (cleanupIds.chefs.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM notifications WHERE user_id IN (SELECT user_id FROM chefs WHERE id = ANY($1::uuid[]))`,
        cleanupIds.chefs,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM menus WHERE chef_id = ANY($1::uuid[])`,
        cleanupIds.chefs,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM chefs WHERE id = ANY($1::uuid[])`,
        cleanupIds.chefs,
      );
      cleanupIds.chefs = [];
    }
    if (cleanupIds.users.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        cleanupIds.users,
      );
      cleanupIds.users = [];
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // POST /chef/apply
  // -------------------------------------------------------------------------

  describe('POST /api/v1/chef/apply', () => {
    it('happy path: returns 201, Chef row is pending, log has no lat/lng', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);

      const res = await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'Umm Nadia Kitchen',
          bio: 'Home-cooked Egyptian food',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 75,
        })
        .expect(201);

      trackChef(res.body.id);

      expect(res.body.id).toBeTruthy();
      expect(res.body.isVerified).toBe(false);
      expect(res.body).not.toHaveProperty('latitude');
      expect(res.body).not.toHaveProperty('longitude');

      const chef = await (prisma as any).chef.findUnique({
        where: { id: res.body.id },
      });
      expect(chef.isVerified).toBe(false);
      expect(chef.rejectedAt).toBeNull();
      expect(chef.deletedAt).toBeNull();
    });

    it('400 VALIDATION_ERROR for missing chefName', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const res = await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          bio: 'ok',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 50,
        })
        .expect(400);
      expect(res.body.code ?? res.body.error).toMatch(
        /VALIDATION_ERROR|Bad Request/i,
      );
    });

    it('400 VALIDATION_ERROR for missing bio', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 50,
        })
        .expect(400);
    });

    it('400 VALIDATION_ERROR for missing latitude', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          longitude: 31.2357,
          minOrderPrice: 50,
        })
        .expect(400);
    });

    it('400 VALIDATION_ERROR for missing longitude', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ chefName: 'K', bio: 'b', latitude: 30.0444, minOrderPrice: 50 })
        .expect(400);
    });

    it('400 VALIDATION_ERROR for missing minOrderPrice', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          latitude: 30.0444,
          longitude: 31.2357,
        })
        .expect(400);
    });

    it('400 VALIDATION_ERROR for non-positive minOrderPrice', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 0,
        })
        .expect(400);
    });

    it('400 VALIDATION_ERROR for extra undocumented field (SC-018)', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 50,
          userId: 'injected',
        })
        .expect(400);
    });

    it('409 APPLICATION_PENDING when re-submitted while pending', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      const res = await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 50,
        })
        .expect(409);
      expect(res.body.code).toBe('APPLICATION_PENDING');
    });

    it('409 ALREADY_CHEF when caller is already verified', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);
      await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      // Re-apply as a chef role — must re-sign as customer to hit POST /chef/apply
      const customerToken = ctx.sign(user.id, 'customer');
      const res = await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 50,
        })
        .expect(409);
      expect(res.body.code).toBe('ALREADY_CHEF');
    });

    it('409 APPLICATION_COOLDOWN_IN_EFFECT within 24 h of rejection', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);
      await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/reject`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'not ready' })
        .expect(200);

      // Backdate rejectedAt to 1 h ago (still within 24 h cooldown)
      await (prisma as any).chef.update({
        where: { id: chefId },
        data: { rejectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000) },
      });

      const res = await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'K',
          bio: 'b',
          latitude: 30.0444,
          longitude: 31.2357,
          minOrderPrice: 50,
        })
        .expect(409);
      expect(res.body.code).toBe('APPLICATION_COOLDOWN_IN_EFFECT');
      expect(res.body.earliestResubmitAt).toBeTruthy();
    });

    it('re-apply succeeds after cooldown elapses; Chef row is updated in place', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);
      await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/reject`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'not ready' })
        .expect(200);

      // Backdate rejectedAt to 25 h ago (cooldown has elapsed)
      await (prisma as any).chef.update({
        where: { id: chefId },
        data: { rejectedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });

      const res = await request(ctx.server)
        .post('/api/v1/chef/apply')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          chefName: 'Fresh Start Kitchen',
          bio: 'better now',
          latitude: 30.05,
          longitude: 31.24,
          minOrderPrice: 60,
        })
        .expect(201);

      expect(res.body.id).toBe(chefId); // same Chef row, updated in place
      const chef = await (prisma as any).chef.findUnique({
        where: { id: chefId },
      });
      expect(chef.rejectedAt).toBeNull();
      expect(chef.deletedAt).toBeNull();
      expect(chef.isVerified).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /chef/profile — FR-024 ownership (path-less endpoint)
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/chef/profile — ownership (FR-024 / SC-012)', () => {
    it('updates chef-A profile and chef-B row is unchanged', async () => {
      const userA = await seedUser(prisma, ctx.sign);
      trackUser(userA.id);
      const userB = await seedUser(prisma, ctx.sign);
      trackUser(userB.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const chefA = await verifiedChef(ctx, userA, admin);
      trackChef(chefA.chefId);
      const chefB = await verifiedChef(ctx, userB, admin);
      trackChef(chefB.chefId);

      const beforeB = await (prisma as any).chef.findUnique({
        where: { id: chefB.chefId },
      });

      const res = await request(ctx.server)
        .patch('/api/v1/chef/profile')
        .set('Authorization', `Bearer ${chefA.chefToken}`)
        .send({ chefName: 'Chef-A Updated' })
        .expect(200);

      expect(res.body.chefName).toBe('Chef-A Updated');

      const afterB = await (prisma as any).chef.findUnique({
        where: { id: chefB.chefId },
      });
      expect(afterB.chefName).toBe(beforeB.chefName); // chef-B row is untouched
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /chef/profile target enumeration guard (FR-024)
  // -------------------------------------------------------------------------

  describe('DELETE /chef/profile target enumeration guard (FR-024)', () => {
    it('no @Param("id") on any @Roles("chef") handler in chefs.controller.ts', () => {
      const controllerPath = path.resolve(
        __dirname,
        '../src/modules/chefs/chefs.controller.ts',
      );
      const source = fs.readFileSync(controllerPath, 'utf-8');

      // Find all chef-role handler blocks and assert none take an id param
      const chefHandlerBlocks = source.match(/@Roles\('chef'\)[^@]*/gs) ?? [];
      for (const block of chefHandlerBlocks) {
        expect(block).not.toContain("@Param('id')");
      }
    });
  });
});
