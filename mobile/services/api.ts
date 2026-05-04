import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

// URL cheat-sheet for local development:
//   iOS Simulator  -> http://localhost:3000/api/v1
//   Android Emulator -> http://10.0.2.2:3000/api/v1
//   Physical device  -> http://<your-machine-ip>:3000/api/v1
//
// NOTE: When testing from a physical device you must also add the same
// origin to the backend ALLOWED_ORIGINS env var or CORS will block it.
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.3:3000/api/v1';

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

// ---- Single-flight refresh (research R8, delivers SC-005) ----

type RefreshHook = () => Promise<{ accessToken: string; refreshToken: string }>;

let refreshHook: RefreshHook | null = null;
let onRefreshFailure: () => void = () => {};
/** Called once at startup from AuthContext (T060). */
export function _setRefreshHook(hook: RefreshHook, onFail: () => void) {
  refreshHook = hook;
  onRefreshFailure = onFail;
}

let inflight: Promise<void> | null = null;
let failureFired = false;

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;
    // Cancelled / network-layer aborts have no config — pass through.
    if (!original) throw error;

    const status = (error.response?.status as number | undefined) ?? 0;

    // Only handle 401 once, and never on the refresh request itself.
    const isRefreshRequest = original.url === '/auth/refresh';
    if (status !== 401 || original._retried || isRefreshRequest || !refreshHook) {
      throw error;
    }

    original._retried = true;
    try {
      if (!inflight) {
        failureFired = false;
        inflight = (async () => {
          await refreshHook!();
        })().finally(() => {
          // Allow the next 401 burst (after a future expiry) to start a new refresh.
          // Reset only AFTER all queued retries observe the new credential.
          setTimeout(() => { inflight = null; }, 0);
        });
      }
      await inflight;
      return api(original); // retry with the new credential (request interceptor reads accessTokenGetter)
    } catch {
      // Queued retries all observe the same rejected promise — fire the
      // failure hook once for the burst.
      if (!failureFired) {
        failureFired = true;
        onRefreshFailure();
      }
      throw error;
    }
  },
);