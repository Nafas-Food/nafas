import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateChefProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  @ApiProperty({ required: false })
  chefName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  @ApiProperty({ required: false })
  bio?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  @ApiProperty({ required: false })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  @ApiProperty({ required: false })
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @ApiProperty({ required: false })
  minOrderPrice?: number;
}

export class UpdateAvailabilityDto {
  @IsBoolean()
  @ApiProperty()
  isOpen!: boolean;
}
