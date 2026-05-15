import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { DevSettings, I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en, type I18nDict } from '../constants/i18n/en';
import { ar } from '../constants/i18n/ar';

async function reloadApp(): Promise<void> {
  // Production / EAS builds: Updates.reloadAsync. Dev (Expo Go, dev client):
  // fall back to DevSettings.reload so the bundle actually restarts.
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}

type Locale = 'en' | 'ar';
const STORAGE_KEY = '@nafas/lang';
// One-shot guard for the legacy framework-RTL cleanup at boot. If a prior
// build of this app called I18nManager.forceRTL(true), the native flag
// persists across installs/sessions and would fight our context-driven
// manual flips. We reset it once on first boot of this build.
const CLEANUP_GUARD_KEY = '@nafas/lang-framework-cleanup';
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
        // Lock the framework to LTR so its auto-flip never fights our
        // context-driven manual flip in useRTL().
        I18nManager.allowRTL(false);

        if (I18nManager.isRTL) {
          // Legacy state from a prior build that called forceRTL(true).
          // forceRTL(false) needs a bundle reload to take effect, so do it
          // once (guarded) and let the next boot proceed cleanly.
          const cleaned = await AsyncStorage.getItem(CLEANUP_GUARD_KEY);
          if (!cleaned) {
            await AsyncStorage.setItem(CLEANUP_GUARD_KEY, '1');
            I18nManager.forceRTL(false);
            await reloadApp();
            return; // bundle reloading
          }
          // Reload didn't clear native state (Expo Go etc). We accept the
          // residual framework RTL — manual flips still produce a
          // recognisable layout, just mirrored from the intended one.
        }

        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
        if (stored === 'en' || stored === 'ar') {
          setLocaleState(stored);
        } else {
          setLocaleState(Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en');
        }
      } catch {
        setLocaleState('en');
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    // No forceRTL, no reload. Layout flips synchronously via:
    //   1. setLocaleState -> context.isRTL changes
    //   2. <View key={isRTL ? 'rtl' : 'ltr'}> in _layout remounts subtree
    //   3. useRTL() re-reads context and returns flipped primitives
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort persistence; UI still flips
    }
    setLocaleState(next);
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
