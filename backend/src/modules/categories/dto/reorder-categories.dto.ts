import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ReorderItemDto {
  @IsUUID() @ApiProperty({ format: 'uuid' }) id!: string;
  @IsInt() @Min(0) @ApiProperty({ minimum: 0 }) displayOrder!: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: ReorderItemDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  @ApiProperty({ type: [ReorderItemDto] })
  items!: ReorderItemDto[];
}
