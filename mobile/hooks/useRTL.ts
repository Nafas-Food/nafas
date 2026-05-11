import { useLanguage } from '../context/LanguageContext';

/**
 * RTL helper driven entirely by LanguageContext state.
 *
 * We deliberately do NOT consult `I18nManager.isRTL`. The framework's
 * auto-flip of `flexDirection: 'row'` is unreliable mid-session (Expo Go,
 * some dev-client setups), so a context-only model is the simplest way to
 * guarantee that a language toggle visibly flips layout without requiring
 * a full bundle reload. LanguageContext keeps `I18nManager.forceRTL` off
 * so the framework never double-flips our manual values.
 */
export function useRTL(): {
  isRTL: boolean;
  rowDirection: 'row' | 'row-reverse';
  start: 'left' | 'right';
  end: 'left' | 'right';
  textAlign: 'left' | 'right';
} {
  const { isRTL } = useLanguage();
  return {
    isRTL,
    rowDirection: isRTL ? 'row-reverse' : 'row',
    start: isRTL ? 'right' : 'left',
    end: isRTL ? 'left' : 'right',
    textAlign: isRTL ? 'right' : 'left',
  };
}
