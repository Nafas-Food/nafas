import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nafas.defaultAddressId';

export const defaultAddressStore = {
  async get(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async set(id: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    } catch {
      // best-effort — preference loss is non-fatal
    }
  },
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort
    }
  },
};
