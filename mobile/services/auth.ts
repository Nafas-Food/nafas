import { api } from './api';
import type { AuthUser } from '../context/AuthContext';

export interface SessionResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

// Phase 3 (T053): export async function sendOtp(phone: string)
// Phase 3 (T056): export async function register(...)
// Phase 4 (T064): export async function signIn(phone, password)
// Phase 5 (T076): export async function refresh(refreshToken)
// Phase 5 (T078): export async function getMe()
// Phase 7 (T103): export async function signOut(refreshToken)

export {}; // placeholder to keep this a module until Phase 3