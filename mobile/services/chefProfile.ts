import { api } from './api';
import type { ChefPrivateProfileResponseDto } from './chefs';

export interface UpdateChefProfilePayload {
  chefName?: string;
  bio?: string;
  latitude?: number;
  longitude?: number;
  minOrderPrice?: number;
}

export async function getOwnChefProfile(): Promise<ChefPrivateProfileResponseDto> {
  const { data } = await api.get('/chef/profile');
  return data;
}

export async function updateChefProfile(
  payload: UpdateChefProfilePayload,
): Promise<ChefPrivateProfileResponseDto> {
  const { data } = await api.patch('/chef/profile', payload);
  return data;
}

export async function toggleChefAvailability(
  isOpen: boolean,
): Promise<ChefPrivateProfileResponseDto> {
  const { data } = await api.patch('/chef/availability', { isOpen });
  return data;
}

export async function replaceLogo(
  uri: string,
  mimeType: string,
): Promise<ChefPrivateProfileResponseDto> {
  return uploadImage('/chef/logo', uri, mimeType);
}

export async function replaceBanner(
  uri: string,
  mimeType: string,
): Promise<ChefPrivateProfileResponseDto> {
  return uploadImage('/chef/banner', uri, mimeType);
}

async function uploadImage(
  path: string,
  uri: string,
  mimeType: string,
): Promise<ChefPrivateProfileResponseDto> {
  const form = new FormData();
  // React Native FormData is fine with the { uri, type, name } shape:
  form.append('file', { uri, type: mimeType, name: 'upload' } as unknown as Blob);
  const { data } = await api.post(path, form);
  return data;
}
