import { api } from './api';

export type BilingualText = { en: string; ar: string };
export interface ChefItem {
  id: string;
  menuId: string;
  name: BilingualText;
  description: BilingualText;
  price: string;
  effectivePrice: string;
  discountValue: string;
  discountUnit: 'fixed' | 'percent';
  isUnlimitedStock: boolean;
  quantity?: number;
  inStock: boolean;
  images: string[];
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const itemsService = {
  listForMenu: (menuId: string) =>
    api.get<ChefItem[]>(`/chef/menus/${menuId}/items`).then((r) => r.data),
  create: (
    menuId: string,
    body: {
      name: BilingualText;
      description: BilingualText;
      price: string;
      discountValue?: string;
      discountUnit?: 'fixed' | 'percent';
      stock: { isUnlimitedStock: true } | { isUnlimitedStock: false; quantity: number };
      isActive?: boolean;
    },
  ) => api.post<ChefItem>(`/chef/menus/${menuId}/items`, body).then((r) => r.data),
  uploadImage: async (itemId: string, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('file', file as any);
    // services/api.ts swaps Content-Type to multipart/form-data when
    // cfg.data instanceof FormData (Phase 3 convention) — do NOT set
    // headers manually here.
    const res = await api.post<ChefItem>(`/chef/items/${itemId}/images`, form);
    return res.data;
  },
};
