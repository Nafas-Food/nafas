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

// Phase 4 (T064): export async function signIn(phone, password)
// Phase 5 (T076): export async function refresh(refreshToken)
// Phase 5 (T078): export async function getMe()
// Phase 7 (T103): export async function signOut(refreshToken)