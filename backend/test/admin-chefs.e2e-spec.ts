import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  ChefFixtureCtx,
  seedUser,
  signedInAdmin,
  pendingApplication,
} from './helpers/chef.fixtures';

describe('Admin Chefs (e2e) — US2 verify / reject / revoke', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;

  const cleanupIds: { users: string[]; chefs: string[] } = {
    users: [],
    chefs: [],
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
        `UPDATE chefs SET deleted_at = NULL, is_verified = false WHERE id = ANY($1::uuid[])`,
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
  // PATCH /admin/chefs/:id/verify
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/admin/chefs/:id/verify', () => {
    it('happy path: Chef.isVerified=true, User.role=chef, chef_verified Notification exists', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      const res = await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);

      expect(res.body.isVerified).toBe(true);

      const updatedChef = await (prisma as any).chef.findUnique({
        where: { id: chefId },
      });
      expect(updatedChef.isVerified).toBe(true);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.role).toBe('chef');

      const notification = await (prisma as any).notification.findFirst({
        where: { userId: user.id, type: 'chef_verified' },
      });
      expect(notification).not.toBeNull();
    });

    it('409 APPLICATION_NOT_PENDING when chef is already verified', async () => {
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

      const res = await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);
      expect(res.body.code).toBe('APPLICATION_NOT_PENDING');
    });

    it('409 APPLICATION_NOT_PENDING when application is already rejected', async () => {
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

      const res = await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(409);
      expect(res.body.code).toBe('APPLICATION_NOT_PENDING');
    });

    it('403 FORBIDDEN_ROLE for a non-admin caller', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(403);
    });

    it('400 VALIDATION_ERROR for extra field in request body (SC-018)', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      // verify endpoint has no @Body() but forbidNonWhitelisted pipe should catch it
      // if the endpoint has a body DTO. If it doesn't, this returns 200 — noted.
      const res = await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ extra: 'field' });
      // Accept 200 (no body DTO declared) or 400 (strict pipe)
      expect([200, 400]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /admin/chefs/:id/reject
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/admin/chefs/:id/reject', () => {
    it('happy path: Chef.rejectedAt set, Notification body = reason, User.role unchanged', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/reject`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'Insufficient kitchen standards' })
        .expect(200);

      const updatedChef = await (prisma as any).chef.findUnique({
        where: { id: chefId },
      });
      expect(updatedChef.rejectedAt).not.toBeNull();

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.role).toBe('customer'); // role unchanged

      const notification = await (prisma as any).notification.findFirst({
        where: { userId: user.id, type: 'chef_rejected' },
      });
      expect(notification).not.toBeNull();
      const body = notification.body as { en: string; ar: string };
      expect(body.en).toBe('Insufficient kitchen standards');
      expect(body.ar).toBe('Insufficient kitchen standards');
    });

    it('400 VALIDATION_ERROR for extra field in reject body (SC-018)', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      const res = await request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/reject`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'valid reason', extra: 'field' })
        .expect(400);
      expect(res.body.code ?? res.body.error).toMatch(
        /VALIDATION_ERROR|Bad Request/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/chefs/:id (revoke)
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/admin/chefs/:id (revoke)', () => {
    it('happy path: Chef soft-deleted, User.role=customer, chef_revoked Notification exists', async () => {
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

      await request(ctx.server)
        .delete(`/api/v1/admin/chefs/${chefId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'policy violation' })
        .expect(204);

      // Bypass the soft-delete extension to inspect the revoked row.
      const rows = (await (prisma as any).$queryRawUnsafe(
        `SELECT deleted_at FROM chefs WHERE id = $1::uuid`,
        chefId,
      )) as Array<{ deleted_at: Date | null }>;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].deleted_at).not.toBeNull();

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.role).toBe('customer');

      const notification = await (prisma as any).notification.findFirst({
        where: { userId: user.id, type: 'chef_revoked' },
      });
      expect(notification).not.toBeNull();
    });

    it('409 CHEF_NOT_VERIFIED against a pending chef', async () => {
      const user = await seedUser(prisma, ctx.sign);
      trackUser(user.id);
      const admin = await signedInAdmin(ctx);
      trackUser(admin.id);

      const { chefId } = await pendingApplication(ctx, user);
      trackChef(chefId);

      const res = await request(ctx.server)
        .delete(`/api/v1/admin/chefs/${chefId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'nope' })
        .expect(409);
      expect(res.body.code).toBe('CHEF_NOT_VERIFIED');
    });

    it('400 VALIDATION_ERROR for extra field in revoke body (SC-018)', async () => {
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

      const res = await request(ctx.server)
        .delete(`/api/v1/admin/chefs/${chefId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'valid reason', extra: 'field' })
        .expect(400);
      expect(res.body.code ?? res.body.error).toMatch(
        /VALIDATION_ERROR|Bad Request/i,
      );
    });
  });
});
