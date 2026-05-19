import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LoggingModule } from '../../common/logging/logging.module';
import { MenusModule } from '../menus/menus.module';
import { ItemsModule } from '../items/items.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ChefsController } from './chefs.controller';
import { ChefsDiscoveryController } from './chefs-discovery.controller';
import { ChefWebApplyController } from './chef-web-apply.controller';
import { ChefsService } from './chefs.service';
import { ChefApplicationService } from './chef-application.service';

@Module({
  imports: [
    PrismaModule,
    LoggingModule,
    forwardRef(() => MenusModule),
    forwardRef(() => ItemsModule),
    StorageModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [
    ChefsController,
    ChefsDiscoveryController,
    ChefWebApplyController,
  ],
  providers: [ChefsService, ChefApplicationService],
  exports: [ChefsService, ChefApplicationService],
})
export class ChefsModule {}
