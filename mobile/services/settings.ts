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
  let parsed: CachedSettings | null = null;
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (raw) {
    try {
      parsed = JSON.parse(raw) as CachedSettings;
    } catch {
      parsed = null; // corrupt cache — ignore
    }
  }

  if (!force && parsed && Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
    return parsed.data;
  }

  try {
    const response = await api.get<Record<string, string>>('/settings');
    const data = response.data;
    try {
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data, fetchedAt: Date.now() }),
      );
    } catch (err) {
      console.warn('[settings] cache write failed', err);
    }
    return data;
  } catch (err) {
    // Network/server failure — serve stale cache if we have it rather than
    // crashing the welcome screen.
    if (parsed) return parsed.data;
    throw err;
  }
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
