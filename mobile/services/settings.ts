import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const CACHE_KEY = '@nafas/settings';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedSettings {
  data: Record<string, string>;
  fetchedAt: number;
}

export async function fetchSettings(
  force = false,
): Promise<Record<string, string>> {
  if (!force) {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      try {
        const parsed: CachedSettings = JSON.parse(raw);
        if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
          return parsed.data;
        }
      } catch {
        // ignore corrupt cache
      }
    }
  }

  const response = await api.get<Record<string, string>>('/settings');
  const data = response.data;

  await AsyncStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ data, fetchedAt: Date.now() }),
  );
  return data;
}

export async function getSetting(
  key: string,
  fallback?: string,
): Promise<string | undefined> {
  const settings = await fetchSettings();
  return settings[key] ?? fallback;
}

export async function clearSettingsCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
