-- Lowercase every enum value to align with the project's casing convention.
-- PostgreSQL 12+ supports ALTER TYPE ... RENAME VALUE inside a transaction,
-- which is the path Prisma migrations run by default.
--
-- The rename is in-place: existing rows that reference each enum value have
-- their stored discriminator updated automatically by Postgres. No row-level
-- UPDATE statements are needed and no data is lost.

ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'admin';
ALTER TYPE "Role" RENAME VALUE 'CUSTOMER' TO 'customer';
ALTER TYPE "Role" RENAME VALUE 'CHEF' TO 'chef';
ALTER TYPE "Role" RENAME VALUE 'DRIVER' TO 'driver';

ALTER TYPE "OrderStatus" RENAME VALUE 'PENDING' TO 'pending';
ALTER TYPE "OrderStatus" RENAME VALUE 'CONFIRMED' TO 'confirmed';
ALTER TYPE "OrderStatus" RENAME VALUE 'PREPARING' TO 'preparing';
ALTER TYPE "OrderStatus" RENAME VALUE 'READY' TO 'ready';
ALTER TYPE "OrderStatus" RENAME VALUE 'ON_THE_WAY' TO 'on_the_way';
ALTER TYPE "OrderStatus" RENAME VALUE 'DELIVERED' TO 'delivered';
ALTER TYPE "OrderStatus" RENAME VALUE 'CANCELLED' TO 'cancelled';

ALTER TYPE "PaymentMethod" RENAME VALUE 'CASH' TO 'cash';
ALTER TYPE "PaymentMethod" RENAME VALUE 'VISA' TO 'visa';
ALTER TYPE "PaymentMethod" RENAME VALUE 'INSTAPAY' TO 'instapay';

ALTER TYPE "TransactionStatus" RENAME VALUE 'PENDING' TO 'pending';
ALTER TYPE "TransactionStatus" RENAME VALUE 'COMPLETED' TO 'completed';
ALTER TYPE "TransactionStatus" RENAME VALUE 'FAILED' TO 'failed';
ALTER TYPE "TransactionStatus" RENAME VALUE 'REFUNDED' TO 'refunded';

ALTER TYPE "DiscountUnit" RENAME VALUE 'FIXED' TO 'fixed';
ALTER TYPE "DiscountUnit" RENAME VALUE 'PERCENT' TO 'percent';

ALTER TYPE "OtpChannel" RENAME VALUE 'SMS' TO 'sms';
ALTER TYPE "OtpChannel" RENAME VALUE 'EMAIL' TO 'email';

ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_PLACED' TO 'order_placed';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_CONFIRMED' TO 'order_confirmed';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_PREPARING' TO 'order_preparing';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_READY' TO 'order_ready';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_ON_THE_WAY' TO 'order_on_the_way';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_DELIVERED' TO 'order_delivered';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_CANCELLED' TO 'order_cancelled';
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_REVIEW' TO 'order_review';
ALTER TYPE "NotificationType" RENAME VALUE 'CHEF_VERIFIED' TO 'chef_verified';
ALTER TYPE "NotificationType" RENAME VALUE 'CHEF_REJECTED' TO 'chef_rejected';
ALTER TYPE "NotificationType" RENAME VALUE 'SYSTEM' TO 'system';

-- Note: column defaults that referenced the old uppercase values (User.role,
-- Order.status, Promotion.discountUnit, Transaction.paymentMethod,
-- Transaction.status) are updated automatically because the enum-value
-- identity is preserved by the rename — the default points to the renamed
-- value, not a literal string.
