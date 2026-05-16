import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MenusService } from './menus.service';

@Module({
  imports: [PrismaModule],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
