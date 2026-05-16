import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  HttpCode,
  Ip,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
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
import {
  UpdateChefProfileDto,
  UpdateAvailabilityDto,
} from './dto/update-chef-profile.dto';

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

  @Get('profile')
  @Roles('chef')
  @ApiOperation({ operationId: 'getOwnChefProfile' })
  @ApiResponse({ status: 200, type: ChefPrivateProfileResponseDto })
  getOwnProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.chefsService.findOwnPrivateProfile(user.sub);
  }

  @Patch('profile')
  @Roles('chef')
  @ApiOperation({ operationId: 'updateChefProfile' })
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: UpdateChefProfileDto,
  ) {
    return this.chefsService.updateProfile(user.sub, sourceIp, dto);
  }

  @Patch('availability')
  @Roles('chef')
  @ApiOperation({ operationId: 'toggleChefAvailability' })
  toggleAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.chefsService.toggleOpen(user.sub, sourceIp, dto);
  }

  @Post('logo')
  @Roles('chef')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'replaceChefLogo' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  replaceLogo(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: 'image/(jpeg|png|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.chefsService.replaceLogo(user.sub, sourceIp, file);
  }

  @Post('banner')
  @Roles('chef')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'replaceChefBanner' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  replaceBanner(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: 'image/(jpeg|png|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.chefsService.replaceBanner(user.sub, sourceIp, file);
  }
}
