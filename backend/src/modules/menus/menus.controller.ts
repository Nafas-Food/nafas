import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ChefsService } from '../chefs/chefs.service';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { ReorderMenusDto } from './dto/reorder-menus.dto';
import { AddAvailabilityDto } from './dto/add-availability.dto';
import { ActorContext } from '../../common/actor-context/actor-context.service';

@ApiTags('ChefMenus')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('chef')
// Path is relative to `app.setGlobalPrefix('api/v1')` in main.ts —
// do NOT prefix `/api/v1` here (mirrors ChefsController,
// CategoriesController, AddressesController). The verbatim spec text
// at T022 had the prefix; following it registered the route as
// /api/v1/api/v1/chef/menus and every request 404'd.
@Controller('chef/menus')
export class MenusController {
  constructor(
    private readonly menusService: MenusService,
    private readonly chefsService: ChefsService,
    private readonly actorContext: ActorContext,
  ) {}

  @Get()
  async listOwnMenus(@CurrentUser() user: CurrentUserPayload) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    return this.menusService.findManyForChef(chef.id);
  }

  @Post()
  async createMenu(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: CreateMenuDto,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    return this.actorContext.run(user.sub, sourceIp, () =>
      this.menusService.createMenu(chef.id, dto),
    );
  }

  @Post(':id/availability')
  async addAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id') menuId: string,
    @Body() dto: AddAvailabilityDto,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    await this.actorContext.run(user.sub, sourceIp, () =>
      this.menusService.addAvailability(menuId, chef.id, dto.dayOfWeek),
    );
    return { dayOfWeek: dto.dayOfWeek };
  }

  @Delete(':id/availability/:dayOfWeek')
  @HttpCode(204)
  async removeAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id') menuId: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
  ) {
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new BadRequestException({
        code: 'MENU_AVAILABILITY_INVALID_WEEKDAY',
      });
    }
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    await this.actorContext.run(user.sub, sourceIp, () =>
      this.menusService.removeAvailability(menuId, chef.id, dayOfWeek),
    );
  }

  // CRITICAL: @Patch('reorder') MUST be declared before @Patch(':id') so
  // the router matches the literal string 'reorder' rather than treating
  // it as a UUID path param.
  @Patch('reorder')
  @HttpCode(204)
  async reorderMenus(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Body() dto: ReorderMenusDto,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    await this.actorContext.run(user.sub, sourceIp, () =>
      this.menusService.reorderMenus(chef.id, dto.menuIds),
    );
  }

  @Patch(':id')
  async updateMenu(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id') menuId: string,
    @Body() dto: UpdateMenuDto,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    return this.actorContext.run(user.sub, sourceIp, () =>
      this.menusService.updateMenu(menuId, chef.id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async softDeleteMenu(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id') menuId: string,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    await this.actorContext.run(user.sub, sourceIp, () =>
      this.menusService.softDeleteMenu(menuId, chef.id),
    );
  }
}
