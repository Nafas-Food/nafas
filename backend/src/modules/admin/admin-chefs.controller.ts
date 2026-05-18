import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { RejectApplicationDto } from './dto/reject-application.dto';
import { RevokeChefDto } from './dto/revoke-chef.dto';

// Verify and reject are admin-moderation actions — tight 3/min/IP cap so
// a compromised admin token can't blast through the pending queue. Tests
// (NODE_ENV=test) get a 1M cap so the e2e suite isn't rate-limited.
const MOD_THROTTLE = {
  default: {
    limit: process.env.NODE_ENV === 'test' ? 1_000_000 : 3,
    ttl: 60_000,
  },
};

@ApiTags('AdminChefs')
@ApiBearerAuth()
@Controller('admin/chefs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminChefsController {
  constructor(private readonly adminService: AdminService) {}

  @Get('pending')
  @ApiOperation({ operationId: 'listPendingApplications' })
  listPending(
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor = 0,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 30,
  ) {
    return this.adminService.listPendingApplications(
      Math.max(0, cursor),
      Math.max(1, Math.min(pageSize, 50)),
    );
  }

  @Get()
  @ApiOperation({ operationId: 'listVerifiedChefs' })
  listVerified(
    @Query('q') q?: string,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor = 0,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 30,
  ) {
    return this.adminService.listVerifiedChefs(
      Math.max(0, cursor),
      Math.max(1, Math.min(pageSize, 50)),
      q,
    );
  }

  @Patch(':id/verify')
  @Throttle(MOD_THROTTLE)
  @ApiOperation({ operationId: 'verifyChef' })
  verify(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id', new ParseUUIDPipe()) chefId: string,
  ) {
    return this.adminService.verifyApplication(admin.sub, sourceIp, chefId);
  }

  @Patch(':id/reject')
  @Throttle(MOD_THROTTLE)
  @ApiOperation({ operationId: 'rejectChefApplication' })
  reject(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id', new ParseUUIDPipe()) chefId: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.adminService.rejectApplication(
      admin.sub,
      sourceIp,
      chefId,
      dto.reason,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle(MOD_THROTTLE)
  @ApiOperation({ operationId: 'revokeChef' })
  revoke(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id', new ParseUUIDPipe()) chefId: string,
    @Body() dto: RevokeChefDto,
  ) {
    return this.adminService.revokeChef(
      admin.sub,
      sourceIp,
      chefId,
      dto.reason,
    );
  }
}
