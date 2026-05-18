import { api } from './api';

export interface Category {
  id: string;
  name: { en: string; ar: string };
  icon: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listCategories(): Promise<Category[]> {
  const { data } = await api.get('/categories');
  return data;
}

export const categoriesService = {
  list: listCategories,
};
