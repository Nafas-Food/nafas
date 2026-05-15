import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePhoneStartDto } from './dto/change-phone-start.dto';
import { ChangePhoneVerifyDto } from './dto/change-phone-verify.dto';
import { FcmTokenDto } from './dto/fcm-token.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Users')
// Class-level: every route on /users currently requires a bearer token.
// If a future route is marked @Public(), move @ApiBearerAuth per-method
// instead so Swagger doesn't draw a misleading lock icon on it.
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Update full name and/or email.' })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 401,
    description: 'Access credential missing, malformed, or expired.',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use (`EMAIL_IN_USE`).',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited (`AUTH_RATE_LIMITED`).',
  })
  async updateProfile(
    @CurrentUser() me: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(me.sub, dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // FR-016 — overrides the global 10/15min default tier (this endpoint dispatches an SMS)
  @Post('me/change-phone/start')
  @HttpCode(204)
  @ApiOperation({ summary: 'Send an OTP to a new phone number.' })
  @ApiResponse({
    status: 204,
    description: 'Verification code dispatched to the new phone.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error or new phone matches current phone (`PHONE_UNCHANGED`).',
  })
  @ApiResponse({
    status: 401,
    description: 'Access credential missing, malformed, or expired.',
  })
  @ApiResponse({
    status: 409,
    description: 'Phone already in use by another account (`PHONE_IN_USE`).',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited (`AUTH_RATE_LIMITED`).',
  })
  async startChangePhone(
    @CurrentUser() me: CurrentUserPayload,
    @Body() dto: ChangePhoneStartDto,
  ) {
    await this.users.startPhoneChange(me.sub, dto.newPhone);
  }

  @Post('me/change-phone/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm the phone change by submitting the OTP.' })
  @ApiResponse({
    status: 200,
    description: 'Phone updated; returns the updated user.',
  })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 401,
    description:
      'Access credential missing/expired or OTP invalid (`AUTH_OTP_INVALID`).',
  })
  @ApiResponse({
    status: 409,
    description:
      'Phone claimed by another account between start and verify (`PHONE_IN_USE`).',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited (`AUTH_RATE_LIMITED`).',
  })
  async verifyChangePhone(
    @CurrentUser() me: CurrentUserPayload,
    @Body() dto: ChangePhoneVerifyDto,
  ) {
    return this.users.verifyPhoneChange(me.sub, dto);
  }

  @Post('me/fcm-token')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Register or replace the device push-notification token.',
  })
  @ApiResponse({ status: 204, description: 'Token stored.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({
    status: 401,
    description: 'Access credential missing, malformed, or expired.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited (`AUTH_RATE_LIMITED`).',
  })
  async registerFcmToken(
    @CurrentUser() me: CurrentUserPayload,
    @Body() dto: FcmTokenDto,
  ) {
    await this.users.registerFcmToken(me.sub, dto.fcmToken);
  }
}
