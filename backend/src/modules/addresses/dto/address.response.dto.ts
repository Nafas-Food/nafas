import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserAddress } from '@prisma/client';

export class AddressResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() streetName!: string;
  @ApiPropertyOptional({ nullable: true }) building!: string | null;
  @ApiPropertyOptional({ nullable: true }) floor!: string | null;
  @ApiPropertyOptional({ nullable: true }) apartment!: string | null;
  @ApiProperty({
    description: 'Decimal latitude as JS string (Phase 0 convention).',
  })
  latitude!: string;
  @ApiProperty({ description: 'Decimal longitude as JS string.' })
  longitude!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;

  static from(row: UserAddress): AddressResponseDto {
    return {
      id: row.id,
      label: row.label,
      streetName: row.streetName,
      building: row.building,
      floor: row.floor,
      apartment: row.apartment,
      latitude: row.latitude.toString(),
      longitude: row.longitude.toString(),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
