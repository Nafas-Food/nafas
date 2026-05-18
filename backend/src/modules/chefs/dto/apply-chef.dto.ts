import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyChefDto {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  chefName!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  bio!: string;

  // Latitude/longitude are deferred to the post-verification "set kitchen
  // location" flow on mobile. Apply accepts them if supplied but doesn't
  // require them — the service substitutes (0, 0) as the "unset" sentinel.
  // They must be provided as an all-or-none pair.
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @ValidateIf((o: ApplyChefDto) => o.latitude !== undefined || o.longitude !== undefined)
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @ValidateIf((o: ApplyChefDto) => o.latitude !== undefined || o.longitude !== undefined)
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiProperty({
    minimum: 0,
    exclusiveMinimum: true,
    description: 'Decimal with up to 2 places. Example: 50.00',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  minOrderPrice!: number;
}
