import { ApiProperty } from '@nestjs/swagger';

export class ChefPrivateProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  chefName!: string;

  @ApiProperty()
  bio!: string;

  @ApiProperty()
  logo!: string;

  @ApiProperty()
  banner!: string;

  @ApiProperty()
  isOpen!: boolean;

  @ApiProperty({ description: 'Decimal stringified' })
  ratings!: string;

  @ApiProperty()
  totalReviews!: number;

  @ApiProperty({ description: 'Decimal stringified' })
  minOrderPrice!: string;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  verifiedAt!: string | null;

  @ApiProperty({ description: 'Decimal stringified' })
  latitude!: string;

  @ApiProperty({ description: 'Decimal stringified' })
  longitude!: string;

  @ApiProperty({ type: [String] })
  categoryIds!: string[];

  static fromEntity(
    chef: {
      id: string;
      chefName: string;
      bio: string | null;
      logo: string;
      banner: string;
      isOpen: boolean;
      ratings: { toString(): string } | null;
      totalReviews: number;
      minOrderPrice: { toString(): string } | null;
      verifiedAt: Date | null;
      latitude: { toString(): string } | null;
      longitude: { toString(): string } | null;
    },
    categoryIds: string[],
  ): ChefPrivateProfileResponseDto {
    return {
      id: chef.id,
      chefName: chef.chefName,
      bio: chef.bio ?? '',
      logo: chef.logo,
      banner: chef.banner,
      isOpen: chef.isOpen,
      ratings: chef.ratings?.toString() ?? '0',
      totalReviews: chef.totalReviews,
      minOrderPrice: chef.minOrderPrice?.toString() ?? '0',
      verifiedAt: chef.verifiedAt ? chef.verifiedAt.toISOString() : null,
      latitude: chef.latitude?.toString() ?? '0',
      longitude: chef.longitude?.toString() ?? '0',
      categoryIds,
    };
  }
}
