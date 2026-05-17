import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class WebApplyChefDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  fullName!: string;

  @ApiProperty({ example: '+201234567890' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  chefName!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  bio!: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiProperty({ minimum: 0, exclusiveMinimum: true })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  minOrderPrice!: number;
}
