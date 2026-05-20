import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { MenuName60 } from './bilingual-text.dto';

export class UpdateMenuDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuName60)
  name?: InstanceType<typeof MenuName60>;

  @IsOptional()
  @IsUUID('4', { message: 'CATEGORY_NOT_FOUND' })
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  availableAllDays?: boolean;
}
