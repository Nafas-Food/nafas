import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  ItemName60,
  ItemDescription500,
} from '../../menus/dto/bilingual-text.dto';
import { StockInputDto } from './stock-input.dto';

const DECIMAL_10_2_RE = /^\d{1,8}(\.\d{1,2})?$/;
const POSITIVE_DECIMAL_10_2_RE = /^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/;

export class UpdateItemDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ItemName60)
  name?: InstanceType<typeof ItemName60>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ItemDescription500)
  description?: InstanceType<typeof ItemDescription500>;

  @IsOptional()
  @Matches(POSITIVE_DECIMAL_10_2_RE, { message: 'ITEM_PRICE_INVALID' })
  price?: string;

  @IsOptional()
  @Matches(DECIMAL_10_2_RE, { message: 'ITEM_DISCOUNT_INVALID' })
  discountValue?: string;

  @IsOptional()
  @IsEnum(['fixed', 'percent'], { message: 'ITEM_DISCOUNT_INVALID' })
  discountUnit?: 'fixed' | 'percent';

  @IsOptional()
  @ValidateNested()
  @Type(() => StockInputDto)
  stock?: StockInputDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
