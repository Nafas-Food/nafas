import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChefsService } from './chefs.service';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';

@ApiTags('Discovery')
@ApiBearerAuth()
@Controller('chefs')
@UseGuards(JwtAuthGuard)
export class ChefsDiscoveryController {
  constructor(private readonly chefsService: ChefsService) {}

  @Get()
  @ApiOperation({ operationId: 'discoverChefs' })
  discover(@Query() query: DiscoveryQueryDto) {
    return this.chefsService.findManyForDiscovery(query);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getChefPublicProfile' })
  publicProfile(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.chefsService.findFullProfile(id);
  }

  @Get(':id/reviews')
  @ApiOperation({ operationId: 'getChefReviews' })
  reviews(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor = 0,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20,
  ) {
    return this.chefsService.findReviewsForChef(
      id,
      cursor,
      Math.min(pageSize, 50),
    );
  }
}
