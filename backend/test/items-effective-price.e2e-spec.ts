import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { effectivePrice } from '../src/modules/items/effective-price';
import {
  ChefFixtureCtx,
  seedUser,
  signedInAdmin,
  seedCategories,
  verifiedChef,
  PHASE3_CATEGORIES,
} from './helpers/chef.fixtures';

// ---------------------------------------------------------------------------
// T071 — effectivePrice unit tests (SC-005 / SC-006)
// ---------------------------------------------------------------------------

describe('effectivePrice pure-function unit tests', () => {
  it('fixed discount: 60 - 5 = 55.00', () => {
    expect(
      effectivePrice({
        price: '60',
        discountValue: '5',
        discountUnit: 'fixed',
      }).toFixed(2),
    ).toBe('55.00');
  });

  it('percent discount: 60 × (1 - 10/100) = 54.00', () => {
    expect(
      effectivePrice({
        price: '60',
        discountValue: '10',
        discountUnit: 'percent',
      }).toFixed(2),
    ).toBe('54.00');
  });

  it('clamps to zero when fixed discount > price', () => {
    expect(
      effectivePrice({
        price: '60',
        discountValue: '100',
        discountUnit: 'fixed',
      }).toFixed(2),
    ).toBe('0.00');
  });

  it('clamps to zero when percent discount > 100', () => {
    expect(
      effectivePrice({
        price: '60',
        discountValue: '150',
        discountUnit: 'percent',
      }).toFixed(2),
    ).toBe('0.00');
  });

  it('zero discount returns base price', () => {
    expect(
      effectivePrice({
        price: '25.50',
        discountValue: '0',
        discountUnit: 'fixed',
      }).toFixed(2),
    ).toBe('25.50');
  });

  it('100% discount returns 0.00', () => {
    expect(
      effectivePrice({
        price: '60',
        discountValue: '100',
        discountUnit: 'percent',
      }).toFixed(2),
    ).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// T071 — over-HTTP effective-price tests
// ---------------------------------------------------------------------------

describe('Items effective-price (e2e) — T071', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let chefToken: string;
  let menuId: string;

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
    chefToken = chef.chefToken;
    cleanupChefIds.push(chef.chefId);

    // Create a menu for the chef
    const menuRes = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Test Menu', ar: 'قائمة اختبار' },
        categoryId: PHASE3_CATEGORIES[0].id,
        availableAllDays: true,
      })
      .expect(201);

    menuId = menuRes.body.id;
  });

  afterAll(async () => {
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
    }
    if (cleanupUserIds.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        cleanupUserIds,
      );
    }
    await app.close();
  });

  function validItem(overrides: Record<string, unknown> = {}) {
    return {
      name: { en: 'Test Item', ar: 'عنصر اختبار' },
      description: { en: 'A tasty item', ar: 'عنصر لذيذ' },
      price: '50.00',
      discountValue: '0',
      discountUnit: 'fixed',
      stock: { isUnlimitedStock: true },
      ...overrides,
    };
  }

  it('happy path: response carries price + effectivePrice as decimal strings and inStock=true', async () => {
    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send(
        validItem({
          price: '60.00',
          discountValue: '5',
          discountUnit: 'fixed',
        }),
      )
      .expect(201);

    expect(res.body.price).toBe('60.00');
    expect(res.body.effectivePrice).toBe('55.00');
    expect(res.body.inStock).toBe(true);
    expect(res.body.isUnlimitedStock).toBe(true);
  });

  it('percent discount: effectivePrice is computed server-side', async () => {
    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send(
        validItem({
          price: '100.00',
          discountValue: '20',
          discountUnit: 'percent',
        }),
      )
      .expect(201);

    expect(res.body.price).toBe('100.00');
    expect(res.body.effectivePrice).toBe('80.00');
  });

  it('fixed discount > price → 400 ITEM_NEGATIVE_EFFECTIVE_PRICE (SC-005)', async () => {
    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send(
        validItem({
          price: '30.00',
          discountValue: '50.00',
          discountUnit: 'fixed',
        }),
      )
      .expect(400);

    expect(res.body.code).toBe('ITEM_NEGATIVE_EFFECTIVE_PRICE');
  });

  it('percent > 100 → 400 ITEM_NEGATIVE_EFFECTIVE_PRICE', async () => {
    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send(
        validItem({
          price: '30.00',
          discountValue: '110',
          discountUnit: 'percent',
        }),
      )
      .expect(400);

    expect(res.body.code).toBe('ITEM_NEGATIVE_EFFECTIVE_PRICE');
  });

  it('effectivePrice=0 is accepted (discount == price, SC-006)', async () => {
    const res = await request(ctx.server)
      .post(`/api/v1/chef/menus/${menuId}/items`)
      .set('Authorization', `Bearer ${chefToken}`)
      .send(
        validItem({
          price: '30.00',
          discountValue: '30.00',
          discountUnit: 'fixed',
        }),
      )
      .expect(201);

    expect(res.body.effectivePrice).toBe('0.00');
  });
});
