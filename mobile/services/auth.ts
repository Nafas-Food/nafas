import { api } from './api';
import type { AuthUser } from '../context/AuthContext';

export interface SessionResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function sendOtp(phone: string): Promise<void> {
  await api.post('/auth/send-otp', { phone });
}

export async function register(input: {
  fullName: string;
  phone: string;
  password: string;
  birthdate: string;
  otpCode: string;
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

export async function getMe(): Promise<{ user: AuthUser }> {
  const { data } = await api.get<{ user: AuthUser }>('/auth/me');
  return data;
}

export async function signOut(refreshToken: string): Promise<void> {
  await api.post('/auth/sign-out', { refreshToken });
}