import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CategoryNameDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  @ApiProperty({ required: false })
  en?: string;
  @IsOptional()
  @IsString()
  @Length(1, 80)
  @ApiProperty({ required: false })
  ar?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryNameDto)
  @ApiProperty({ type: CategoryNameDto, required: false })
  name?: CategoryNameDto;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  @ApiProperty({ required: false })
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @ApiProperty({ minimum: 0, required: false })
  displayOrder?: number;
}
