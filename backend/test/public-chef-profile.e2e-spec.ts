import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import * as todayCairo from '../src/modules/menus/today-cairo';
import {
  ChefFixtureCtx,
  seedUser,
  signedInAdmin,
  seedCategories,
  verifiedChef,
  PHASE3_CATEGORIES,
} from './helpers/chef.fixtures';

describe('Public Chef Profile (e2e) — T074', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let chefToken: string;
  let chefId: string;
  let customerId: string;
  let customerToken: string;

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

    const user = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(user.id);
    const chef = await verifiedChef(ctx, user, admin);
    chefId = chef.chefId;
    chefToken = chef.chefToken;
    cleanupChefIds.push(chefId);

    const custUser = await seedUser(prisma, ctx.sign);
    customerId = custUser.id;
    customerToken = custUser.accessToken;
    cleanupUserIds.push(customerId);

    const CAT = PHASE3_CATEGORIES[0].id;

    // Sunday-only menu (dayOfWeek=0)
    const sundayMenuRes = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Sunday Special', ar: 'خاص الأحد' },
        categoryId: CAT,
        availableAllDays: false,
        initialAvailability: [0],
      })
      .expect(201);

    const sundayMenuId = sundayMenuRes.body.id;

    // Every-day menu
    const everyDayMenuRes = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Always Available', ar: 'متاح دائماً' },
        categoryId: CAT,
        availableAllDays: true,
      })
      .expect(201);

    const everyDayMenuId = everyDayMenuRes.body.id;

    // Active item in the every-day menu
    await request(ctx.server)
      .post(`/api/v1/chef/menus/${everyDayMenuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Active Item', ar: 'عنصر نشط' },
        description: { en: 'Visible item', ar: 'عنصر مرئي' },
        price: '50.00',
        discountValue: '0',
        discountUnit: 'fixed',
        stock: { isUnlimitedStock: true },
        isActive: true,
      })
      .expect(201);

    // Inactive item in every-day menu (isActive=false)
    const inactiveItemRes = await request(ctx.server)
      .post(`/api/v1/chef/menus/${everyDayMenuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Inactive Item', ar: 'عنصر غير نشط' },
        description: { en: 'Hidden item', ar: 'عنصر مخفي' },
        price: '30.00',
        discountValue: '0',
        discountUnit: 'fixed',
        stock: { isUnlimitedStock: true },
        isActive: false,
      })
      .expect(201);

    // Soft-deleted item in every-day menu
    const deletedItemRes = await request(ctx.server)
      .post(`/api/v1/chef/menus/${everyDayMenuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Deleted Item', ar: 'عنصر محذوف' },
        description: { en: 'Soft-deleted item', ar: 'عنصر محذوف ناعم' },
        price: '20.00',
        discountValue: '0',
        discountUnit: 'fixed',
        stock: { isUnlimitedStock: true },
      })
      .expect(201);

    await request(ctx.server)
      .delete(`/api/v1/chef/items/${deletedItemRes.body.id}`)
      .set('Authorization', `Bearer ${chefToken}`)
      .expect(204);

    // Store menu IDs for use in tests
    (ctx as any).__sundayMenuId = sundayMenuId;
    (ctx as any).__everyDayMenuId = everyDayMenuId;
    (ctx as any).__inactiveItemId = inactiveItemRes.body.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
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
    }
    if (cleanupUserIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        cleanupUserIds,
      );
    }
    await app.close();
  });

  function getProfile() {
    return request(ctx.server)
      .get(`/api/v1/chefs/${chefId}`)
      .set('Authorization', `Bearer ${customerToken}`);
  }

  it('on Sunday (0): both menus visible', async () => {
    jest.spyOn(todayCairo, 'todaysCairoWeekday').mockReturnValue(0);
    const res = await getProfile().expect(200);
    const menuNames = res.body.menus.map((m: any) => m.name.en);
    expect(menuNames).toContain('Sunday Special');
    expect(menuNames).toContain('Always Available');
  });

  it('on Monday (1): only every-day menu visible, Sunday menu absent', async () => {
    jest.spyOn(todayCairo, 'todaysCairoWeekday').mockReturnValue(1);
    const res = await getProfile().expect(200);
    const menuNames = res.body.menus.map((m: any) => m.name.en);
    expect(menuNames).toContain('Always Available');
    expect(menuNames).not.toContain('Sunday Special');
  });

  it('inactive item does not appear on customer-facing profile', async () => {
    jest.spyOn(todayCairo, 'todaysCairoWeekday').mockReturnValue(1);
    const res = await getProfile().expect(200);

    const everyDayMenu = res.body.menus.find(
      (m: any) => m.name.en === 'Always Available',
    );
    expect(everyDayMenu).toBeDefined();
    const itemNames = (everyDayMenu.items ?? []).map((i: any) => i.name.en);
    expect(itemNames).not.toContain('Inactive Item');
    expect(itemNames).not.toContain('Deleted Item');
    expect(itemNames).toContain('Active Item');
  });

  it('soft-deleted chef returns 404 CHEF_NOT_FOUND', async () => {
    // Create a short-lived chef to soft-delete
    const user2 = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(user2.id);
    const chef2 = await verifiedChef(ctx, user2, admin);
    cleanupChefIds.push(chef2.chefId);

    // Admin revokes / soft-deletes the chef row directly
    await (prisma as any).chef.update({
      where: { id: chef2.chefId },
      data: { deletedAt: new Date() },
    });

    const res = await request(ctx.server)
      .get(`/api/v1/chefs/${chef2.chefId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(404);

    expect(res.body.code).toBe('CHEF_NOT_FOUND');
  });

  // -----------------------------------------------------------------------
  // SC-007e: displayOrder collision tiebreaker
  // -----------------------------------------------------------------------

  it('SC-007e: two menus with same displayOrder=0 are sorted by createdAt ASC', async () => {
    jest.spyOn(todayCairo, 'todaysCairoWeekday').mockReturnValue(1);

    const CAT = PHASE3_CATEGORIES[0].id;
    const t1 = new Date('2026-01-01T10:00:00.000Z');
    const t2 = new Date('2026-01-01T10:00:02.000Z');

    // Bypass service — insert directly with same displayOrder
    const mA = await (prisma as any).menu.create({
      data: {
        chefId,
        categoryId: CAT,
        name: { en: 'Menu A', ar: 'قائمة أ' },
        availableAllDays: true,
        displayOrder: 0,
        createdAt: t1,
      },
    });
    const mB = await (prisma as any).menu.create({
      data: {
        chefId,
        categoryId: CAT,
        name: { en: 'Menu B', ar: 'قائمة ب' },
        availableAllDays: true,
        displayOrder: 0,
        createdAt: t2,
      },
    });

    const res = await getProfile().expect(200);
    const menuNames = res.body.menus.map((m: any) => m.name.en);
    const idxA = menuNames.indexOf('Menu A');
    const idxB = menuNames.indexOf('Menu B');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB); // earlier createdAt comes first

    // cleanup
    await (prisma as any).menu.delete({ where: { id: mA.id } });
    await (prisma as any).menu.delete({ where: { id: mB.id } });
  });

  it('SC-007e: two items in same menu sharing displayOrder=0 are sorted by createdAt ASC', async () => {
    jest.spyOn(todayCairo, 'todaysCairoWeekday').mockReturnValue(1);

    const CAT = PHASE3_CATEGORIES[0].id;
    // Fresh menu so the every-day menu's existing items don't pollute the assertion
    const menuRow = await (prisma as any).menu.create({
      data: {
        chefId,
        categoryId: CAT,
        name: { en: 'Tiebreak Menu', ar: 'قائمة الفصل' },
        availableAllDays: true,
      },
    });

    const t1 = new Date('2026-01-02T09:00:00.000Z');
    const t2 = new Date('2026-01-02T09:00:02.000Z');

    const iA = await (prisma as any).item.create({
      data: {
        menuId: menuRow.id,
        name: { en: 'Item A', ar: 'عنصر أ' },
        description: { en: 'A', ar: 'أ' },
        price: '10.00',
        discountValue: '0',
        discountUnit: 'fixed',
        quantity: -1,
        isActive: true,
        displayOrder: 0,
        createdAt: t1,
      },
    });
    const iB = await (prisma as any).item.create({
      data: {
        menuId: menuRow.id,
        name: { en: 'Item B', ar: 'عنصر ب' },
        description: { en: 'B', ar: 'ب' },
        price: '10.00',
        discountValue: '0',
        discountUnit: 'fixed',
        quantity: -1,
        isActive: true,
        displayOrder: 0,
        createdAt: t2,
      },
    });

    const res = await getProfile().expect(200);
    const tieMenu = res.body.menus.find(
      (m: any) => m.name.en === 'Tiebreak Menu',
    );
    expect(tieMenu).toBeDefined();
    const itemNames = (tieMenu.items ?? []).map((i: any) => i.name.en);
    const idxA = itemNames.indexOf('Item A');
    const idxB = itemNames.indexOf('Item B');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);

    // cleanup
    await (prisma as any).item.delete({ where: { id: iA.id } });
    await (prisma as any).item.delete({ where: { id: iB.id } });
    await (prisma as any).menu.delete({ where: { id: menuRow.id } });
  });
});
