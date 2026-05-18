import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ChefsService } from './chefs.service';
import { WebApplyChefDto } from './dto/web-apply-chef.dto';

@ApiTags('ChefApply')
@Controller('chef')
export class ChefWebApplyController {
  constructor(private readonly chefsService: ChefsService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('web-apply')
  @HttpCode(201)
  @ApiOperation({ operationId: 'webApplyToBeAChef' })
  @ApiResponse({ status: 201 })
  async webApply(@Ip() sourceIp: string, @Body() dto: WebApplyChefDto) {
    return this.chefsService.webApply(sourceIp, dto);
  }
}
