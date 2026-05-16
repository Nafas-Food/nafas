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
      cursor,
      Math.min(pageSize, 50),
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
      cursor,
      Math.min(pageSize, 50),
      q,
    );
  }

  @Patch(':id/verify')
  @ApiOperation({ operationId: 'verifyChef' })
  verify(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id', new ParseUUIDPipe()) chefId: string,
  ) {
    return this.adminService.verifyApplication(admin.sub, sourceIp, chefId);
  }

  @Patch(':id/reject')
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
