import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ChefThrottlerGuard } from '../../common/guards/chef-throttler.guard';
import { ActorContext } from '../../common/actor-context/actor-context.service';
import { ChefsService } from '../chefs/chefs.service';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';

@ApiTags('ChefItems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('chef')
@Controller('chef')
export class ItemsController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly chefsService: ChefsService,
    private readonly actorContext: ActorContext,
  ) {}

  @Get('menus/:menuId/items')
  async listItems(
    @CurrentUser() user: CurrentUserPayload,
    @Param('menuId') menuId: string,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    return this.itemsService.findManyForChef(menuId, chef.id);
  }

  @Post('menus/:menuId/items')
  async createItem(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('menuId') menuId: string,
    @Body() dto: CreateItemDto,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    return this.actorContext.run(user.sub, sourceIp, () =>
      this.itemsService.createItem(menuId, chef.id, dto),
    );
  }

  /**
   * FR-012b: per-chef throttle (20 / 60 s). ChefThrottlerGuard
   * (declared in @UseGuards below) overrides the default
   * getTracker to key on req.user.sub (== chef id, per Phase 3 R1).
   * The Phase 1 single-`default`-tier rule is preserved — the
   * @Throttle decorator overrides the same `default` tier's
   * limits per-route, no second tier is introduced.
   *
   * Guard order matters: JwtAuthGuard populates req.user BEFORE
   * ChefThrottlerGuard consults it. The global IP-keyed
   * ThrottlerGuard from Phase 1 also fires and applies the same
   * 20/60s cap by IP — the per-IP backstop is preserved.
   */
  @UseGuards(JwtAuthGuard, ChefThrottlerGuard, RolesGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('items/:id/images')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() sourceIp: string,
    @Param('id') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const chef = await this.chefsService.findOwnedOrThrow(user.sub);
    return this.actorContext.run(user.sub, sourceIp, () =>
      this.itemsService.appendImage(
        itemId,
        chef.id,
        file.buffer,
        file.mimetype,
      ),
    );
  }
}
