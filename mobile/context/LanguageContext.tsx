import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DevSettings, I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en, type I18nDict } from '../constants/i18n/en';
import { ar } from '../constants/i18n/ar';

async function reloadApp(): Promise<void> {
  // Updates.reloadAsync only works in production / EAS builds. In dev (Expo Go,
  // dev client) it throws "Updates.reloadAsync is not available" — fall back to
  // DevSettings.reload so the layout actually flips after I18nManager.forceRTL.
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}

type Locale = 'en' | 'ar';
const STORAGE_KEY = '@nafas/lang';
const dicts: Record<Locale, I18nDict> = { en, ar };

interface LanguageContextValue {
  locale: Locale;
  isRTL: boolean;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function lookup(dict: I18nDict, key: string): string {
  const parts = key.split('.');
  let cursor: unknown = dict;
  for (const p of parts) {
    if (typeof cursor !== 'object' || cursor === null || !(p in (cursor as Record<string, unknown>))) {
      return key;
    }
    cursor = (cursor as Record<string, unknown>)[p];
  }
  return typeof cursor === 'string' ? cursor : key;
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
        let next: Locale;
        if (stored === 'en' || stored === 'ar') {
          next = stored;
        } else {
          next = Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
        }
        setLocaleState(next);
        const wantRTL = next === 'ar';
        if (I18nManager.isRTL !== wantRTL) {
          I18nManager.allowRTL(wantRTL);
          I18nManager.forceRTL(wantRTL);
          // Direction was out of sync at boot — reload so native layout matches.
          await reloadApp();
          return;
        }
      } catch {
        setLocaleState('en');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
      const wantRTL = next === 'ar';
      if (I18nManager.isRTL !== wantRTL) {
        I18nManager.allowRTL(wantRTL);
        I18nManager.forceRTL(wantRTL);
        // Reload required for native primitives to flip direction (R9).
        await reloadApp();
      } else {
        setLocaleState(next);
      }
    } catch {
      setLocaleState(next);
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => interpolate(lookup(dicts[locale], key), vars),
    [locale],
  );

  return (
    <LanguageContext.Provider value={{ locale, isRTL: locale === 'ar', setLocale, t, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}