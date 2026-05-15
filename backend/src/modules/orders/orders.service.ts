import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FR-013 in-flight-order safety rail. Returns the ID of one of the
   * customer's orders whose status is NOT terminal and whose
   * addressId matches, or `null` if there is none. Terminal set is
   * { DELIVERED, CANCELLED } per Constitution Principle VI.
   *
   * Reads through `prismaService.extended.order.findFirst` so any
   * future soft-delete on Order is honoured automatically.
   */
  async hasActiveOrderForAddress(
    addressId: string,
    userId: string,
  ): Promise<{ activeOrderId: string } | null> {
    const row = await this.prisma.extended.order.findFirst({
      where: {
        addressId,
        userId,
        status: { notIn: [OrderStatus.delivered, OrderStatus.cancelled] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row ? { activeOrderId: row.id } : null;
  }
}
