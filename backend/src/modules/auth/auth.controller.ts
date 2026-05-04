import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(204)
  @ApiOperation({ summary: 'Request a phone-verification code.' })
  @ApiResponse({ status: 204, description: 'Code dispatched to the verification provider.' })
  async sendOtp(@Body() dto: SendOtpDto): Promise<void> {
    await this.auth.sendOtp(dto.phone);
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a customer account after phone-OTP verification.' })
  @ApiResponse({ status: 201, description: 'Account created and signed in.' })
  @ApiResponse({ status: 401, description: 'OTP code does not match or has expired.' })
  @ApiResponse({ status: 409, description: 'Phone already in use.' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // Phase 4 (T061): @Post('sign-in')
  // Phase 5 (T071): @Post('refresh')
  // Phase 5 (T073): @Get('me')
  // Phase 7 (T101): @Post('sign-out')
}