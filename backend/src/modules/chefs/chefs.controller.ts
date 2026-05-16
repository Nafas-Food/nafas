import {
  Body,
  Controller,
  HttpCode,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ChefsService } from './chefs.service';
import { ApplyChefDto } from './dto/apply-chef.dto';
import { ChefPrivateProfileResponseDto } from './dto/chef.response.dto';

@ApiTags('ChefApply')
@ApiBearerAuth()
@Controller('chef')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChefsController {
  constructor(private readonly chefsService: ChefsService) {}

  @Post('apply')
  @HttpCode(201)
  @Roles('customer')
  @ApiOperation({ operationId: 'applyToBeAChef' })
  @ApiResponse({ status: 201, type: ChefPrivateProfileResponseDto })
  async apply(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: ApplyChefDto,
  ) {
    return this.chefsService.apply(user.sub, sourceIp, dto);
  }
}
