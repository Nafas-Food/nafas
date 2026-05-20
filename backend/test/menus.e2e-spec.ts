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
  verifiedChef,
  PHASE3_CATEGORIES,
} from './helpers/chef.fixtures';

describe('Menus (e2e) — T068', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;

  const cleanupUserIds: string[] = [];
  const cleanupChefIds: string[] = [];

  beforeAll(async () => {
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
  });

  afterEach(async () => {
    if (cleanupChefIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM menu_availability WHERE menu_id IN (SELECT id FROM menus WHERE chef_id = ANY($1::uuid[]))`,
        cleanupChefIds,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM items WHERE menu_id IN (SELECT id FROM menus WHERE chef_id = ANY($1::uuid[]))`,
        cleanupChefIds,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM menus WHERE chef_id = ANY($1::uuid[])`,
        cleanupChefIds,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM chefs WHERE id = ANY($1::uuid[])`,
        cleanupChefIds,
      );
      cleanupChefIds.length = 0;
    }
    if (cleanupUserIds.length > 1) {
      const idsToDelete = cleanupUserIds.slice(1);
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        idsToDelete,
      );
      cleanupUserIds.length = 1;
    }
  });

  afterAll(async () => {
    if (cleanupUserIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        cleanupUserIds,
      );
    }
    await app.close();
  });

  const CAT_ID = PHASE3_CATEGORIES[0].id;

  async function seedVerifiedChef() {
    const user = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(user.id);
    const chef = await verifiedChef(ctx, user, admin);
    cleanupChefIds.push(chef.chefId);
    return { user, chef };
  }

  // -----------------------------------------------------------------------
  // POST /chef/menus — happy path
  // -----------------------------------------------------------------------

  describe('POST /api/v1/chef/menus — happy path', () => {
    it('creates a menu with availableAllDays=true and returns 201 with availability array', async () => {
      const { chef } = await seedVerifiedChef();

      const res = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Lunch Special', ar: 'عرض الغداء' },
          categoryId: CAT_ID,
          availableAllDays: true,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        chefId: chef.chefId,
        categoryId: CAT_ID,
        name: { en: 'Lunch Special', ar: 'عرض الغداء' },
        availableAllDays: true,
        availability: [],
      });
      expect(typeof res.body.id).toBe('string');
    });

    it('creates a menu with initialAvailability days', async () => {
      const { chef } = await seedVerifiedChef();

      const res = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Weekend Menu', ar: 'قائمة عطلة نهاية الأسبوع' },
          categoryId: CAT_ID,
          availableAllDays: false,
          initialAvailability: [5, 6],
        })
        .expect(201);

      expect(res.body.availableAllDays).toBe(false);
      const days = res.body.availability.map((a: any) => a.dayOfWeek).sort();
      expect(days).toEqual([5, 6]);
    });
  });

  // -----------------------------------------------------------------------
  // POST /chef/menus — validation refusals
  // -----------------------------------------------------------------------

  describe('POST /api/v1/chef/menus — validation refusals', () => {
    it('refuses when Arabic name is empty → 400 MENU_NAME_REQUIRED', async () => {
      const { chef } = await seedVerifiedChef();

      const res = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Valid English', ar: '' },
          categoryId: CAT_ID,
          availableAllDays: true,
        })
        .expect(400);

      const fields = res.body.details?.fields ?? [];
      expect(
        fields.some(
          (f: string) =>
            f.includes('MENU_NAME_REQUIRED') ||
            f.includes('BILINGUAL_AR_REQUIRED'),
        ),
      ).toBe(true);
    });

    it('refuses when English name exceeds 60 chars → 400 MENU_NAME_TOO_LONG', async () => {
      const { chef } = await seedVerifiedChef();
      const longName = 'A'.repeat(61);

      const res = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: longName, ar: 'اسم صحيح' },
          categoryId: CAT_ID,
          availableAllDays: true,
        })
        .expect(400);

      const fields = res.body.details?.fields ?? [];
      expect(fields.some((f: string) => f.includes('MENU_NAME_TOO_LONG'))).toBe(
        true,
      );
    });

    it('refuses when categoryId references a soft-deleted category → 400 CATEGORY_NOT_FOUND', async () => {
      const { chef } = await seedVerifiedChef();

      // Create and then soft-delete a category
      const catRes = await (prisma as any).category.create({
        data: {
          name: { en: 'Temp', ar: 'مؤقت' },
          icon: 'x',
          displayOrder: 99,
          isActive: true,
        },
      });
      await (prisma as any).category.update({
        where: { id: catRes.id },
        data: { deletedAt: new Date() },
      });

      const res = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Test', ar: 'اختبار' },
          categoryId: catRes.id,
          availableAllDays: true,
        })
        .expect(400);

      expect(res.body.code).toBe('CATEGORY_NOT_FOUND');

      // cleanup
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM categories WHERE id = $1::uuid`,
        catRes.id,
      );
    });
  });

  // -----------------------------------------------------------------------
  // POST /chef/menus/:id/availability — idempotency
  // -----------------------------------------------------------------------

  describe('POST /chef/menus/:id/availability — idempotency', () => {
    it('adding the same dayOfWeek twice is idempotent (returns same dayOfWeek both times)', async () => {
      const { chef } = await seedVerifiedChef();

      const createRes = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Sunday Menu', ar: 'قائمة الأحد' },
          categoryId: CAT_ID,
          availableAllDays: false,
        })
        .expect(201);

      const menuId = createRes.body.id;

      // First POST
      const r1 = await request(ctx.server)
        .post(`/api/v1/chef/menus/${menuId}/availability`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({ dayOfWeek: 0 })
        .expect(201);

      expect(r1.body).toMatchObject({ dayOfWeek: 0 });

      // Second POST — idempotent
      const r2 = await request(ctx.server)
        .post(`/api/v1/chef/menus/${menuId}/availability`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({ dayOfWeek: 0 })
        .expect(201);

      expect(r2.body).toMatchObject({ dayOfWeek: 0 });

      // Only one availability row should exist for dayOfWeek=0
      const rows = await (prisma as any).menuAvailability.findMany({
        where: { menuId, dayOfWeek: 0 },
      });
      expect(rows.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /chef/menus/:id/availability/:dayOfWeek — idempotency
  // -----------------------------------------------------------------------

  describe('DELETE /chef/menus/:id/availability/:dayOfWeek — idempotency', () => {
    it('deleting a weekday that does not exist returns 204 (no error)', async () => {
      const { chef } = await seedVerifiedChef();

      const createRes = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Empty Menu', ar: 'قائمة فارغة' },
          categoryId: CAT_ID,
          availableAllDays: false,
        })
        .expect(201);

      const menuId = createRes.body.id;

      // First DELETE (never existed)
      await request(ctx.server)
        .delete(`/api/v1/chef/menus/${menuId}/availability/3`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .expect(204);

      // Second DELETE — still no error
      await request(ctx.server)
        .delete(`/api/v1/chef/menus/${menuId}/availability/3`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .expect(204);
    });

    it('deleting an existing weekday removes it, then second delete is a no-op', async () => {
      const { chef } = await seedVerifiedChef();

      const createRes = await request(ctx.server)
        .post('/api/v1/chef/menus')
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          name: { en: 'Mon Menu', ar: 'قائمة الاثنين' },
          categoryId: CAT_ID,
          availableAllDays: false,
          initialAvailability: [1],
        })
        .expect(201);

      const menuId = createRes.body.id;

      await request(ctx.server)
        .delete(`/api/v1/chef/menus/${menuId}/availability/1`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .expect(204);

      // Confirm removed
      const rows = await (prisma as any).menuAvailability.findMany({
        where: { menuId, dayOfWeek: 1 },
      });
      expect(rows.length).toBe(0);

      // Second delete — idempotent no error
      await request(ctx.server)
        .delete(`/api/v1/chef/menus/${menuId}/availability/1`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .expect(204);
    });
  });
});
