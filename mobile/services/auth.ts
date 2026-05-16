import { api } from './api';
import type { AuthUser } from '../context/AuthContext';

export interface SessionResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function sendOtp(phone: string, email?: string): Promise<void> {
  await api.post('/auth/send-otp', { phone, ...(email ? { email } : {}) });
}

export async function register(input: {
  fullName: string;
  phone: string;
  password: string;
  birthdate: string;
  otpCode: string;
  email?: string;
}): Promise<SessionResponse> {
  const { data } = await api.post<SessionResponse>('/auth/register', input);
  return data;
}

export async function signIn(phone: string, password: string): Promise<SessionResponse> {
  const { data } = await api.post<SessionResponse>('/auth/sign-in', { phone, password });
  return data;
}

export async function refresh(refreshToken: string): Promise<SessionResponse> {
  const { data } = await api.post<SessionResponse>('/auth/refresh', { refreshToken });
  return data;
}

/**
 * Phase 3 (T034) extended the response with `pendingApplication` for
 * customers who have a pending chef row; the field is `null` for users
 * with no pending application, and absent on backends older than T034.
 */
export interface MeResponse {
  user: AuthUser;
  pendingApplication?: { applicationId: string } | null;
}

export async function getMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/auth/me');
  return data;
}

export async function signOut(refreshToken: string): Promise<void> {
  await api.post('/auth/sign-out', { refreshToken });
}