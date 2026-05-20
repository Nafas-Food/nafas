import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import {
  ChefFixtureCtx,
  seedUser,
  signedInAdmin,
  seedCategories,
  verifiedChef,
  PHASE3_CATEGORIES,
} from './helpers/chef.fixtures';

/**
 * T072 — per-chef image-upload throttle (FR-012b / SC-007b)
 *
 * Design: five items × 20 uploads = 20 allowed + 5 refused.
 * The 5-item round-robin is needed because the FR-012 5-image-per-item cap
 * would fire (ITEM_IMAGES_FULL) before the FR-012b 20/60s throttle
 * (ITEM_UPLOAD_RATE_LIMITED) if all uploads targeted a single item.
 *
 * StorageService is mocked so the assertion targets the throttle path only
 * — no real Supabase round-trip is required for this test to pass.
 *
 * The test also verifies that a second chef operates under an independent cap.
 */
describe('Items upload throttle (e2e) — T072 (FR-012b / SC-007b)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;

  const cleanupUserIds: string[] = [];
  const cleanupChefIds: string[] = [];

  // A minimal valid 1×1 JPEG file used as the upload payload.
  const TINY_JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEA//EAB0QAAICAgMBAAAAAAAAAAAAAAECAxEEEiExQf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmSlkkwopUuQfYDKPlAAAAAAAAH/9k=',
    'base64',
  );

  beforeAll(async () => {
    const storageStub = {
      upload: jest
        .fn<Promise<string>, [string, string, Buffer, string]>()
        .mockImplementation(async (bucket, p) => `https://stub/${bucket}/${p}`),
      delete: jest
        .fn<Promise<void>, [string, string]>()
        .mockResolvedValue(undefined),
    };
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageStub)
      .compile();

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

  async function seedChefWith5Items() {
    const user = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(user.id);
    const chef = await verifiedChef(ctx, user, admin);
    cleanupChefIds.push(chef.chefId);

    const menuRes = await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chef.chefToken}`)
      .send({
        name: { en: 'Throttle Test Menu', ar: 'قائمة اختبار' },
        categoryId: PHASE3_CATEGORIES[0].id,
        availableAllDays: true,
      })
      .expect(201);

    const menuId: string = menuRes.body.id;
    const itemIds: string[] = [];

    const baseItem = {
      description: { en: 'Desc', ar: 'وصف' },
      price: '20.00',
      discountValue: '0',
      discountUnit: 'fixed',
      stock: { isUnlimitedStock: true },
    };

    for (let i = 0; i < 5; i++) {
      const ir = await request(ctx.server)
        .post(`/api/v1/chef/menus/${menuId}/items`)
        .set('Authorization', `Bearer ${chef.chefToken}`)
        .send({
          ...baseItem,
          name: { en: `Item ${i + 1}`, ar: `عنصر ${i + 1}` },
        })
        .expect(201);
      itemIds.push(ir.body.id);
    }

    return { chef, itemIds };
  }

  it('first 20 uploads succeed (201); uploads 21-25 refused with 429; two chefs have independent caps', async () => {
    const { chef: chefA, itemIds: itemsA } = await seedChefWith5Items();
    const { chef: chefB, itemIds: itemsB } = await seedChefWith5Items();

    const statusesA: number[] = [];
    const statusesB: number[] = [];

    // Run chef A's 25 uploads serially so @nestjs/throttler's in-memory
    // counter advances deterministically (parallel firing can race the
    // bucket boundary).
    for (let i = 0; i < 25; i++) {
      const resA = await request(ctx.server)
        .post(`/api/v1/chef/items/${itemsA[i % 5]}/images`)
        .set('Authorization', `Bearer ${chefA.chefToken}`)
        .attach('file', TINY_JPEG, {
          filename: `test-${i}.jpg`,
          contentType: 'image/jpeg',
        });
      statusesA.push(resA.status);
    }

    // Both the global IP-keyed ThrottlerGuard and the per-chef
    // ChefThrottlerGuard hit the same `default` tier at 20/60s, so chef
    // A's 20 successful uploads have also used up the localhost IP cap.
    // Reset the in-memory throttler storage so chef B's run isolates the
    // per-user (sub) keying — anything chef B is throttled on after the
    // reset is attributable to ChefThrottlerGuard.getTracker(), confirming
    // the cap is per-chef and not shared with chef A.
    const throttlerStorage = app.get(ThrottlerStorageService);
    const s = throttlerStorage.storage;
    for (const key of Object.keys(s)) {
      delete s[key];
    }

    for (let i = 0; i < 25; i++) {
      const resB = await request(ctx.server)
        .post(`/api/v1/chef/items/${itemsB[i % 5]}/images`)
        .set('Authorization', `Bearer ${chefB.chefToken}`)
        .attach('file', TINY_JPEG, {
          filename: `test-${i}.jpg`,
          contentType: 'image/jpeg',
        });
      statusesB.push(resB.status);
    }

    // Uploads 1-20 are expected 201; the throttle kicks in at upload 21 resulting in 5×429.
    const successA = statusesA.filter((s) => s === 201).length;
    const throttledA = statusesA.filter((s) => s === 429).length;
    const successB = statusesB.filter((s) => s === 201).length;
    const throttledB = statusesB.filter((s) => s === 429).length;

    // Each chef's cap is independent
    expect(successA).toBe(20);
    expect(throttledA).toBe(5);
    expect(successB).toBe(20);
    expect(throttledB).toBe(5);
  }, 60_000); // 60s timeout — 50 requests in sequence can take a while
});
