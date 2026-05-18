import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, Chef, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChefApplicationService } from './chef-application.service';
import { ChefEventLogger } from '../../common/logging/chef-event.logger';
import { ApplyChefDto } from './dto/apply-chef.dto';
import { WebApplyChefDto } from './dto/web-apply-chef.dto';
import {
  ChefCardResponseDto,
  ChefPrivateProfileResponseDto,
  ChefPublicProfileResponseDto,
} from './dto/chef.response.dto';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';
import {
  UpdateChefProfileDto,
  UpdateAvailabilityDto,
} from './dto/update-chef-profile.dto';
import { MenusService } from '../menus/menus.service';
import { StorageService } from '../storage/storage.service';
import { haversineKm } from './haversine';
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
    private readonly menusService: MenusService,
    private readonly storageService: StorageService,
  ) {}

  private readonly ACCEPTED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  private readonly MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  /** Single-find ownership shape per Phase 2 R4 — returns 404 NotFoundException when the chef is not owned by `userId`. */
  async findOwnedOrThrow(userId: string): Promise<Chef> {
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { userId, isVerified: true },
    });
    if (!chef) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    return chef;
  }

  async updateProfile(
    userId: string,
    sourceIp: string,
    dto: UpdateChefProfileDto,
  ): Promise<ChefPrivateProfileResponseDto> {
    const chef = await this.findOwnedOrThrow(userId);
    const updated = await this.prismaService.chef.update({
      where: { id: chef.id },
      data: {
        ...(dto.chefName !== undefined ? { chefName: dto.chefName } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.latitude !== undefined
          ? { latitude: new Prisma.Decimal(dto.latitude) }
          : {}),
        ...(dto.longitude !== undefined
          ? { longitude: new Prisma.Decimal(dto.longitude) }
          : {}),
        ...(dto.minOrderPrice !== undefined
          ? { minOrderPrice: new Prisma.Decimal(dto.minOrderPrice) }
          : {}),
      },
    });
    this.chefEventLogger.profileUpdateSuccess({
      actorChefId: userId,
      chefId: updated.id,
      sourceIp,
    });
    const categoryIds = await this.menusService.categoriesForChef(updated.id);
    return ChefPrivateProfileResponseDto.fromEntity(updated, categoryIds);
  }

  async toggleOpen(
    userId: string,
    sourceIp: string,
    dto: UpdateAvailabilityDto,
  ): Promise<ChefPrivateProfileResponseDto> {
    const chef = await this.findOwnedOrThrow(userId);
    const updated = await this.prismaService.chef.update({
      where: { id: chef.id },
      data: { isOpen: dto.isOpen },
    });
    this.chefEventLogger.availabilityToggleSuccess({
      actorChefId: userId,
      chefId: updated.id,
      isOpen: dto.isOpen,
      sourceIp,
    });
    const categoryIds = await this.menusService.categoriesForChef(updated.id);
    return ChefPrivateProfileResponseDto.fromEntity(updated, categoryIds);
  }

  async replaceLogo(
    userId: string,
    sourceIp: string,
    file: { mimetype: string; size: number; buffer: Buffer },
  ): Promise<ChefPrivateProfileResponseDto> {
    return this.replaceChefImage(userId, sourceIp, file, 'logo');
  }

  async replaceBanner(
    userId: string,
    sourceIp: string,
    file: { mimetype: string; size: number; buffer: Buffer },
  ): Promise<ChefPrivateProfileResponseDto> {
    return this.replaceChefImage(userId, sourceIp, file, 'banner');
  }

  private async replaceChefImage(
    userId: string,
    sourceIp: string,
    file: { mimetype: string; size: number; buffer: Buffer },
    kind: 'logo' | 'banner',
  ): Promise<ChefPrivateProfileResponseDto> {
    const event = kind === 'logo' ? 'logoUpload' : 'bannerUpload';
    if (!this.ACCEPTED_IMAGE_MIMES.has(file.mimetype)) {
      this.chefEventLogger[`${event}UnsupportedMediaType`]({
        actorChefId: userId,
        mimeType: file.mimetype,
        sourceIp,
      });
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }
    if (file.size > this.MAX_IMAGE_BYTES) {
      this.chefEventLogger[`${event}PayloadTooLarge`]({
        actorChefId: userId,
        byteSize: file.size,
        sourceIp,
      });
      throw new PayloadTooLargeException({ code: 'PAYLOAD_TOO_LARGE' });
    }
    const chef = await this.findOwnedOrThrow(userId);
    const bucket = kind === 'logo' ? 'chef-logos' : 'chef-banners';
    const ext =
      file.mimetype === 'image/jpeg'
        ? 'jpg'
        : file.mimetype === 'image/png'
          ? 'png'
          : 'webp';
    const path = `${chef.id}/${Date.now()}.${ext}`;
    const publicUrl = await this.storageService.upload(
      bucket,
      path,
      file.buffer,
      file.mimetype,
    );

    const updated = await this.prismaService.chef.update({
      where: { id: chef.id },
      data: kind === 'logo' ? { logo: publicUrl } : { banner: publicUrl },
    });
    this.chefEventLogger[`${event}Success`]({
      actorChefId: userId,
      chefId: updated.id,
      sourceIp,
    });
    const categoryIds = await this.menusService.categoriesForChef(updated.id);
    return ChefPrivateProfileResponseDto.fromEntity(updated, categoryIds);
  }

  async apply(
    userId: string,
    sourceIp: string,
    dto: ApplyChefDto,
  ): Promise<ChefPrivateProfileResponseDto> {
    const { existing } =
      await this.chefApplicationService.assertEligibleToApply(userId);

    // Location is deferred to the post-verification "set kitchen
    // location" mobile flow — apply substitutes (0, 0) as the "unset"
    // sentinel when the client doesn't supply coordinates. The chef
    // (chef)/_layout.tsx route guard treats lat=0 AND lng=0 as a signal
    // to force the set-location screen on first sign-in after verify.
    const data: Prisma.ChefUpdateInput | Prisma.ChefCreateInput = {
      chefName: dto.chefName,
      bio: dto.bio,
      latitude: new Prisma.Decimal(dto.latitude ?? 0),
      longitude: new Prisma.Decimal(dto.longitude ?? 0),
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

  /**
   * Public web chef-apply flow (admin panel) — creates a customer user
   * AND a pending chef application in a single transaction. Skips OTP;
   * the admin verifies the chef from the dashboard afterwards.
   */
  async webApply(
    sourceIp: string,
    dto: WebApplyChefDto,
  ): Promise<{ applicationId: string }> {
    if (dto.email) {
      const existingEmail = await this.prismaService.extended.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException({
          code: 'EMAIL_IN_USE',
          message: 'Email is already in use.',
        });
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const chef = await this.prismaService.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            fullName: dto.fullName,
            phone: dto.phone,
            email: dto.email ?? null,
            passwordHash,
            phoneVerified: false,
            role: Role.customer,
          },
        });
        return tx.chef.create({
          data: {
            chefName: dto.chefName,
            bio: dto.bio,
            // (0, 0) sentinel — chef sets real coords post-verification
            // via the mobile (chef)/set-location screen.
            latitude: new Prisma.Decimal(dto.latitude ?? 0),
            longitude: new Prisma.Decimal(dto.longitude ?? 0),
            minOrderPrice: new Prisma.Decimal(dto.minOrderPrice),
            isVerified: false,
            logo: DEFAULT_CHEF_LOGO_URL,
            banner: DEFAULT_CHEF_BANNER_URL,
            user: { connect: { id: user.id } },
          },
        });
      });

      this.chefEventLogger.applySuccess({
        actorUserId: chef.userId,
        applicationId: chef.id,
        sourceIp,
      });

      return { applicationId: chef.id };
    } catch (err) {
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e.code === 'P2002') {
        if (e.meta?.target?.includes('phone')) {
          throw new ConflictException({
            code: 'PHONE_IN_USE',
            message: 'Phone is already in use.',
          });
        }
        if (e.meta?.target?.includes('email')) {
          throw new ConflictException({
            code: 'EMAIL_IN_USE',
            message: 'Email is already in use.',
          });
        }
      }
      throw err;
    }
  }

  async findManyForDiscovery(
    query: DiscoveryQueryDto,
  ): Promise<ChefCardResponseDto[]> {
    const pageSize = query.pageSize ?? 30;
    const cursor = query.cursor ?? 0;

    const where: Prisma.ChefWhereInput = { isVerified: true };

    if (query.categoryId) {
      const chefIds = await this.menusService.chefIdsInCategory(
        query.categoryId,
      );
      if (chefIds.length === 0) return [];
      where.id = { in: chefIds };
    }
    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      where.OR = [
        { chefName: { contains: term, mode: 'insensitive' } },
        { bio: { contains: term, mode: 'insensitive' } },
      ];
    }

    let radiusKm: number | null = null;
    if (query.lat !== undefined && query.lng !== undefined) {
      radiusKm = Math.min(query.radiusKm ?? 15, 50);
      const latOffset = radiusKm / 111;
      const lngOffset =
        radiusKm / (111 * Math.cos((query.lat * Math.PI) / 180));
      where.latitude = {
        gte: query.lat - latOffset,
        lte: query.lat + latOffset,
      } as unknown as Prisma.DecimalFilter;
      where.longitude = {
        gte: query.lng - lngOffset,
        lte: query.lng + lngOffset,
      } as unknown as Prisma.DecimalFilter;
    }

    const candidates = await this.prismaService.extended.chef.findMany({
      where,
      orderBy:
        radiusKm === null
          ? [{ isOpen: 'desc' }, { verifiedAt: 'desc' }]
          : undefined,
      skip: cursor,
      take: pageSize,
    });

    if (radiusKm === null) {
      return candidates.map((c) => ChefCardResponseDto.fromEntity(c));
    }

    const withDistance = candidates
      .map((c) => ({
        chef: c,
        distanceKm: haversineKm(
          query.lat!,
          query.lng!,
          Number(c.latitude),
          Number(c.longitude),
        ),
      }))
      .filter((x) => x.distanceKm <= radiusKm!)
      .sort((a, b) => {
        if (a.chef.isOpen !== b.chef.isOpen) return a.chef.isOpen ? -1 : 1;
        return a.distanceKm - b.distanceKm;
      });

    return withDistance.map((x) =>
      ChefCardResponseDto.fromEntity(x.chef, undefined, x.distanceKm),
    );
  }

  async findPublicProfile(
    chefId: string,
  ): Promise<ChefPublicProfileResponseDto> {
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { id: chefId, isVerified: true },
    });
    if (!chef) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    const categoryIds = await this.menusService.categoriesForChef(chefId);
    return ChefPublicProfileResponseDto.fromEntity(chef, categoryIds);
  }

  async findReviewsForChef(chefId: string, _cursor = 0, _pageSize = 20) {
    // Phase 7 will replace this stub and consume _cursor / _pageSize.
    // For Phase 3, just confirm the chef exists then return [].
    const chef = await this.prismaService.extended.chef.findFirst({
      where: { id: chefId, isVerified: true },
      select: { id: true },
    });
    if (!chef) throw new NotFoundException({ code: 'CHEF_NOT_FOUND' });
    return [] as Array<{
      id: string;
      userFullName: string;
      rating: number;
      body: string;
      images: string[];
      createdAt: string;
    }>;
  }

  /**
   * Chef-self read used by the mobile editor to populate the form on
   * mount. Returns the private profile shape (lat/lng + categoryIds).
   * Spec T056/T059 implicitly requires this read but the task list
   * never names the endpoint — without it, the editor screen has no
   * way to display the chef's existing data on cold start.
   */
  async findOwnPrivateProfile(
    userId: string,
  ): Promise<ChefPrivateProfileResponseDto> {
    const chef = await this.findOwnedOrThrow(userId);
    const categoryIds = await this.menusService.categoriesForChef(chef.id);
    return ChefPrivateProfileResponseDto.fromEntity(chef, categoryIds);
  }

  /**
   * Top-rated grid query for the Home surface (FR-022).
   * Sorts by (ratings DESC, verifiedAt DESC, id ASC) so the
   * tiebreaker is deterministic. Until Phase 7 wires reviews, every
   * chef's rating is 0 and the order collapses to verified-newest-first.
   */
  async findTopRated(limit = 12): Promise<Chef[]> {
    return this.prismaService.extended.chef.findMany({
      where: { isVerified: true },
      orderBy: [{ ratings: 'desc' }, { verifiedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
  }
}
