import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CategoriesService } from './categories.service';
import { CategoryEventLogger } from '../../common/logging/category-event.logger';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly categoryEventLogger: CategoryEventLogger,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'createCategory' })
  async create(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: CreateCategoryDto,
  ) {
    const created = await this.categoriesService.create(dto);
    this.categoryEventLogger.createSuccess({
      actorAdminId: admin.sub,
      categoryId: created.id,
      sourceIp,
    });
    return created;
  }

  // NOTE: this MUST stay above `@Patch(':id')`. NestJS resolves routes
  // in declaration order, so a `:id` route declared first would catch
  // `/reorder` and feed it to ParseUUIDPipe → 400.
  @Patch('reorder')
  @ApiOperation({ operationId: 'reorderCategories' })
  async reorder(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: ReorderCategoriesDto,
  ) {
    const result = await this.categoriesService.reorder(dto.items);
    this.categoryEventLogger.reorderSuccess({
      actorAdminId: admin.sub,
      itemsCount: dto.items.length,
      sourceIp,
    });
    return result;
  }

  @Patch(':id')
  @ApiOperation({ operationId: 'updateCategory' })
  async update(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const updated = await this.categoriesService.update(id, dto);
    this.categoryEventLogger.updateSuccess({
      actorAdminId: admin.sub,
      categoryId: id,
      sourceIp,
    });
    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'softDeleteCategory' })
  async remove(
    @CurrentUser() admin: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.categoriesService.softDelete(id);
    this.categoryEventLogger.deleteSuccess({
      actorAdminId: admin.sub,
      categoryId: id,
      sourceIp,
    });
  }
}
