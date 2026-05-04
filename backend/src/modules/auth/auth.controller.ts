import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { RegisterDto } from './dto/register.dto';
import { SignInDto } from './dto/sign-in.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { Role } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(204)
  @ApiOperation({ summary: 'Request a phone-verification code.' })
  @ApiResponse({
    status: 204,
    description: 'Code dispatched to the verification provider.',
  })
  async sendOtp(@Body() dto: SendOtpDto): Promise<void> {
    await this.auth.sendOtp(dto.phone);
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a customer account after phone-OTP verification.',
  })
  @ApiResponse({ status: 201, description: 'Account created and signed in.' })
  @ApiResponse({
    status: 401,
    description: 'OTP code does not match or has expired.',
  })
  @ApiResponse({ status: 409, description: 'Phone already in use.' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate with phone and password.' })
  @ApiResponse({ status: 200, description: 'Sign-in succeeded.' })
  @ApiResponse({ status: 401, description: 'Credentials invalid (generic).' })
  async signIn(@Body() dto: SignInDto) {
    return this.auth.signIn(dto.phone, dto.password);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotate the refresh credential and mint a new session pair.',
  })
  @ApiResponse({
    status: 200,
    description: 'Rotation succeeded; new pair issued.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Refresh credential failed verification or has been previously used.',
  })
  async refresh(@CurrentUser() payload: CurrentUserPayload) {
    return this.auth.refresh({
      sub: payload.sub,
      role: payload.role as Role,
      jti: payload.jti!,
      exp: payload.exp!,
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the currently authenticated customer.' })
  async getMe(@CurrentUser() payload: CurrentUserPayload) {
    return this.auth.getMe(payload.sub);
  }

  // Phase 7 (T101): @Post('sign-out')
}
