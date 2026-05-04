import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en, type I18nDict } from '../constants/i18n/en';
import { ar } from '../constants/i18n/ar';

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
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
      if (stored === 'en' || stored === 'ar') {
        setLocaleState(stored);
        if (I18nManager.isRTL !== (stored === 'ar')) {
          I18nManager.forceRTL(stored === 'ar');
        }
      } else {
        const detected = Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
        setLocaleState(detected);
        if (I18nManager.isRTL !== (detected === 'ar')) {
          I18nManager.forceRTL(detected === 'ar');
        }
      }
      setReady(true);
    })();
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    await AsyncStorage.setItem(STORAGE_KEY, next);
    const wantRTL = next === 'ar';
    if (I18nManager.isRTL !== wantRTL) {
      I18nManager.forceRTL(wantRTL);
      // Reload required for native primitives to flip direction (R9).
      await Updates.reloadAsync();
    } else {
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