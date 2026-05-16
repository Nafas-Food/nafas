import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChefEventLogger } from '../../common/logging/chef-event.logger';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly chefEventLogger: ChefEventLogger,
  ) {}

  async listPendingApplications(cursor: number, pageSize: number) {
    return this.prismaService.extended.chef.findMany({
      where: {
        isVerified: false,
        rejectedAt: null /* deletedAt:null implicit via extended */,
      },
      orderBy: { createdAt: 'asc' },
      skip: cursor,
      take: pageSize,
      include: { user: { select: { fullName: true, phone: true } } },
    });
  }

  async listVerifiedChefs(cursor: number, pageSize: number, q?: string) {
    return this.prismaService.extended.chef.findMany({
      where: {
        isVerified: true,
        ...(q ? { chefName: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { verifiedAt: 'desc' },
      skip: cursor,
      take: pageSize,
    });
  }

  async verifyApplication(adminId: string, sourceIp: string, chefId: string) {
    try {
      const result = await this.prismaService.$transaction(async (tx) => {
        const chef = await tx.chef.findUnique({ where: { id: chefId } });
        if (!chef) throw new NotFoundException('CHEF_NOT_FOUND');
        if (chef.deletedAt || chef.isVerified || chef.rejectedAt) {
          throw new ConflictException({ code: 'APPLICATION_NOT_PENDING' });
        }
        const updated = await tx.chef.update({
          where: { id: chefId },
          data: { isVerified: true, verifiedAt: new Date() },
        });
        await this.usersService.setRole(chef.userId, Role.chef, tx);
        await this.notificationsService.create({
          userId: chef.userId,
          type: NotificationType.chef_verified,
          title: { en: 'You are now a Nafas chef', ar: 'أصبحت طاهيًا في نفس' },
          body: {
            en: 'Welcome — your kitchen is live on Nafas.',
            ar: 'مرحبًا، مطبخك الآن متاح على نفس.',
          },
          data: { chefId },
          tx,
        });
        return { chef: updated, userId: chef.userId };
      });
      this.chefEventLogger.verifySuccess({
        actorAdminId: adminId,
        chefId,
        sourceIp,
      });
      try {
        await this.notificationsService.dispatchPush(result.userId, {
          title: 'You are now a Nafas chef',
          body: 'Welcome — your kitchen is live on Nafas.',
          data: { chefId },
        });
      } catch (err) {
        this.logger.error(
          `FCM dispatch failed for verify: ${(err as Error).message}`,
        );
      }
      return result.chef;
    } catch (err) {
      if (err instanceof ConflictException) {
        this.chefEventLogger.verifyApplicationNotPending({
          actorAdminId: adminId,
          chefId,
          sourceIp,
        });
      }
      throw err;
    }
  }

  async rejectApplication(
    adminId: string,
    sourceIp: string,
    chefId: string,
    reason: string,
  ) {
    try {
      const result = await this.prismaService.$transaction(async (tx) => {
        const chef = await tx.chef.findUnique({ where: { id: chefId } });
        if (!chef) throw new NotFoundException('CHEF_NOT_FOUND');
        if (chef.deletedAt || chef.isVerified || chef.rejectedAt) {
          throw new ConflictException({ code: 'APPLICATION_NOT_PENDING' });
        }
        const updated = await tx.chef.update({
          where: { id: chefId },
          data: { rejectedAt: new Date() },
        });
        await this.notificationsService.create({
          userId: chef.userId,
          type: NotificationType.chef_rejected,
          title: {
            en: 'Your chef application was not approved',
            ar: 'لم تتم الموافقة على طلب الانضمام كطاه',
          },
          body: { en: reason, ar: reason }, // spec FR-036 — admin reason verbatim in both slots
          data: { chefId, reason },
          tx,
        });
        return { chef: updated, userId: chef.userId };
      });
      this.chefEventLogger.rejectSuccess({
        actorAdminId: adminId,
        chefId,
        sourceIp,
      });
      try {
        await this.notificationsService.dispatchPush(result.userId, {
          title: 'Your chef application was not approved',
          body: reason,
          data: { chefId, reason },
        });
      } catch (err) {
        this.logger.error(
          `FCM dispatch failed for reject: ${(err as Error).message}`,
        );
      }
      return result.chef;
    } catch (err) {
      if (err instanceof ConflictException) {
        this.chefEventLogger.rejectApplicationNotPending({
          actorAdminId: adminId,
          chefId,
          sourceIp,
        });
      }
      throw err;
    }
  }

  async revokeChef(
    adminId: string,
    sourceIp: string,
    chefId: string,
    reason: string,
  ) {
    try {
      const result = await this.prismaService.$transaction(async (tx) => {
        const chef = await tx.chef.findUnique({ where: { id: chefId } });
        if (!chef) throw new NotFoundException('CHEF_NOT_FOUND');
        if (!chef.isVerified || chef.deletedAt) {
          throw new ConflictException({ code: 'CHEF_NOT_VERIFIED' });
        }
        await tx.chef.update({
          where: { id: chefId },
          data: { deletedAt: new Date(), isVerified: false },
        });
        await this.usersService.setRole(chef.userId, Role.customer, tx);
        await this.notificationsService.create({
          userId: chef.userId,
          type: NotificationType.chef_revoked,
          title: {
            en: 'Your chef status has been revoked',
            ar: 'تم إلغاء صفة الطهي الخاصة بك',
          },
          body: { en: reason, ar: reason },
          data: { chefId, reason },
          tx,
        });
        return { userId: chef.userId };
      });
      this.chefEventLogger.revokeSuccess({
        actorAdminId: adminId,
        chefId,
        sourceIp,
      });
      try {
        await this.notificationsService.dispatchPush(result.userId, {
          title: 'Your chef status has been revoked',
          body: reason,
          data: { chefId, reason },
        });
      } catch (err) {
        this.logger.error(
          `FCM dispatch failed for revoke: ${(err as Error).message}`,
        );
      }
    } catch (err) {
      if (err instanceof ConflictException) {
        this.chefEventLogger.revokeChefNotVerified({
          actorAdminId: adminId,
          chefId,
          sourceIp,
        });
      }
      throw err;
    }
  }
}
