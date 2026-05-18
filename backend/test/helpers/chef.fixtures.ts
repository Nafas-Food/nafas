import { PrismaClient, Role } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import type http from 'http';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ChefFixtureCtx {
  server: http.Server;
  prisma: PrismaClient;
  sign: (userId: string, role: string) => string;
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface SeededAdmin {
  id: string;
  phone: string;
  accessToken: string;
}

export interface SeededUser {
  id: string;
  phone: string;
  accessToken: string;
}

export interface PendingChefResult {
  chefId: string;
  userId: string;
}

export interface VerifiedChefResult extends PendingChefResult {
  chefToken: string;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

export function randomPhone(): string {
  return `+201${Math.floor(100_000_000 + Math.random() * 900_000_000)}`;
}

export async function seedUser(
  prisma: PrismaClient,
  sign: (userId: string, role: string) => string,
): Promise<SeededUser> {
  const phone = randomPhone();
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash: hashSync('password1234', 12),
      fullName: 'Test User',
      role: Role.customer,
      phoneVerified: true,
    },
  });
  return { id: user.id, phone, accessToken: sign(user.id, 'customer') };
}

// ---------------------------------------------------------------------------
// T073 fixtures
// ---------------------------------------------------------------------------

/**
 * Creates an admin user directly in the DB via prisma.user.update.
 * Returns the session with an admin-signed JWT.
 */
export async function signedInAdmin(ctx: ChefFixtureCtx): Promise<SeededAdmin> {
  const phone = randomPhone();
  const user = await ctx.prisma.user.create({
    data: {
      phone,
      passwordHash: hashSync('adminpass123', 12),
      fullName: 'Test Admin',
      role: Role.customer,
      phoneVerified: true,
    },
  });
  await ctx.prisma.user.update({
    where: { id: user.id },
    data: { role: Role.admin },
  });
  return { id: user.id, phone, accessToken: ctx.sign(user.id, 'admin') };
}

/** Calls the real POST /chef/apply endpoint with the customer's token. */
export async function pendingApplication(
  ctx: ChefFixtureCtx,
  user: SeededUser,
  overrides: Partial<{
    chefName: string;
    bio: string;
    latitude: number;
    longitude: number;
    minOrderPrice: number;
  }> = {},
): Promise<PendingChefResult> {
  const res = await request(ctx.server)
    .post('/api/v1/chef/apply')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({
      chefName: overrides.chefName ?? 'Test Kitchen',
      bio: overrides.bio ?? 'A great test kitchen',
      latitude: overrides.latitude ?? 30.0444,
      longitude: overrides.longitude ?? 31.2357,
      minOrderPrice: overrides.minOrderPrice ?? 50,
    })
    .expect(201);
  return { chefId: res.body.id, userId: user.id };
}

/** pendingApplication → admin verify. Returns chef ID and chef-role token. */
export async function verifiedChef(
  ctx: ChefFixtureCtx,
  user: SeededUser,
  admin: SeededAdmin,
  overrides?: Parameters<typeof pendingApplication>[2],
): Promise<VerifiedChefResult> {
  const { chefId, userId } = await pendingApplication(ctx, user, overrides);
  await request(ctx.server)
    .patch(`/api/v1/admin/chefs/${chefId}/verify`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .expect(200);
  return { chefId, userId, chefToken: ctx.sign(userId, 'chef') };
}

/** pendingApplication → admin reject with a synthetic reason. */
export async function rejectedApplication(
  ctx: ChefFixtureCtx,
  user: SeededUser,
  admin: SeededAdmin,
  overrides?: Parameters<typeof pendingApplication>[2],
): Promise<PendingChefResult> {
  const { chefId, userId } = await pendingApplication(ctx, user, overrides);
  await request(ctx.server)
    .patch(`/api/v1/admin/chefs/${chefId}/reject`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ reason: 'test rejection' })
    .expect(200);
  return { chefId, userId };
}

/** pendingApplication → verify → revoke with a synthetic reason. */
export async function revokedChef(
  ctx: ChefFixtureCtx,
  user: SeededUser,
  admin: SeededAdmin,
  overrides?: Parameters<typeof pendingApplication>[2],
): Promise<PendingChefResult> {
  const {
    chefId,
    userId,
    chefToken: _,
  } = await verifiedChef(ctx, user, admin, overrides);
  await request(ctx.server)
    .delete(`/api/v1/admin/chefs/${chefId}`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ reason: 'test revocation' })
    .expect(204);
  return { chefId, userId };
}

// ---------------------------------------------------------------------------
// Category + Menu seeds
// ---------------------------------------------------------------------------

const PHASE3_CATEGORIES = [
  {
    id: '00000000-0000-4000-8000-000000000c01',
    name: { en: 'Koshary', ar: 'كشري' },
    icon: 'coffee',
    displayOrder: 0,
  },
  {
    id: '00000000-0000-4000-8000-000000000c02',
    name: { en: 'Mahshi', ar: 'محشي' },
    icon: 'leaf',
    displayOrder: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000c03',
    name: { en: 'Molokheya', ar: 'ملوخية' },
    icon: 'feather',
    displayOrder: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000c04',
    name: { en: 'Hawawshi', ar: 'حواوشي' },
    icon: 'pie-chart',
    displayOrder: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000c05',
    name: { en: 'Sweets', ar: 'حلويات' },
    icon: 'gift',
    displayOrder: 4,
  },
  {
    id: '00000000-0000-4000-8000-000000000c06',
    name: { en: 'Feteer', ar: 'فطير' },
    icon: 'square',
    displayOrder: 5,
  },
  {
    id: '00000000-0000-4000-8000-000000000c07',
    name: { en: 'Fattah', ar: 'فتة' },
    icon: 'layers',
    displayOrder: 6,
  },
  {
    id: '00000000-0000-4000-8000-000000000c08',
    name: { en: 'Other', ar: 'أخرى' },
    icon: 'more-horizontal',
    displayOrder: 7,
  },
] as const;

export { PHASE3_CATEGORIES };

/** Re-runs the Phase-3 categories seed against the test database. */
export async function seedCategories(
  prisma: PrismaClient,
): Promise<typeof PHASE3_CATEGORIES> {
  for (const c of PHASE3_CATEGORIES) {
    await (prisma as any).category.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        icon: c.icon,
        displayOrder: c.displayOrder,
        isActive: true,
      },
      update: {
        name: c.name,
        icon: c.icon,
        displayOrder: c.displayOrder,
        isActive: true,
        deletedAt: null,
      },
    });
  }
  return PHASE3_CATEGORIES;
}

/**
 * Inserts a Menu row directly. "Active" in Phase 3 means not soft-deleted —
 * no `isActive` boolean on the Menu model.
 */
export async function seedMenu(
  prisma: PrismaClient,
  chefId: string,
  categoryId: string,
): Promise<{ id: string }> {
  return (prisma as any).menu.create({
    data: {
      chefId,
      categoryId,
      name: { en: 'Test Menu', ar: 'قائمة اختبار' },
    },
  });
}

// ---------------------------------------------------------------------------
// Bulk chef seed (no HTTP — direct Prisma for speed)
// ---------------------------------------------------------------------------

export interface SeededBulkChef {
  chefId: string;
  userId: string;
  lat: number;
  lng: number;
  distKm: number;
}

function distributePoints(
  N: number,
  centre: { lat: number; lng: number },
): Array<{ lat: number; lng: number; distKm: number }> {
  const lngFactor = Math.cos((centre.lat * Math.PI) / 180);
  return Array.from({ length: N }, (_, i) => {
    const angleDeg = (i * 360) / N;
    const angleRad = (angleDeg * Math.PI) / 180;
    // Every third chef goes to the outer ring (12 km); rest at 4 km.
    const distKm = i % 3 === 2 ? 12 : 4;
    const latOffset = (distKm * Math.cos(angleRad)) / 111;
    const lngOffset = (distKm * Math.sin(angleRad)) / (111 * lngFactor);
    return { lat: centre.lat + latOffset, lng: centre.lng + lngOffset, distKm };
  });
}

/**
 * Bulk-seeds N already-verified chefs at distributed lat/lng points around centre.
 * Uses direct Prisma inserts for speed. Even-indexed chefs are open, odd are closed.
 * Seeded verifiedAt timestamps are spread so ordering is deterministic.
 */
export async function seedManyChefs(
  prisma: PrismaClient,
  N: number,
  centre: { lat: number; lng: number },
  categoryDistribution?: Array<{ chefIndex: number; categoryId: string }>,
): Promise<SeededBulkChef[]> {
  const points = distributePoints(N, centre);
  const result: SeededBulkChef[] = [];

  for (let i = 0; i < N; i++) {
    const phone = randomPhone();
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash: hashSync('password1234', 12),
        fullName: `Bulk Chef ${i + 1}`,
        role: Role.chef,
        phoneVerified: true,
      },
    });
    const pt = points[i];
    const chef = await (prisma as any).chef.create({
      data: {
        userId: user.id,
        chefName: `Test Kitchen ${i + 1}`,
        bio: `Bio for bulk chef ${i + 1}`,
        latitude: pt.lat,
        longitude: pt.lng,
        minOrderPrice: 50,
        isVerified: true,
        verifiedAt: new Date(Date.now() - (N - i) * 1_000),
        isOpen: i % 2 === 0,
        logo: 'default.png',
        banner: 'default-banner.png',
      },
    });
    result.push({
      chefId: chef.id,
      userId: user.id,
      lat: pt.lat,
      lng: pt.lng,
      distKm: pt.distKm,
    });
  }

  if (categoryDistribution) {
    for (const { chefIndex, categoryId } of categoryDistribution) {
      if (result[chefIndex]) {
        await seedMenu(prisma, result[chefIndex].chefId, categoryId);
      }
    }
  }

  return result;
}
