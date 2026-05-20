import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Role } from '@prisma/client';
import {
  ChefFixtureCtx,
  signedInAdmin,
  seedCategories,
  randomPhone,
} from './helpers/chef.fixtures';

describe('Home (e2e) — T073', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let customerToken: string;
  let customerId: string;

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

    // Create a customer with a known first name
    const phone = randomPhone();
    const custUser = await prisma.user.create({
      data: {
        phone,
        passwordHash: hashSync('password1234', 12),
        fullName: 'Ahmed',
        role: Role.customer,
        phoneVerified: true,
      },
    });
    customerId = custUser.id;
    customerToken = ctx.sign(custUser.id, 'customer');
    cleanupUserIds.push(customerId);

    // Seed three verified chefs directly via Prisma (two open, one closed)
    for (let i = 0; i < 3; i++) {
      const uPhone = randomPhone();
      const u = await prisma.user.create({
        data: {
          phone: uPhone,
          passwordHash: hashSync('password1234', 12),
          fullName: `Chef ${i + 1}`,
          role: Role.chef,
          phoneVerified: true,
        },
      });
      cleanupUserIds.push(u.id);

      const chef = await (prisma as any).chef.create({
        data: {
          userId: u.id,
          chefName: `Test Kitchen ${i + 1}`,
          bio: `Bio ${i + 1}`,
          latitude: 30.0 + i * 0.01,
          longitude: 31.0 + i * 0.01,
          minOrderPrice: '50.00',
          isVerified: true,
          verifiedAt: new Date(Date.now() - (3 - i) * 1_000),
          isOpen: i < 2, // chefs 0 and 1 are open, chef 2 is closed
          logo: 'default.png',
          banner: 'default-banner.png',
        },
      });
      cleanupChefIds.push(chef.id);
    }
  });

  afterAll(async () => {
    if (cleanupChefIds.length) {
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

  it('returns greeting with userFirstName, openChefs, categories, topRated', async () => {
    const res = await request(ctx.server)
      .get('/api/v1/home')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    // Greeting
    expect(res.body.greeting).toBeDefined();
    expect(typeof res.body.greeting.userFirstName).toBe('string');

    // Open chefs: at least the 2 we seeded as open
    expect(Array.isArray(res.body.openChefs)).toBe(true);
    const openIds = res.body.openChefs.map((c: any) => c.id);
    // Both open chefs should appear
    const seededOpenChefs = cleanupChefIds.slice(0, 2);
    for (const id of seededOpenChefs) {
      expect(openIds).toContain(id);
    }

    // Categories: at least the 8 seeded Phase 3 categories
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(8);

    // topRated: returns verified chefs sorted by ratings DESC, verifiedAt DESC
    expect(Array.isArray(res.body.topRated)).toBe(true);
    expect(res.body.topRated.length).toBeGreaterThanOrEqual(3);
  });

  it('requires auth — returns 401 without token', async () => {
    await request(ctx.server).get('/api/v1/home').expect(401);
  });
});
