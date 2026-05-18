import { api } from './api';

export type BilingualText = { en: string; ar: string };
export type ChefMenu = {
  id: string;
  chefId: string;
  categoryId: string;
  name: BilingualText;
  displayOrder: number;
  availableAllDays: boolean;
  availability: { id: string; menuId: string; dayOfWeek: number; createdAt: string }[];
  items: import('./items').ChefItem[];
  createdAt: string;
  updatedAt: string;
};

// Paths are relative to `BASE_URL` in services/api.ts, which already
// includes `/api/v1`. Mirror the convention used by every other service
// (chefApply.ts, chefs.ts, addresses.ts, etc.) — do NOT prefix /api/v1.
export const menusService = {
  listOwn: () => api.get<ChefMenu[]>('/chef/menus').then((r) => r.data),
  create: (body: {
    name: BilingualText;
    categoryId: string;
    availableAllDays: boolean;
    initialAvailability?: number[];
  }) => api.post<ChefMenu>('/chef/menus', body).then((r) => r.data),
  addAvailability: (menuId: string, dayOfWeek: number) =>
    api
      .post<{ dayOfWeek: number }>(`/chef/menus/${menuId}/availability`, {
        dayOfWeek,
      })
      .then((r) => r.data),
  removeAvailability: (menuId: string, dayOfWeek: number) =>
    api.delete<void>(`/chef/menus/${menuId}/availability/${dayOfWeek}`),
};
