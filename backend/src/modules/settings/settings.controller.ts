import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SettingsService } from './settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all public settings as key-value map.' })
  @ApiResponse({ status: 200, description: 'Settings map returned.' })
  async getAll() {
    return this.settings.getPublicAll();
  }

  @Public()
  @Get(':key')
  @ApiOperation({ summary: 'Get a single public setting by key.' })
  @ApiResponse({ status: 200, description: 'Setting value returned.' })
  @ApiResponse({ status: 404, description: 'Setting not found or not public.' })
  async getByKey(@Param('key') key: string) {
    const value = await this.settings.getPublicByKey(key);
    if (value === null) throw new NotFoundException();
    return { key, value };
  }

  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @Patch(':key')
  @ApiOperation({ summary: 'Update or create a setting (admin only).' })
  @ApiResponse({ status: 200, description: 'Setting updated.' })
  async upsert(@Param('key') key: string, @Body() dto: UpsertSettingDto) {
    return this.settings.upsert(key, dto.value);
  }
}
