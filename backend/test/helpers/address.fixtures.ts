import { Logger } from '@nestjs/common';
import { OrderStatus, PrismaClient, Role, UserAddress } from '@prisma/client';
import { hashSync } from 'bcryptjs';

export interface SeededCustomer {
  id: string;
  phone: string;
  accessToken: string;
}

export async function seedCustomer(
  prisma: PrismaClient,
  signAccess: (userId: string) => string,
): Promise<SeededCustomer> {
  const phone = `+201${Math.floor(100000000 + Math.random() * 900000000)}`;
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash: hashSync('password1234', 12),
      fullName: 'Test Customer',
      role: Role.CUSTOMER,
      phoneVerified: true,
    },
  });
  return { id: user.id, phone, accessToken: signAccess(user.id) };
}

export async function seedAddress(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<UserAddress> = {},
): Promise<UserAddress> {
  return prisma.userAddress.create({
    data: {
      userId,
      label: 'home',
      streetName: '15 Tahrir St',
      latitude: 30.0444,
      longitude: 31.2357,
      ...overrides,
    },
  });
}

export async function seedActiveOrder(
  prisma: PrismaClient,
  userId: string,
  addressId: string,
  chefId: string,
) {
  return prisma.order.create({
    data: {
      userId,
      chefId,
      addressId,
      status: OrderStatus.PENDING,
      subtotal: 100,
      subtotalAfterDiscount: 100,
      deliveryFee: 10,
      serviceFee: 5,
      total: 115,
    },
  });
}

export async function seedTerminalOrder(
  prisma: PrismaClient,
  userId: string,
  addressId: string,
  chefId: string,
) {
  return prisma.order.create({
    data: {
      userId,
      chefId,
      addressId,
      status: OrderStatus.DELIVERED,
      subtotal: 100,
      subtotalAfterDiscount: 100,
      deliveryFee: 10,
      serviceFee: 5,
      total: 115,
    },
  });
}

export function captureLogs() {
  const captured: string[] = [];
  const orig = Logger.prototype.log;
  Logger.prototype.log = function (msg: unknown, ...rest: unknown[]) {
    captured.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
    return orig.call(this, msg as string, ...(rest as []));
  };
  return {
    lines: captured,
    addressEvents(): Array<Record<string, unknown>> {
      return captured
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(
          (j): j is Record<string, unknown> =>
            !!j &&
            typeof (j as { event?: unknown }).event === 'string' &&
            String((j as { event?: unknown }).event).startsWith('address.'),
        );
    },
    restore() {
      Logger.prototype.log = orig;
    },
  };
}

export function assertNoCoordsInLogs(lines: string[]): void {
  for (const line of lines) {
    if (/\b(latitude|longitude|coordinates)\b/.test(line)) {
      throw new Error(
        `FR-021 violation: log line contains coordinate field: ${line}`,
      );
    }
  }
}
