import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LoggingModule } from '../../common/logging/logging.module';
import { MenusModule } from '../menus/menus.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ChefsController } from './chefs.controller';
import { ChefsService } from './chefs.service';
import { ChefApplicationService } from './chef-application.service';

@Module({
  imports: [
    PrismaModule,
    LoggingModule,
    MenusModule,
    StorageModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [ChefsController],
  providers: [ChefsService, ChefApplicationService],
  exports: [ChefsService, ChefApplicationService],
})
export class ChefsModule {}
