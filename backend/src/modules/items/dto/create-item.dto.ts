import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumberString,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import {
  ItemName60,
  ItemDescription500,
} from '../../menus/dto/bilingual-text.dto';
import { StockInputDto } from './stock-input.dto';

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
  @IsNumberString({ no_symbols: false }, { message: 'ITEM_PRICE_INVALID' })
  price!: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'ITEM_DISCOUNT_INVALID' })
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
