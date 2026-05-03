import { Global, Module } from '@nestjs/common';
import { AdminContextModule } from '../admin-context/admin-context.module';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [AdminContextModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
