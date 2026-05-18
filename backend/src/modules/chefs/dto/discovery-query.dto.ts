import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class DiscoveryQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;

  @ValidateIf((o: DiscoveryQueryDto) => o.lng !== undefined)
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ValidateIf((o: DiscoveryQueryDto) => o.lat !== undefined)
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ValidateIf(
    (o: DiscoveryQueryDto) => o.lat !== undefined && o.lng !== undefined,
  )
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  radiusKm?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
