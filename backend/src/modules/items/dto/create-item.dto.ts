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

/** Matches non-negative decimal strings up to 8 digits before and 2 after the point. */
const DECIMAL_10_2_RE = /^\d{1,8}(\.\d{1,2})?$/;
/** Same as DECIMAL_10_2_RE but rejects pure-zero values ("0", "0.0", "0.00", …). */
const POSITIVE_DECIMAL_10_2_RE = /^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/;

export class CreateItemDto {
  @ValidateNested()
  @Type(() => ItemName60)
  name!: InstanceType<typeof ItemName60>;

  @ValidateNested()
  @Type(() => ItemDescription500)
  description!: InstanceType<typeof ItemDescription500>;

  /**
   * Decimal string with up to 2 decimal places, > 0. The service
   * converts to a Decimal before any math.
   */
  @Matches(POSITIVE_DECIMAL_10_2_RE, { message: 'ITEM_PRICE_INVALID' })
  price!: string;

  @IsOptional()
  @Matches(DECIMAL_10_2_RE, { message: 'ITEM_DISCOUNT_INVALID' })
  discountValue?: string;

  @IsOptional()
  @IsEnum(['fixed', 'percent'], { message: 'ITEM_DISCOUNT_INVALID' })
  discountUnit?: 'fixed' | 'percent';

  @ValidateNested()
  @Type(() => StockInputDto)
  stock!: StockInputDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
