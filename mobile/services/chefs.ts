import { api } from './api';

export interface ChefCard {
  id: string;
  chefName: string;
  bio: string;
  logo: string;
  banner: string;
  isOpen: boolean;
  ratings: string;
  totalReviews: number;
  minOrderPrice: string;
  verifiedAt: string | null;
  distanceKm?: number;
}

export interface ChefPublicProfile extends ChefCard {
  categoryIds: string[];
}

export interface ChefPrivateProfileResponseDto {
  id: string;
  chefName: string;
  bio: string;
  logo: string;
  banner: string;
  isOpen: boolean;
  ratings: string;
  totalReviews: number;
  minOrderPrice: string;
  verifiedAt: string | null;
  latitude: string;
  longitude: string;
  categoryIds: string[];
}

export interface DiscoveryQuery {
  categoryId?: string;
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  cursor?: number;
  pageSize?: number;
}

export async function discoverChefs(query: DiscoveryQuery): Promise<ChefCard[]> {
  const { data } = await api.get('/chefs', { params: query });
  return data;
}

export async function getChefPublicProfile(
  chefId: string,
): Promise<ChefPublicProfile> {
  const { data } = await api.get(`/chefs/${chefId}`);
  return data;
}
