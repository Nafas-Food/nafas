import { api } from './api';
import type { ChefCard } from './chefs';
import type { Category } from './categories';

export interface HomePayload {
  greeting: { userFirstName: string };
  openChefs: ChefCard[];
  categories: Category[];
  topRated: ChefCard[];
}

export const homeService = {
  get: () => api.get<HomePayload>('/home').then((r) => r.data),
};
