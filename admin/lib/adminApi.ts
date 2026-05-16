import axios from 'axios';
import { getSession } from 'next-auth/react';

export const adminApi = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1`,
  timeout: 10_000,
});

adminApi.interceptors.request.use(async (config) => {
  const session = await getSession();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});
