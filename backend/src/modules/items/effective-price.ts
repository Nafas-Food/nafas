import Decimal from 'decimal.js';

/**
 * Server-authoritative effective sell price for an item (FR-016).
 *
 * Consumed by:
 *   - items.service (returned alongside base price on every read)
 *   - Phase 5 cart subtotal computation
 *   - Phase 6 OrderItem.price snapshot at order creation
 *
 * NEVER computed on the client (Constitution Principle II).
 *
 * Exported as a PURE FUNCTION (not a service method) so that
 * cart.service and orders.service can import it without forcing
 * a forwardRef circular dep through items.module. See
 * plan.md "Complexity Tracking" for the rationale.
 */
export function effectivePrice(item: {
  price: Decimal | string | number;
  discountValue: Decimal | string | number;
  discountUnit: 'fixed' | 'percent';
}): Decimal {
  const base = new Decimal(item.price as Decimal.Value);
  const discount = new Decimal(item.discountValue as Decimal.Value);
  if (item.discountUnit === 'fixed') {
    return Decimal.max(base.minus(discount), 0);
  }
  // percent
  const factor = new Decimal(1).minus(discount.div(100));
  return Decimal.max(base.times(factor), 0);
}
