/**
 * Stub — fully implemented in Phase 4 User Story 2 (T036).
 * Type-only export so that menus.ts can type `ChefMenu.items`.
 */
export type ChefItem = {
  id: string;
  menuId: string;
  name: { en: string; ar: string };
  description: { en: string; ar: string };
  price: string;
  discountValue: string;
  discountUnit: 'fixed' | 'percent';
  quantity: number;
  isActive: boolean;
  displayOrder: number;
  images: string[];
  createdAt: string;
  updatedAt: string;
};
