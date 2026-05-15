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
  seedChef,
  seedActiveOrder,
  seedTerminalOrder,
} from './helpers/address.fixtures';

describe('Addresses (e2e) — US1 & US2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signAccess: (userId: string) => string;
  let cap: ReturnType<typeof captureLogs>;
  const cleanupIds: {
    users: string[];
    addresses: string[];
    orders: string[];
    chefs: string[];
  } = {
    users: [],
    addresses: [],
    orders: [],
    chefs: [],
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
        { sub: userId, role: 'customer', type: 'access' },
        { expiresIn: 900 },
      );
  });

  beforeEach(() => {
    cap = captureLogs();
  });

  afterEach(async () => {
    cap.restore();
    if (cleanupIds.orders.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM orders WHERE id = ANY($1::uuid[])`,
        cleanupIds.orders,
      );
      cleanupIds.orders = [];
    }
    if (cleanupIds.addresses.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM user_addresses WHERE id = ANY($1::uuid[])`,
        cleanupIds.addresses,
      );
      cleanupIds.addresses = [];
    }
    if (cleanupIds.chefs.length) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM chefs WHERE id = ANY($1::uuid[])`,
        cleanupIds.chefs,
      );
      cleanupIds.chefs = [];
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
  const trackOrder = (id: string) => cleanupIds.orders.push(id);
  const trackChef = (id: string) => cleanupIds.chefs.push(id);

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

  describe('US2 — PATCH /api/v1/addresses/:id', () => {
    it('changes the label only and returns updated address', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const addr1 = await seedAddress(prisma, custA.id, {
        label: 'home',
        streetName: '15 Tahrir St',
      });
      trackAddress(addr1.id);
      const addr2 = await seedAddress(prisma, custA.id, {
        label: 'work',
      });
      trackAddress(addr2.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/addresses/${addr1.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .send({ label: 'home-updated' })
        .expect(200);

      expect(res.body.label).toBe('home-updated');
      expect(res.body.streetName).toBe('15 Tahrir St');

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.update');
      expect(events[0].outcome).toBe('success');
      expect(events[0].actorId).toBe(custA.id);
      expect(events[0].addressId).toBe(addr1.id);
    });

    it('refuses PATCH on foreign-customer address with 404 (FR-015 / SC-006)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);
      const custB = await seedCustomer(prisma, signAccess);
      trackUser(custB.id);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custB.accessToken}`)
        .send({ label: 'stolen' })
        .expect(404);

      expect(res.body.code).toBe('ADDRESS_NOT_FOUND');

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.update');
      expect(events[0].outcome).toBe('not_found');
    });

    it('refuses PATCH with latitude: 999 and scrubs coordinates from response (SC-012)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .send({ latitude: 999 })
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
      expect(events[0].event).toBe('address.update');
      expect(events[0].outcome).toBe('validation_rejected');
    });

    it('PATCH allowed during in-flight order (FR-011)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const chef = await seedChef(prisma);
      trackChef(chef.id);
      trackUser(chef.userId);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      const order = await seedActiveOrder(prisma, custA.id, addr.id, chef.id);
      trackOrder(order.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .send({ label: 'updated-during-flight' })
        .expect(200);

      expect(res.body.label).toBe('updated-during-flight');

      const getRes = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(200);

      const found = getRes.body.find((a: any) => a.id === addr.id);
      expect(found.label).toBe('updated-during-flight');

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.update');
      expect(events[0].outcome).toBe('success');
    });
  });

  describe('US2 — DELETE /api/v1/addresses/:id', () => {
    it('deletes an address and returns 204', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(204);

      const getRes = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(200);

      expect(getRes.body).toHaveLength(0);

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.delete');
      expect(events[0].outcome).toBe('success');
      expect(events[0].addressId).toBe(addr.id);
    });

    it('refuses DELETE of already-soft-deleted address with 404 (SC-009)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(204);

      cap.restore();
      cap = captureLogs();

      await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(404);

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.delete');
      expect(events[0].outcome).toBe('not_found');
    });

    it('refuses DELETE on foreign-customer address with 404 (FR-015 / SC-006)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);
      const custB = await seedCustomer(prisma, signAccess);
      trackUser(custB.id);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custB.accessToken}`)
        .expect(404);

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.delete');
      expect(events[0].outcome).toBe('not_found');
    });
  });

  describe('US3 — DELETE refused by in-flight order', () => {
    it('returns 409 ADDRESS_IN_USE for address with active order (FR-013)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const chef = await seedChef(prisma);
      trackChef(chef.id);
      trackUser(chef.userId);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      const order = await seedActiveOrder(prisma, custA.id, addr.id, chef.id);
      trackOrder(order.id);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(409);

      expect(res.body.code).toBe('ADDRESS_IN_USE');
      expect(res.body.activeOrderId).toBe(order.id);

      const getRes = await request(app.getHttpServer())
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(200);

      expect(getRes.body).toHaveLength(1);
      expect(getRes.body[0].id).toBe(addr.id);

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.delete');
      expect(events[0].outcome).toBe('in_use');
      expect(events[0].actorId).toBe(custA.id);
      expect(events[0].addressId).toBe(addr.id);
    });

    it('allows DELETE after order reaches terminal status (DELIVERED)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const chef = await seedChef(prisma);
      trackChef(chef.id);
      trackUser(chef.userId);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      const order = await seedTerminalOrder(prisma, custA.id, addr.id, chef.id);
      trackOrder(order.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(204);

      assertNoCoordsInLogs(cap.lines);

      const events = cap.addressEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('address.delete');
      expect(events[0].outcome).toBe('success');
    });

    it('409 response body has no coordinate keys (SC-012)', async () => {
      const custA = await seedCustomer(prisma, signAccess);
      trackUser(custA.id);

      const chef = await seedChef(prisma);
      trackChef(chef.id);
      trackUser(chef.userId);

      const addr = await seedAddress(prisma, custA.id);
      trackAddress(addr.id);

      const order = await seedActiveOrder(prisma, custA.id, addr.id, chef.id);
      trackOrder(order.id);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/addresses/${addr.id}`)
        .set('Authorization', `Bearer ${custA.accessToken}`)
        .expect(409);

      expect(res.body).toHaveProperty('activeOrderId');
      expect(res.body).not.toHaveProperty('latitude');
      expect(res.body).not.toHaveProperty('longitude');
      expect(res.body).not.toHaveProperty('coordinates');

      assertNoCoordsInLogs(cap.lines);
    });
  });
});
