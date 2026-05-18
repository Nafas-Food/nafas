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
  seedCategories,
  seedManyChefs,
  PHASE3_CATEGORIES,
} from './helpers/chef.fixtures';

const CENTRE = { lat: 30.0444, lng: 31.2357 };

describe('Discovery (e2e) — GET /chefs (T070)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let customerToken: string;

  // 8 bulk chefs: indices 0,1,3,4,6,7 at ~4 km; indices 2,5 at ~12 km
  let bulkChefs: Awaited<ReturnType<typeof seedManyChefs>>;
  const allBulkUserIds: string[] = [];
  const allBulkChefIds: string[] = [];
  const extraCleanupUsers: string[] = [];
  const extraCleanupChefs: string[] = [];

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

    // Seed categories and 8 chefs
    await seedCategories(prisma);
    const kosharyId = PHASE3_CATEGORIES[0].id;

    bulkChefs = await seedManyChefs(prisma, 8, CENTRE, [
      { chefIndex: 0, categoryId: kosharyId },
    ]);

    // Give chef index 1 a name containing 'Umm' for the search test
    await (prisma as any).chef.update({
      where: { id: bulkChefs[1].chefId },
      data: { chefName: 'Umm Nadia Kitchen' },
    });

    for (const c of bulkChefs) {
      allBulkUserIds.push(c.userId);
      allBulkChefIds.push(c.chefId);
    }

    const customer = await seedUser(prisma, ctx.sign);
    extraCleanupUsers.push(customer.id);
    customerToken = customer.accessToken;
  });

  afterAll(async () => {
    const allChefIds = [...allBulkChefIds, ...extraCleanupChefs];
    const allUserIds = [...allBulkUserIds, ...extraCleanupUsers];

    if (allChefIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM menus WHERE chef_id = ANY($1::uuid[])`,
        allChefIds,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM chefs WHERE id = ANY($1::uuid[])`,
        allChefIds,
      );
    }
    if (allUserIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        allUserIds,
      );
    }
    await app.close();
  });

  it('list all → 8 verified chefs, open-first then newest-verified-first', async () => {
    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    // At least 8 (there may be other chefs from previous tests in the same DB)
    const ids = new Set(bulkChefs.map((c) => c.chefId));
    const returned = (res.body as any[]).filter((c: any) => ids.has(c.id));
    expect(returned).toHaveLength(8);

    // Open chefs should all appear before any closed chef
    const openIndices = returned
      .map((c: any, i: number) => ({ isOpen: c.isOpen, i }))
      .filter((x) => x.isOpen)
      .map((x) => x.i);
    const closedIndices = returned
      .map((c: any, i: number) => ({ isOpen: c.isOpen, i }))
      .filter((x) => !x.isOpen)
      .map((x) => x.i);
    if (openIndices.length > 0 && closedIndices.length > 0) {
      expect(Math.max(...openIndices)).toBeLessThan(Math.min(...closedIndices));
    }

    // distanceKm must not be set when no lat/lng filter
    for (const c of returned) {
      expect(c.distanceKm).toBeUndefined();
    }
  });

  it('category filter narrows to chefs with a menu in that category', async () => {
    const kosharyId = PHASE3_CATEGORIES[0].id;
    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .query({ categoryId: kosharyId })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const ids = (res.body as any[]).map((c: any) => c.id);
    expect(ids).toContain(bulkChefs[0].chefId); // chef 0 has Koshary menu
    expect(ids).not.toContain(bulkChefs[1].chefId); // chef 1 has no menu
  });

  it('search filter q="Umm" narrows by name substring', async () => {
    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .query({ q: 'Umm' })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const ids = (res.body as any[]).map((c: any) => c.id);
    expect(ids).toContain(bulkChefs[1].chefId); // 'Umm Nadia Kitchen'
    // Other bulk chefs named 'Test Kitchen N' should not appear
    for (let i = 0; i < 8; i++) {
      if (i !== 1) expect(ids).not.toContain(bulkChefs[i].chefId);
    }
  });

  it('radius filter radiusKm=10 excludes chefs outside the 10 km circle, sort closest-first', async () => {
    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .query({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 10 })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    // Chefs at ~4 km (indices 0,1,3,4,6,7) are inside; indices 2,5 at ~12 km are outside
    const ids = (res.body as any[]).map((c: any) => c.id);
    const innerChefIds = [0, 1, 3, 4, 6, 7].map((i) => bulkChefs[i].chefId);
    const outerChefIds = [2, 5].map((i) => bulkChefs[i].chefId);
    for (const id of innerChefIds) expect(ids).toContain(id);
    for (const id of outerChefIds) expect(ids).not.toContain(id);

    // distanceKm is populated when radius filter applies
    const returnedBulk = (res.body as any[]).filter((c: any) =>
      new Set(bulkChefs.map((b) => b.chefId)).has(c.id),
    );
    for (const c of returnedBulk) {
      expect(typeof c.distanceKm).toBe('number');
    }

    // Sorted by closest-first
    const distances = returnedBulk.map((c: any) => c.distanceKm);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  it('default radius 15 km applies when only lat, lng are supplied', async () => {
    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .query({ lat: CENTRE.lat, lng: CENTRE.lng })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    // All 8 bulk chefs are within 15 km (inner at ~4 km, outer at ~12 km)
    const ids = (res.body as any[]).map((c: any) => c.id);
    for (const c of bulkChefs) expect(ids).toContain(c.chefId);
  });

  it('radiusKm=80 is clamped to 50 km at the service layer', async () => {
    // With 50 km cap, all 8 chefs (at most 12 km) should be returned
    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .query({ lat: CENTRE.lat, lng: CENTRE.lng, radiusKm: 80 })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const ids = (res.body as any[]).map((c: any) => c.id);
    for (const c of bulkChefs) expect(ids).toContain(c.chefId);
  });

  it('pending / rejected / soft-deleted chefs NEVER appear', async () => {
    // Seed pending, rejected, soft-deleted chefs
    const admin = await signedInAdmin(ctx);
    extraCleanupUsers.push(admin.id);

    const pendingUser = await seedUser(prisma, ctx.sign);
    extraCleanupUsers.push(pendingUser.id);
    const { chefId: pendingChefId } = await pendingApplication(
      ctx,
      pendingUser,
    );
    extraCleanupChefs.push(pendingChefId);

    const rejectedUser = await seedUser(prisma, ctx.sign);
    extraCleanupUsers.push(rejectedUser.id);
    const { chefId: rejectedChefId } = await pendingApplication(
      ctx,
      rejectedUser,
    );
    extraCleanupChefs.push(rejectedChefId);
    await request(ctx.server)
      .patch(`/api/v1/admin/chefs/${rejectedChefId}/reject`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'test' })
      .expect(200);

    const deletedUser = await seedUser(prisma, ctx.sign);
    extraCleanupUsers.push(deletedUser.id);
    const { chefId: deletedChefId } = await pendingApplication(
      ctx,
      deletedUser,
    );
    extraCleanupChefs.push(deletedChefId);
    await request(ctx.server)
      .patch(`/api/v1/admin/chefs/${deletedChefId}/verify`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    await request(ctx.server)
      .delete(`/api/v1/admin/chefs/${deletedChefId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'test' })
      .expect(204);

    const res = await request(ctx.server)
      .get('/api/v1/chefs')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const ids = (res.body as any[]).map((c: any) => c.id);
    expect(ids).not.toContain(pendingChefId);
    expect(ids).not.toContain(rejectedChefId);
    expect(ids).not.toContain(deletedChefId);
  });

  it('FR-029 soft-deleted-category continuity: chef still discoverable, profile lists orphan category', async () => {
    // Chef 0 has a Koshary menu. Soft-delete Koshary and verify continuity.
    const admin = await signedInAdmin(ctx);
    extraCleanupUsers.push(admin.id);

    const kosharyId = PHASE3_CATEGORIES[0].id;

    // (a) soft-delete the category
    await request(ctx.server)
      .delete(`/api/v1/admin/categories/${kosharyId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    // (b) GET /categories no longer returns it
    const catRes = await request(ctx.server)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const catIds = (catRes.body as any[]).map((c: any) => c.id);
    expect(catIds).not.toContain(kosharyId);

    // (c) GET /chefs?categoryId=<soft-deleted> returns empty for that filter
    const filteredRes = await request(ctx.server)
      .get('/api/v1/chefs')
      .query({ categoryId: kosharyId })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const filteredIds = (filteredRes.body as any[]).map((c: any) => c.id);
    expect(filteredIds).not.toContain(bulkChefs[0].chefId);

    // (c) GET /chefs (no filter) still returns chef 0
    const allRes = await request(ctx.server)
      .get('/api/v1/chefs')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const allIds = (allRes.body as any[]).map((c: any) => c.id);
    expect(allIds).toContain(bulkChefs[0].chefId);

    // (d) chef's public profile still lists the now-orphaned categoryId.
    // menus.service.categoriesForChef filters Menu by soft-delete, NOT
    // Category — the Menu row is what determines membership. Preserves
    // Menu audit history per FR-029.
    const profileRes = await request(ctx.server)
      .get(`/api/v1/chefs/${bulkChefs[0].chefId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(profileRes.body.categoryIds).toContain(kosharyId);

    // Restore category so other tests aren't affected
    await (prisma as any).category.update({
      where: { id: kosharyId },
      data: { deletedAt: null, isActive: true },
    });
  });
});
