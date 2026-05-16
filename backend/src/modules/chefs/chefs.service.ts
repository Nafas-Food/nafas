import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChefApplicationService } from './chef-application.service';
import { ChefEventLogger } from '../../common/logging/chef-event.logger';
import { ApplyChefDto } from './dto/apply-chef.dto';
import { ChefPrivateProfileResponseDto } from './dto/chef.response.dto';
import {
  DEFAULT_CHEF_LOGO_URL,
  DEFAULT_CHEF_BANNER_URL,
} from '../../common/storage/chef-defaults';

@Injectable()
export class ChefsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly chefApplicationService: ChefApplicationService,
    private readonly chefEventLogger: ChefEventLogger,
  ) {}

  async apply(
    userId: string,
    sourceIp: string,
    dto: ApplyChefDto,
  ): Promise<ChefPrivateProfileResponseDto> {
    const { existing } =
      await this.chefApplicationService.assertEligibleToApply(userId);

    const data: Prisma.ChefUpdateInput | Prisma.ChefCreateInput = {
      chefName: dto.chefName,
      bio: dto.bio,
      latitude: new Prisma.Decimal(dto.latitude),
      longitude: new Prisma.Decimal(dto.longitude),
      minOrderPrice: new Prisma.Decimal(dto.minOrderPrice),
      isVerified: false,
      verifiedAt: null,
      rejectedAt: null,
      deletedAt: null,
    };

    const chef = existing
      ? await this.prismaService.chef.update({
          where: { id: existing.id },
          data,
        })
      : await this.prismaService.chef.create({
          data: {
            ...(data as Prisma.ChefCreateInput),
            user: { connect: { id: userId } },
            logo: DEFAULT_CHEF_LOGO_URL,
            banner: DEFAULT_CHEF_BANNER_URL,
          },
        });

    this.chefEventLogger.applySuccess({
      actorUserId: userId,
      applicationId: chef.id,
      sourceIp,
    });

    return ChefPrivateProfileResponseDto.fromEntity(chef, []);
  }
}
