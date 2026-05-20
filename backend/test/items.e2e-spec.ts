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

describe('Items (e2e) — T070', () => {
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

  async function seedChefWithMenu() {
    const user = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(user.id);
    const chef = await verifiedChef(ctx, user, admin);
    cleanupChefIds.push(chef.chefId);

    const menuRes = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send({
        name: { en: 'Menu', ar: 'قائمة' },
        categoryId: PHASE3_CATEGORIES[0].id,
        availableAllDays: true,
      })
      .expect(201);

    return { chef, menuId: menuRes.body.id as string };
  }

  function validItem(overrides: Record<string, unknown> = {}) {
    return {
      name: { en: 'Koshary', ar: 'كشري' },
      description: { en: 'Delicious Egyptian dish', ar: 'طبق مصري لذيذ' },
      price: '45.00',
      discountValue: '0',
      discountUnit: 'fixed',
      stock: { isUnlimitedStock: true },
      ...overrides,
    };
  }

  // -----------------------------------------------------------------------
  // Create happy path
  // -----------------------------------------------------------------------

  it('happy path: POST creates item, response has price + effectivePrice as strings, inStock=true', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem())
      .expect(201);

    expect(typeof res.body.id).toBe('string');
    expect(res.body.price).toBe('45.00');
    expect(res.body.effectivePrice).toBe('45.00');
    expect(res.body.inStock).toBe(true);
    expect(res.body.images).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Validation refusals
  // -----------------------------------------------------------------------

  it('refuses empty description → 400 ITEM_DESCRIPTION_REQUIRED', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem({ description: { en: '', ar: 'وصف' } }))
      .expect(400);

    const fields = res.body.details?.fields ?? [];
    expect(
      fields.some(
        (f: string) =>
          f.includes('ITEM_DESCRIPTION_REQUIRED') ||
          f.includes('BILINGUAL_EN_REQUIRED'),
      ),
    ).toBe(true);
  });

  it('refuses 501-char English description → 400 ITEM_DESCRIPTION_TOO_LONG', async () => {
    const { chef, menuId } = await seedChefWithMenu();
    const longDesc = 'A'.repeat(501);

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem({ description: { en: longDesc, ar: 'وصف' } }))
      .expect(400);

    const fields = res.body.details?.fields ?? [];
    expect(
      fields.some((f: string) => f.includes('ITEM_DESCRIPTION_TOO_LONG')),
    ).toBe(true);
  });

  it('refuses price="0" → 400 ITEM_PRICE_INVALID', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem({ price: '0' }))
      .expect(400);

    // The DTO regex on `price` excludes pure-zero values, so the
    // VALIDATION_ERROR `fields` array carries the ITEM_PRICE_INVALID code.
    const fields = res.body.details?.fields ?? [];
    expect(fields.some((f: string) => f.includes('ITEM_PRICE_INVALID'))).toBe(
      true,
    );
  });

  it('refuses price="0.00" → 400 ITEM_PRICE_INVALID', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem({ price: '0.00' }))
      .expect(400);

    const fields = res.body.details?.fields ?? [];
    expect(fields.some((f: string) => f.includes('ITEM_PRICE_INVALID'))).toBe(
      true,
    );
  });

  it('refuses stock={ isUnlimitedStock: true, quantity: 5 } → 400 ITEM_STOCK_AMBIGUOUS', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem({ stock: { isUnlimitedStock: true, quantity: 5 } }))
      .expect(400);

    const fields = res.body.details?.fields ?? [];
    expect(fields.some((f: string) => f.includes('ITEM_STOCK_AMBIGUOUS'))).toBe(
      true,
    );
  });

  it('refuses stock={ isUnlimitedStock: false } (missing quantity) → 400 ITEM_STOCK_AMBIGUOUS', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem({ stock: { isUnlimitedStock: false } }))
      .expect(400);

    const fields = res.body.details?.fields ?? [];
    expect(fields.some((f: string) => f.includes('ITEM_STOCK_AMBIGUOUS'))).toBe(
      true,
    );
  });

  // -----------------------------------------------------------------------
  // Cross-chef refusal (SC-014)
  // -----------------------------------------------------------------------

  it('chef A targeting chef B item returns 404 ITEM_NOT_FOUND with same shape as genuinely missing UUID', async () => {
    const { chef: chefA, menuId: menuA } = await seedChefWithMenu();
    const { chef: chefB } = await seedChefWithMenu();

    // Chef A creates an item
    const itemRes = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuA}/items`)
      .set('Authorization', `Bearer ${chefA.chefToken}`)
      .send(validItem())
      .expect(201);

    const itemId = itemRes.body.id;

    // Chef B tries to update chef A's item
    const crossRes = await request(ctx.server)
      .patch(`/api/v1/chef/items/${itemId}`)
      .set('Authorization', `Bearer ${chefB.chefToken}`)
      .send({ isActive: false })
      .expect(404);

    expect(crossRes.body.code).toBe('ITEM_NOT_FOUND');

    // Genuinely missing UUID returns the same shape
    const missingRes = await request(ctx.server)
      .patch('/api/v1/chef/items/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${chefB.chefToken}`)
      .send({ isActive: false })
      .expect(404);

    expect(missingRes.body.code).toBe('ITEM_NOT_FOUND');
    expect(missingRes.body).toMatchObject({ code: crossRes.body.code });
  });

  // -----------------------------------------------------------------------
  // Idempotent per-image remove (SC-007a / SC-007c)
  // -----------------------------------------------------------------------

  it('SC-007a: idempotent image remove — second DELETE for same key returns 200 with empty images', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    // Create item
    const itemRes = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem())
      .expect(201);

    const itemId = itemRes.body.id;

    // Insert a fake URL directly (we skip real Supabase upload in unit tests)
    // We use raw Prisma to set a synthetic image URL containing the expected marker.
    const fakeKey = `items/${chef.chefId}/${itemId}/fake-uuid.jpg`;
    const supabaseBase = process.env.SUPABASE_URL ?? 'https://fake.supabase.co';
    const fakeUrl = `${supabaseBase}/storage/v1/object/public/item-images/${fakeKey}`;

    await (prisma as any).item.update({
      where: { id: itemId },
      data: { images: { set: [fakeUrl] } },
    });

    // First remove
    const r1 = await request(ctx.server)
      .delete(
        `/api/v1/chef/items/${itemId}/images?key=${encodeURIComponent(fakeKey)}`,
      )
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .expect(200);

    expect(r1.body.images).toEqual([]);

    // Second remove (idempotent)
    const r2 = await request(ctx.server)
      .delete(
        `/api/v1/chef/items/${itemId}/images?key=${encodeURIComponent(fakeKey)}`,
      )
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .expect(200);

    expect(r2.body.images).toEqual([]);
  });

  it('SC-007c: removing middle image preserves order of remaining images', async () => {
    const { chef, menuId } = await seedChefWithMenu();

    const itemRes = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send(validItem())
      .expect(201);

    const itemId = itemRes.body.id;

    const supabaseBase = process.env.SUPABASE_URL ?? 'https://fake.supabase.co';
    const makeUrl = (n: number) => {
      const key = `items/${chef.chefId}/${itemId}/img-${n}.jpg`;
      return {
        url: `${supabaseBase}/storage/v1/object/public/item-images/${key}`,
        key,
      };
    };

    const img1 = makeUrl(1);
    const img2 = makeUrl(2);
    const img3 = makeUrl(3);

    await (prisma as any).item.update({
      where: { id: itemId },
      data: { images: { set: [img1.url, img2.url, img3.url] } },
    });

    // Remove middle image
    const res = await request(ctx.server)
      .delete(
        `/api/v1/chef/items/${itemId}/images?key=${encodeURIComponent(img2.key)}`,
      )
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .expect(200);

    expect(res.body.images).toEqual([img1.url, img3.url]);
  });
});
