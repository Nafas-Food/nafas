import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { TwilioModule } from '../twilio/twilio.module';

@Module({
  imports: [PrismaModule, TwilioModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
