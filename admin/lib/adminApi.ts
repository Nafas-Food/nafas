import axios from 'axios';
import { getSession } from 'next-auth/react';

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

adminApi.interceptors.request.use(async (config) => {
  // Lazy baseURL resolution so the build (SSG) doesn't fail when the env
  // var isn't set yet; runtime requests will throw with a clear message.
  config.baseURL = `${getBaseUrl()}/api/v1`;
  const session = await getSession();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});
