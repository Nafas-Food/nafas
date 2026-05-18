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
  seedCategories,
  PHASE3_CATEGORIES,
} from './helpers/chef.fixtures';

describe('Categories (e2e) — T071', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let customer: Awaited<ReturnType<typeof seedUser>>;

  const createdCategoryIds: string[] = [];
  const cleanupUserIds: string[] = [];

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

    await seedCategories(prisma);

    admin = await signedInAdmin(ctx);
    cleanupUserIds.push(admin.id);

    customer = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(customer.id);
  });

  afterAll(async () => {
    // Soft-delete any categories created during the test
    if (createdCategoryIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM categories WHERE id = ANY($1::uuid[])`,
        createdCategoryIds,
      );
    }
    // Restore seeded categories to clean state
    await seedCategories(prisma);

    if (cleanupUserIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        cleanupUserIds,
      );
    }
    await app.close();
  });

  // -------------------------------------------------------------------------
  // GET /categories
  // -------------------------------------------------------------------------

  describe('GET /api/v1/categories', () => {
    it('returns the 8 seeded categories with name.en and name.ar, ordered by displayOrder', async () => {
      const res = await request(ctx.server)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(200);

      const categories = res.body as any[];
      const seededIds = new Set(PHASE3_CATEGORIES.map((c) => c.id));
      const returned = categories.filter((c: any) => seededIds.has(c.id));
      expect(returned).toHaveLength(8);

      for (const cat of returned) {
        expect(cat.name).toBeDefined();
        const name = cat.name as { en: string; ar: string };
        expect(typeof name.en).toBe('string');
        expect(typeof name.ar).toBe('string');
      }

      const orders = returned.map((c: any) => c.displayOrder);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    });
  });

  // -------------------------------------------------------------------------
  // POST /admin/categories
  // -------------------------------------------------------------------------

  describe('POST /api/v1/admin/categories', () => {
    it('creates a category; subsequent GET /categories includes it', async () => {
      const res = await request(ctx.server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: { en: 'Stuffed Pigeon', ar: 'حمام محشي' },
          icon: 'star',
          displayOrder: 99,
        })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      createdCategoryIds.push(res.body.id);

      const listRes = await request(ctx.server)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(200);

      const ids = (listRes.body as any[]).map((c: any) => c.id);
      expect(ids).toContain(res.body.id);
    });

    it('403 FORBIDDEN_ROLE for non-admin caller', async () => {
      await request(ctx.server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ name: { en: 'X', ar: 'X' }, displayOrder: 100 })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /admin/categories/:id
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/admin/categories/:id', () => {
    it('updates name.en of an existing category', async () => {
      const categoryId = PHASE3_CATEGORIES[6].id; // Fattah

      const res = await request(ctx.server)
        .patch(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: { en: 'Fattah (updated)' } })
        .expect(200);

      const name = res.body.name as { en: string; ar: string };
      expect(name.en).toBe('Fattah (updated)');

      // Restore original name
      await request(ctx.server)
        .patch(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: { en: 'Fattah' } });
    });

    it('403 FORBIDDEN_ROLE for non-admin caller', async () => {
      const categoryId = PHASE3_CATEGORIES[0].id;
      await request(ctx.server)
        .patch(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ name: { en: 'Hacked' } })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /admin/categories/:id
  // -------------------------------------------------------------------------

  describe('DELETE /api/v1/admin/categories/:id', () => {
    it('soft-deletes; subsequent GET /categories excludes it', async () => {
      // Create a transient category to delete
      const createRes = await request(ctx.server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: { en: 'Temp Cat', ar: 'فئة مؤقتة' }, displayOrder: 98 })
        .expect(201);
      const tempId = createRes.body.id;
      createdCategoryIds.push(tempId);

      await request(ctx.server)
        .delete(`/api/v1/admin/categories/${tempId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(204);

      const listRes = await request(ctx.server)
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(200);

      const ids = (listRes.body as any[]).map((c: any) => c.id);
      expect(ids).not.toContain(tempId);
    });

    it('403 FORBIDDEN_ROLE for non-admin caller', async () => {
      const categoryId = PHASE3_CATEGORIES[0].id;
      await request(ctx.server)
        .delete(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /admin/categories/reorder
  // -------------------------------------------------------------------------

  describe('PATCH /api/v1/admin/categories/reorder', () => {
    it('updates displayOrder of referenced rows atomically', async () => {
      const [c0, c1] = PHASE3_CATEGORIES;
      const newOrder = [
        { id: c0.id, displayOrder: 50 },
        { id: c1.id, displayOrder: 51 },
      ];

      await request(ctx.server)
        .patch('/api/v1/admin/categories/reorder')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ items: newOrder })
        .expect(200);

      const row0 = await (prisma as any).category.findUnique({
        where: { id: c0.id },
      });
      const row1 = await (prisma as any).category.findUnique({
        where: { id: c1.id },
      });
      expect(row0.displayOrder).toBe(50);
      expect(row1.displayOrder).toBe(51);

      // Restore original orders
      await request(ctx.server)
        .patch('/api/v1/admin/categories/reorder')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          items: [
            { id: c0.id, displayOrder: c0.displayOrder },
            { id: c1.id, displayOrder: c1.displayOrder },
          ],
        });
    });

    it('atomic reorder: unknown UUID causes full rollback (no displayOrder changes committed)', async () => {
      const c0 = PHASE3_CATEGORIES[0];
      const before = await (prisma as any).category.findUnique({
        where: { id: c0.id },
      });
      const originalOrder: number = before.displayOrder;

      const unknownUuid = '00000000-0000-4000-8000-000000000999';
      // Pass one valid and one unknown UUID — Prisma P2025 should roll back
      const res = await request(ctx.server)
        .patch('/api/v1/admin/categories/reorder')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          items: [
            { id: c0.id, displayOrder: 77 },
            { id: unknownUuid, displayOrder: 78 },
          ],
        });

      // Expect non-200 (transaction aborted)
      expect(res.status).not.toBe(200);

      // c0's displayOrder should be unchanged (transaction rolled back)
      const after = await (prisma as any).category.findUnique({
        where: { id: c0.id },
      });
      expect(after.displayOrder).toBe(originalOrder);
    });

    it('403 FORBIDDEN_ROLE for non-admin caller', async () => {
      await request(ctx.server)
        .patch('/api/v1/admin/categories/reorder')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ items: [{ id: PHASE3_CATEGORIES[0].id, displayOrder: 0 }] })
        .expect(403);
    });
  });
});
