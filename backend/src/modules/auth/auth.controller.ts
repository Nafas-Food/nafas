import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Phase 3 (T047): @Post('send-otp') sendOtp
  // Phase 3 (T050): @Post('register') register
  // Phase 4 (T061): @Post('sign-in') signIn
  // Phase 5 (T071): @Post('refresh') refresh
  // Phase 5 (T073): @Get('me') getMe
  // Phase 7 (T101): @Post('sign-out') signOut
}