import { api } from './api';
import type { AuthUser } from '../context/AuthContext';

export async function updateProfile(input: { fullName?: string; email?: string }): Promise<{ user: AuthUser }> {
  const { data } = await api.patch<{ user: AuthUser }>('/users/me', input);
  return data;
}

export async function startChangePhone(newPhone: string): Promise<void> {
  await api.post('/users/me/change-phone/start', { newPhone });
}

// NOTE: callers MUST pipe the returned `user` back into AuthContext so the
// new phone shows up in local state — e.g. by exposing a `setUser`-style
// updater on the context. Otherwise `user.phone` stays stale until the next
// `getMe` or app cold-start.
export async function verifyChangePhone(input: { newPhone: string; otpCode: string }): Promise<{ user: AuthUser }> {
  const { data } = await api.post<{ user: AuthUser }>('/users/me/change-phone/verify', input);
  return data;
}

export async function registerFcmToken(fcmToken: string): Promise<void> {
  await api.post('/users/me/fcm-token', { fcmToken });
}
