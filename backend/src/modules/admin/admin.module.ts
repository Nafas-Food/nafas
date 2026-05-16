import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LoggingModule } from '../../common/logging/logging.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminChefsController } from './admin-chefs.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PrismaModule, LoggingModule, UsersModule, NotificationsModule],
  controllers: [AdminChefsController],
  providers: [AdminService],
})
export class AdminModule {}
