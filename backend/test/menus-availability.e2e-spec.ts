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

describe('Menus Availability (e2e) — T069 (FR-017 today-available filter)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ChefFixtureCtx;
  let admin: Awaited<ReturnType<typeof signedInAdmin>>;
  let chefId: string;
  let chefToken: string;
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

    // Create a verified chef
    const user = await seedUser(prisma, ctx.sign);
    cleanupUserIds.push(user.id);
    const chef = await verifiedChef(ctx, user, admin);
    chefId = chef.chefId;
    chefToken = chef.chefToken;
    cleanupChefIds.push(chefId);

    // Create a customer
    const custUser = await seedUser(prisma, ctx.sign);
    customerId = custUser.id;
    customerToken = custUser.accessToken;
    cleanupUserIds.push(customerId);

    // Create menus
    const CAT = PHASE3_CATEGORIES[0].id;

    // Menu 1: availableAllDays=true (always visible)
    await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Every Day Menu', ar: 'قائمة يومية' },
        categoryId: CAT,
        availableAllDays: true,
      })
      .expect(201);

    // Menu 2: only Sunday (dayOfWeek=0)
    await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Sunday Only', ar: 'الأحد فقط' },
        categoryId: CAT,
        availableAllDays: false,
        initialAvailability: [0],
      })
      .expect(201);

    // Menu 3: only Monday (dayOfWeek=1)
    await request(ctx.server)
      .post('/api/v1/chef/menus')
      .set('Authorization', `Bearer ${chefToken}`)
      .send({
        name: { en: 'Monday Only', ar: 'الاثنين فقط' },
        categoryId: CAT,
        availableAllDays: false,
        initialAvailability: [1],
      })
      .expect(201);
  });

  afterAll(async () => {
    // restore spy
    jest.restoreAllMocks();
    if (cleanupChefIds.length) {
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

  function pinWeekday(day: number) {
    jest.spyOn(todayCairo, 'todaysCairoWeekday').mockReturnValue(day);
  }

  async function getChefProfile() {
    const res = await request(ctx.server)
      .get(`/api/v1/chefs/${chefId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    return res.body.menus as Array<{
      name: { en: string };
      availability?: any[];
    }>;
  }

  // -----------------------------------------------------------------------
  // FR-017 weekday-based visibility
  // -----------------------------------------------------------------------

  it('on Sunday (0): every-day menu + Sunday menu visible, Monday menu absent', async () => {
    pinWeekday(0);
    const menus = await getChefProfile();
    const names = menus.map((m) => m.name.en);
    expect(names).toContain('Every Day Menu');
    expect(names).toContain('Sunday Only');
    expect(names).not.toContain('Monday Only');
  });

  it('on Monday (1): every-day menu + Monday menu visible, Sunday menu absent', async () => {
    pinWeekday(1);
    const menus = await getChefProfile();
    const names = menus.map((m) => m.name.en);
    expect(names).toContain('Every Day Menu');
    expect(names).toContain('Monday Only');
    expect(names).not.toContain('Sunday Only');
  });

  it('on Friday (5): only every-day menu visible', async () => {
    pinWeekday(5);
    const menus = await getChefProfile();
    const names = menus.map((m) => m.name.en);
    expect(names).toContain('Every Day Menu');
    expect(names).not.toContain('Sunday Only');
    expect(names).not.toContain('Monday Only');
  });

  it('availableAllDays=true menu ALWAYS appears regardless of pinned weekday', async () => {
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      pinWeekday(day);
      const menus = await getChefProfile();
      const names = menus.map((m) => m.name.en);
      expect(names).toContain('Every Day Menu');
    }
  });

  // -----------------------------------------------------------------------
  // SC-002 / SC-003 midnight Cairo boundary
  // -----------------------------------------------------------------------

  it('Cairo midnight boundary: just before midnight is still the old day', () => {
    // 2026-05-19 is a Tuesday. Egypt observes DST in May (EEST, UTC+3),
    // so 23:59:59 Cairo = 20:59:59 UTC.
    const justBeforeMidnight = new Date('2026-05-19T20:59:59.000Z');
    const result = todayCairo.todaysCairoWeekday(justBeforeMidnight);
    // 2026-05-19 is Tuesday = 2
    expect(result).toBe(2);
  });

  it('Cairo midnight boundary: just after midnight is the new day', () => {
    // 2026-05-20 00:00:01 Cairo (EEST / UTC+3) = 2026-05-19T21:00:01 UTC
    const justAfterMidnight = new Date('2026-05-19T21:00:01.000Z');
    const result = todayCairo.todaysCairoWeekday(justAfterMidnight);
    // 2026-05-20 is Wednesday = 3
    expect(result).toBe(3);
  });
});
