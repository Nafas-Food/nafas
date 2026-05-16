import axios from 'axios';

function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_BACKEND_URL is required but not set. Add it to your .env.local file.');
  }
  return url;
}

export const adminApi = axios.create({
  timeout: 10_000,
});

adminApi.interceptors.request.use((config) => {
  // Lazy baseURL resolution so the build (SSG) doesn't fail when the env
  // var isn't set yet; runtime requests will throw with a clear message.
  config.baseURL = `${getBaseUrl()}/api/v1`;
  return config;
});

/**
 * Set or clear the bearer token used by every adminApi request.
 * Call once after sign-in (e.g. from a useEffect that watches the
 * NextAuth session) and call with `null` on sign-out.
 *
 * Prefer this over `getSession()` inside the interceptor — the latter
 * triggers a network round-trip to `/api/auth/session` on *every* request.
 */
export function setAuthToken(token: string | null): void {
  if (token) {
    adminApi.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete adminApi.defaults.headers.common.Authorization;
  }
}
