import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ChefsModule } from '../chefs/chefs.module';
import { MenusModule } from '../menus/menus.module';
import { StorageModule } from '../storage/storage.module';
import { LoggingModule } from '../../common/logging/logging.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ChefsModule),
    forwardRef(() => MenusModule),
    StorageModule,
    LoggingModule,
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
