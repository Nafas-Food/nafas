import { api } from './api';

export interface ChefApplyPayload {
  chefName: string;
  bio: string;
  latitude: number;
  longitude: number;
  minOrderPrice: number;
}

export interface CooldownErrorPayload {
  code: 'APPLICATION_COOLDOWN_IN_EFFECT';
  earliestResubmitAt: string;
}
export interface PendingErrorPayload {
  code: 'APPLICATION_PENDING';
  applicationId: string;
}
export interface AlreadyChefErrorPayload {
  code: 'ALREADY_CHEF';
  chefId: string;
}
export type ApplyErrorPayload = CooldownErrorPayload | PendingErrorPayload | AlreadyChefErrorPayload;

export async function applyToBeAChef(payload: ChefApplyPayload): Promise<void> {
  await api.post('/chef/apply', payload);
}
