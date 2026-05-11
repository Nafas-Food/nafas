import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  captureLogs,
  assertNoCoordsInLogs,
  seedCustomer,
  seedAddress,
} from './helpers/address.fixtures';

describe('Addresses (e2e) — US1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signAccess: (userId: string) => string;
  let cap: ReturnType<typeof captureLogs>;
  const cleanupIds: { users: string[]; addresses: string[] } = {
    users: [],
    addresses: [],
  };

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
    signAccess = (userId: string) =>
      jwt.sign(
        { sub: userId, role: 'CUSTOMER', type: 'access' },
        { expiresIn: 900 },
      );
  });

  beforeEach(() => {
    cap = captureLogs();
  });

  afterEach(async () => {
    cap.restore();
    if (cleanupIds.addresses.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM user_addresses WHERE id = ANY($1::uuid[])`,
        cleanupIds.addresses,
      );
      cleanupIds.addresses = [];
    }
    if (cleanupIds.users.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        cleanupIds.users,
      );
      cleanupIds.users = [];
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const trackUser = (id: string) => cleanupIds.users.push(id);
  const trackAddress = (id: string) => cleanupIds.addresses.push(id);

  describe('US1 — POST /api/v1/addresses', () => {
    it('creates an address and returns 201 with correct shape', async () => {
      const customer = await seedCustomer(prisma, signAccess);
      trackUser(customer.id);

      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          label: 'home',
          streetName: '15 Tahrir St',
          latitude: 30.0444,
          longitude: 31.2357,
        })
        .expect(201);

      trackAddress(res.body.id);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('label', 'home');
      expect(res.body).toHaveProperty('streetName', '15 Tahrir St');
      expect(res.body).toHaveProperty('latitude');
      expect(typeof res.body.latitude).toBe('string');
      expect(res.body).toHaveProperty('longitude');
      expect(typeof res.body.longitude).toBe('string');
      expect(res.body).not.toHaveProperty('userId');

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.create');
      expect(events[0].outcome).toBe('success');
      expect(events[0].actorId).toBe(customer.id);
      expect(events[0].addressId).toBe(res.body.id);
      expect(events[0]).not.toHaveProperty('latitude');
      expect(events[0]).not.toHaveProperty('longitude');
    });

    it('refuses POST with extra userId field (SC-008)', async () => {
      const customer = await seedCustomer(prisma, signAccess);
      trackUser(customer.id);

      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          label: 'home',
          streetName: '15 Tahrir St',
          latitude: 30.0444,
          longitude: 31.2357,
          userId: 'intruder',
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.create');
      expect(events[0].outcome).toBe('validation_rejected');
    });

    it('refuses POST with latitude: 999 and scrubs coordinates from response (SC-012)', async () => {
      const customer = await seedCustomer(prisma, signAccess);
      trackUser(customer.id);

      const res = await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          label: 'home',
          streetName: '15 Tahrir St',
          latitude: 999,
          longitude: 31.2357,
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body).not.toHaveProperty('latitude');
      expect(res.body).not.toHaveProperty('longitude');
      if (res.body.details) {
        expect(res.body.details).not.toHaveProperty('latitude');
        expect(res.body.details).not.toHaveProperty('longitude');
        expect(res.body.details).not.toHaveProperty('coordinates');
      }

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.create');
      expect(events[0].outcome).toBe('validation_rejected');
    });

    it('refuses unauthenticated POST with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/addresses')
        .send({
          label: 'home',
          streetName: '15 Tahrir St',
          latitude: 30.0444,
          longitude: 31.2357,
        })
        .expect(401);

      expect(cap.addressEvents()).toHaveLength(0);
      assertNoCoordsInLogs(cap.lines);
    });
  });

  describe('US1 — GET /api/v1/addresses', () => {
    it('returns only the authenticated customer addresses (FR-015)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);
      const custB = await seedCustomer(prisma, signAccess);
      trackUser(custB.id);

      const a1 = await seedAddress(prisma, custA.id, { label: 'home-a1' });
      trackAddress(a1.id);
      const a2 = await seedAddress(prisma, custA.id, { label: 'home-a2' });
      trackAddress(a2.id);
      const a3 = await seedAddress(prisma, custA.id, { label: 'home-a3' });
      trackAddress(a3.id);
      const b1 = await seedAddress(prisma, custB.id, { label: 'home-b1' });
      trackAddress(b1.id);

      const resA = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(200);

      expect(resA.body).toHaveLength(3);
      const aLabels = resA.body.map((a: any) => a.label);
      expect(aLabels).toContain('home-a1');
      expect(aLabels).toContain('home-a2');
      expect(aLabels).toContain('home-a3');

      const resB = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${custB.accessToken}`)
        .expect(200);

      expect(resB.body).toHaveLength(1);
      expect(resB.body[0].label).toBe('home-b1');

      assertNoCoordsInLogs(cap.lines);
      expect(cap.addressEvents()).toHaveLength(0);
    });
  });
});
