import {
  IsBoolean,
  IsInt,
  Min,
  ValidateIf,
  IsDefined,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Class-level guard for the unlimited branch. When
 * isUnlimitedStock=true, `quantity` MUST be absent
 * (data-model.md "isUnlimitedStock mapping": "`quantity` MUST be
 * absent when isUnlimitedStock=true"). A property-level @IsEmpty
 * on a phantom field cannot enforce this, because the phantom field
 * is never present in incoming payloads — the check has to inspect
 * the sibling `quantity` property at the object level.
 */
@ValidatorConstraint({ name: 'stockUnlimitedHasNoQuantity', async: false })
class StockUnlimitedHasNoQuantityConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const o = args.object as StockInputDto;
    if (o.isUnlimitedStock === true) {
      return o.quantity === undefined;
    }
    return true;
  }
  defaultMessage(): string {
    return 'ITEM_STOCK_AMBIGUOUS';
  }
}

/**
 * Encodes the FR-008 chef-side "unlimited stock" toggle on the wire.
 *
 * Acceptable shapes:
 *   { isUnlimitedStock: true }                  → stored as -1
 *   { isUnlimitedStock: false, quantity: N≥0 }  → stored as N
 *
 * An ambiguous combination (both or neither) refuses with
 * ITEM_STOCK_AMBIGUOUS.
 */
export class StockInputDto {
  @IsBoolean({ message: 'ITEM_STOCK_AMBIGUOUS' })
  @Validate(StockUnlimitedHasNoQuantityConstraint, {
    message: 'ITEM_STOCK_AMBIGUOUS',
  })
  isUnlimitedStock!: boolean;

  /**
   * Required and >= 0 when isUnlimitedStock === false.
   * MUST be absent when isUnlimitedStock === true (enforced by
   * StockUnlimitedHasNoQuantityConstraint on isUnlimitedStock).
   */
  @ValidateIf((o: StockInputDto) => o.isUnlimitedStock === false)
  @IsDefined({ message: 'ITEM_STOCK_AMBIGUOUS' })
  @IsInt({ message: 'ITEM_STOCK_AMBIGUOUS' })
  @Min(0, { message: 'ITEM_STOCK_AMBIGUOUS' })
  quantity?: number;
}

/**
 * Maps the wire shape to the database-internal Item.quantity value.
 * `-1` is the platform-defined unlimited sentinel (Phase 6 stock-
 * decrement honours it). Database-internal — NEVER on the wire.
 */
export function stockInputToDb(stock: StockInputDto): number {
  return stock.isUnlimitedStock ? -1 : (stock.quantity as number);
}

/**
 * Maps a stored Item.quantity value back to the wire shape.
 * Returns { isUnlimitedStock, quantity } where quantity is omitted
 * (undefined) when isUnlimitedStock=true.
 */
export function dbToStockOutput(quantity: number): {
  isUnlimitedStock: boolean;
  quantity?: number;
  inStock: boolean;
} {
  if (quantity === -1) {
    return { isUnlimitedStock: true, inStock: true };
  }
  return { isUnlimitedStock: false, quantity, inStock: quantity > 0 };
}
