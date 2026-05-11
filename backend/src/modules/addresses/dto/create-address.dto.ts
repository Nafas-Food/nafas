import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({ minLength: 1, maxLength: 80, example: 'home' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 80)
  label!: string;

  @ApiProperty({ minLength: 0, maxLength: 200 })
  @IsString()
  @Length(0, 200)
  streetName!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(0, 80)
  building?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  floor?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  apartment?: string;

  @ApiProperty({ minimum: -90, maximum: 90, example: 30.0444 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: 31.2357 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
