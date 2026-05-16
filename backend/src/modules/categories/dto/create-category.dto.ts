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
  @IsString() @Length(1, 80) @ApiProperty() en!: string;
  @IsString() @Length(1, 80) @ApiProperty() ar!: string;
}

export class CreateCategoryDto {
  @ValidateNested()
  @Type(() => CategoryNameDto)
  @ApiProperty({ type: CategoryNameDto })
  name!: CategoryNameDto;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  @ApiProperty({ required: false })
  icon?: string;

  @IsInt()
  @Min(0)
  @ApiProperty({ minimum: 0 })
  displayOrder!: number;
}
