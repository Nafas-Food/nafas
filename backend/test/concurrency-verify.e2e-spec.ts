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

/**
 * T069 — Concurrent-verify race test.
 *
 * Issues two PATCH /admin/chefs/:id/verify requests in parallel and asserts
 * that exactly one succeeds (200) and the other is rejected (409). This
 * documents the expected behaviour under concurrent load.
 *
 * If the test fails (both return 200), the service needs pessimistic row-level
 * locking (`SELECT ... FOR UPDATE`) inside the $transaction.
 */
describe('Admin Chefs concurrency (e2e) — T069', () => {
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
    // (Jest's default) via app.module.ts, so the two parallel verify
    // requests aren't refused by the rate limiter — only the
    // APPLICATION_NOT_PENDING conflict path is under test here.
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

  it('exactly one verify wins; DB state is consistent (isVerified=true, one notification)', async () => {
    const user = await seedUser(prisma, ctx.sign);
    trackUser(user.id);
    const admin = await signedInAdmin(ctx);
    trackUser(admin.id);

    const { chefId } = await pendingApplication(ctx, user);
    trackChef(chefId);

    const [res1, res2] = await Promise.all([
      request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`),
      request(ctx.server)
        .patch(`/api/v1/admin/chefs/${chefId}/verify`)
        .set('Authorization', `Bearer ${admin.accessToken}`),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 200 and one 409 — documents the required concurrent behaviour.
    // If both return 200, the service needs SELECT FOR UPDATE locking.
    expect(statuses).toEqual([200, 409]);

    const winner = res1.status === 200 ? res1 : res2;
    const loser = res1.status === 409 ? res1 : res2;
    expect(winner.body.isVerified).toBe(true);
    expect(loser.body.code).toBe('APPLICATION_NOT_PENDING');

    // DB assertions — must be true regardless of race outcome
    const finalChef = await (prisma as any).chef.findUnique({
      where: { id: chefId },
    });
    expect(finalChef.isVerified).toBe(true);

    const finalUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(finalUser?.role).toBe('chef');

    const notifications = await (prisma as any).notification.findMany({
      where: { userId: user.id, type: 'chef_verified' },
    });
    expect(notifications).toHaveLength(1);
  });
});
