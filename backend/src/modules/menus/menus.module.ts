import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ChefsModule } from '../chefs/chefs.module';
import { CategoriesModule } from '../categories/categories.module';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => ChefsModule), CategoriesModule],
  providers: [MenusService],
  controllers: [MenusController],
  exports: [MenusService],
})
export class MenusModule {}
