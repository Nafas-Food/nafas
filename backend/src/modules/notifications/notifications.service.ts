import { Injectable } from '@nestjs/common';
import { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FcmService } from './fcm.service';

type BilingualText = { en: string; ar: string };

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly fcmService: FcmService,
  ) {}

  async create(args: {
    userId: string;
    type: NotificationType;
    title: BilingualText;
    body: BilingualText;
    data?: Record<string, string>;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const client = args.tx ?? this.prismaService;
    await client.notification.create({
      data: {
        userId: args.userId,
        type:   args.type,
        title:  args.title  as unknown as Prisma.InputJsonValue,
        body:   args.body   as unknown as Prisma.InputJsonValue,
        data:   args.data ? (args.data as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /** Fire-and-forget — caller awaits but failure logs only (best-effort per FR-009). */
  async dispatchPush(userId: string, payload: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
    const user = await this.prismaService.extended.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) return;
    await this.fcmService.send(user.fcmToken, payload);
  }
}
