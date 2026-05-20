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
  update: (
    itemId: string,
    body: Partial<{
      name: BilingualText;
      description: BilingualText;
      price: string;
      discountValue: string;
      discountUnit: 'fixed' | 'percent';
      stock: { isUnlimitedStock: true } | { isUnlimitedStock: false; quantity: number };
      isActive: boolean;
    }>,
  ) => api.patch<ChefItem>(`/chef/items/${itemId}`, body).then((r) => r.data),
  remove: (itemId: string) => api.delete<void>(`/chef/items/${itemId}`),
  reorder: (menuId: string, itemIds: string[]) =>
    api.patch<void>(`/chef/menus/${menuId}/items/reorder`, { itemIds }),
  removeImage: (itemId: string, imageKey: string) =>
    // FR-012a: imageKey via ?key= query param — axios URL-encodes slashes transparently.
    api
      .delete<ChefItem>(`/chef/items/${itemId}/images`, { params: { key: imageKey } })
      .then((r) => r.data),
};
