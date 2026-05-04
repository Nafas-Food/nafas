import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Phase 6 (T081): @Patch('me') updateProfile
  // Phase 6 (T083): @Post('me/change-phone/start') startChangePhone
  // Phase 6 (T085): @Post('me/change-phone/verify') verifyChangePhone
  // Phase 6 (T087): @Post('me/fcm-token') registerFcmToken
}