import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

// URL cheat-sheet for local development:
//   iOS Simulator  -> http://localhost:3000/api/v1
//   Android Emulator -> http://10.0.2.2:3000/api/v1
//   Physical device  -> http://<your-machine-ip>:3000/api/v1
//
// NOTE: When testing from a physical device you must also add the same
// origin to the backend ALLOWED_ORIGINS env var or CORS will block it.
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.2:3000/api/v1';

/**
 * The single shared Axios instance for every backend call.
 * Phase 1 wires:
 *   - Request interceptor that attaches the access credential (T034 will set it).
 *   - Response interceptor for the single-flight refresh (T074).
 */
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

let accessTokenGetter: () => string | null = () => null;
export function _setAccessTokenGetter(fn: () => string | null) {
  accessTokenGetter = fn;
}

api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = accessTokenGetter();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

/** Maps an Axios error to a stable error code the i18n dictionary knows about. */
export function errorCodeOf(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ code?: string }>;
    if (!ax.response) return 'NETWORK';
    const code = ax.response.data?.code;
    if (typeof code === 'string') return code;
  }
  return 'UNKNOWN';
}