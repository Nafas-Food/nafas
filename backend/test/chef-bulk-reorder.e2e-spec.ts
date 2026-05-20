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

describe('Chef Bulk Reorder (e2e) — T075 (SC-007d)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let chefToken: string;
  let chefId: string;

  const cleanupUserIds: string[] = [];
  const cleanupChefIds: string[] = [];

  let menu1Id: string;
  let menu2Id: string;
  let menu3Id: string;

  let itemMenuId: string;
  let item1Id: string;
  let item2Id: string;
  let item3Id: string;

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

    const CAT = PHASE3_CATEGORIES[0].id;

    // Create 3 menus
    const m1 = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Menu 1', ar: 'قائمة 1' },
        categoryId: CAT,
        availableAllDays: true,
      })
      .expect(201);
    menu1Id = m1.body.id;

    const m2 = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Menu 2', ar: 'قائمة 2' },
        categoryId: CAT,
        availableAllDays: true,
      })
      .expect(201);
    menu2Id = m2.body.id;

    const m3 = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Menu 3', ar: 'قائمة 3' },
        categoryId: CAT,
        availableAllDays: true,
      })
      .expect(201);
    menu3Id = m3.body.id;

    // Create a 4th menu that holds items for item reorder tests
    const im = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Item Menu', ar: 'قائمة العناصر' },
        categoryId: CAT,
        availableAllDays: true,
      })
      .expect(201);
    itemMenuId = im.body.id;

    const baseItem = {
      description: { en: 'Desc', ar: 'وصف' },
      price: '20.00',
      discountValue: '0',
      discountUnit: 'fixed',
      stock: { isUnlimitedStock: true },
    };

    const i1 = await request(ctx.server)
      .post(`/api/v1/chef/menus/${itemMenuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ ...baseItem, name: { en: 'Item 1', ar: 'عنصر 1' } })
      .expect(201);
    item1Id = i1.body.id;

    const i2 = await request(ctx.server)
      .post(`/api/v1/chef/menus/${itemMenuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ ...baseItem, name: { en: 'Item 2', ar: 'عنصر 2' } })
      .expect(201);
    item2Id = i2.body.id;

    const i3 = await request(ctx.server)
      .post(`/api/v1/chef/menus/${itemMenuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ ...baseItem, name: { en: 'Item 3', ar: 'عنصر 3' } })
      .expect(201);
    item3Id = i3.body.id;
  });

  afterAll(async () => {
    if (cleanupChefIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM items WHERE menu_id IN (SELECT id FROM menus WHERE chef_id = ANY($1::uuid[]))`,
        cleanupChefIds,
      );
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM menu_availability WHERE menu_id IN (SELECT id FROM menus WHERE chef_id = ANY($1::uuid[]))`,
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

  // -----------------------------------------------------------------------
  // Menu reorder happy path
  // -----------------------------------------------------------------------

  it('PATCH /chef/menus/reorder with full ordered list → 204 and displayOrder is 0,1,2,3', async () => {
    await request(ctx.server)
      .patch('/api/v1/chef/menus/reorder')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ menuIds: [menu3Id, menu1Id, menu2Id, itemMenuId] }) // exact-cover, reordered
      .expect(204);

    const rows = await (prisma as any).menu.findMany({
      where: { id: { in: [menu1Id, menu2Id, menu3Id, itemMenuId] } },
      select: { id: true, displayOrder: true },
    });
    const byId = Object.fromEntries(
      rows.map((r: any) => [r.id, r.displayOrder]),
    );
    expect(byId[menu3Id]).toBe(0);
    expect(byId[menu1Id]).toBe(1);
    expect(byId[menu2Id]).toBe(2);
    expect(byId[itemMenuId]).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Menu reorder refusals
  // -----------------------------------------------------------------------

  it('PATCH /chef/menus/reorder with one ID omitted → 400 MENUS_REORDER_NOT_EXACT_SET', async () => {
    const res = await request(ctx.server)
      .patch('/api/v1/chef/menus/reorder')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ menuIds: [menu1Id, menu2Id] }) // missing menu3Id (and itemMenuId)
      .expect(400);

    expect(res.body.code).toBe('MENUS_REORDER_NOT_EXACT_SET');
  });

  it('PATCH /chef/menus/reorder with an unknown UUID → 400 MENUS_REORDER_NOT_EXACT_SET', async () => {
    const res = await request(ctx.server)
      .patch('/api/v1/chef/menus/reorder')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        menuIds: [
          menu1Id,
          menu2Id,
          menu3Id,
          '00000000-0000-4000-8000-999999999999',
          itemMenuId,
        ],
      })
      .expect(400);

    expect(res.body.code).toBe('MENUS_REORDER_NOT_EXACT_SET');
  });

  it('PATCH /chef/menus/reorder with a duplicate UUID → 400 MENUS_REORDER_NOT_EXACT_SET', async () => {
    const res = await request(ctx.server)
      .patch('/api/v1/chef/menus/reorder')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ menuIds: [menu1Id, menu2Id, menu3Id, menu1Id, itemMenuId] })
      .expect(400);

    expect(res.body.code).toBe('MENUS_REORDER_NOT_EXACT_SET');
  });

  // -----------------------------------------------------------------------
  // Item reorder happy path
  // -----------------------------------------------------------------------

  it('PATCH /chef/menus/:menuId/items/reorder → 204 and displayOrder is 0,1,2', async () => {
    await request(ctx.server)
      .patch(`/api/v1/chef/menus/${itemMenuId}/items/reorder`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ itemIds: [item3Id, item2Id, item1Id] })
      .expect(204);

    const rows = await (prisma as any).item.findMany({
      where: { id: { in: [item1Id, item2Id, item3Id] } },
      select: { id: true, displayOrder: true },
    });
    const byId = Object.fromEntries(
      rows.map((r: any) => [r.id, r.displayOrder]),
    );
    expect(byId[item3Id]).toBe(0);
    expect(byId[item2Id]).toBe(1);
    expect(byId[item1Id]).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Item reorder refusals
  // -----------------------------------------------------------------------

  it('PATCH .../items/reorder with one item ID omitted → 400 ITEMS_REORDER_NOT_EXACT_SET', async () => {
    const res = await request(ctx.server)
      .patch(`/api/v1/chef/menus/${itemMenuId}/items/reorder`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ itemIds: [item1Id, item2Id] })
      .expect(400);

    expect(res.body.code).toBe('ITEMS_REORDER_NOT_EXACT_SET');
  });

  it('PATCH .../items/reorder with an unknown UUID → 400 ITEMS_REORDER_NOT_EXACT_SET', async () => {
    const res = await request(ctx.server)
      .patch(`/api/v1/chef/menus/${itemMenuId}/items/reorder`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        itemIds: [item1Id, item2Id, '00000000-0000-4000-8000-999999999888'],
      })
      .expect(400);

    expect(res.body.code).toBe('ITEMS_REORDER_NOT_EXACT_SET');
  });

  it('PATCH .../items/reorder with duplicate UUID → 400 (DTO @ArrayUnique guard)', async () => {
    const res = await request(ctx.server)
      .patch(`/api/v1/chef/menus/${itemMenuId}/items/reorder`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send({ itemIds: [item1Id, item2Id, item1Id] })
      .expect(400);

    expect(res.status).toBe(400);
  });
});
