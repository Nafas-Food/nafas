import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { FcmService } from './fcm.service';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, FcmService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
