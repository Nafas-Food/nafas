-- DropIndex
DROP INDEX "items_menu_id_idx";

-- DropIndex
DROP INDEX "menus_chef_id_idx";

-- CreateIndex
CREATE INDEX "items_menu_id_is_active_deleted_at_idx" ON "items"("menu_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "items_menu_id_display_order_idx" ON "items"("menu_id", "display_order");

-- CreateIndex
CREATE INDEX "menus_chef_id_display_order_idx" ON "menus"("chef_id", "display_order");
