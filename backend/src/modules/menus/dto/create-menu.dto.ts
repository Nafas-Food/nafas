import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  ArrayUnique,
} from 'class-validator';
import { MenuName60 } from './bilingual-text.dto';

export class CreateMenuDto {
  @ValidateNested()
  @Type(() => MenuName60)
  name!: InstanceType<typeof MenuName60>;

  @IsUUID('4', { message: 'CATEGORY_NOT_FOUND' })
  categoryId!: string;

  @IsBoolean()
  availableAllDays!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique({ message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  @IsInt({ each: true, message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  @Min(0, { each: true, message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  @Max(6, { each: true, message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  initialAvailability?: number[];
}
