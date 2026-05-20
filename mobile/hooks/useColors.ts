import { useMemo } from 'react';

export interface NafasColors {
  primary: string;
  primaryText: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  danger: string;
  /** Tinted destructive surface (e.g., delete-button background, danger banners). */
  dangerSurface: string;
  successGreen: string;
  shadow: string;
  /** Translucent dark overlay for image action buttons / pressed cards. */
  scrim: string;
  /** Stronger scrim for prominent overlays (carousel remove button). */
  scrimStrong: string;
  /** Shared backdrop for slide-up modal sheets (menu / item editors, image dialog). */
  modalBackdrop: string;
  /** Circular icon-button scrim over hero imagery (chef profile back button). */
  bannerScrim: string;
  /** Subtle dark tint laid on top of a banner image to improve text contrast. */
  bannerTint: string;
  warningSurface: string;
  warningBorder: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  inputBorder: string;
  glassBackgroundIOS: string;
  glassBackgroundAndroid: string;
  glassBorder: string;
  glassShadow: string;
  glassShadowOpacity: number;
  tabItemActiveBg: string;
}

const TOKENS: NafasColors = {
  primary: '#C4622D',
  primaryText: '#FFFFFF',
  primaryLight: '#F5ECD7',
  accent: '#D4944A',
  accentLight: '#FDEEC8',
  danger: '#A33333',
  dangerSurface: 'rgba(163, 51, 51, 0.10)',
  successGreen: '#16A34A',
  shadow: '#2C1F14',
  scrim: 'rgba(31, 26, 23, 0.55)',
  scrimStrong: 'rgba(31, 26, 23, 0.65)',
  modalBackdrop: 'rgba(31, 26, 23, 0.45)',
  bannerScrim: 'rgba(0, 0, 0, 0.35)',
  bannerTint: 'rgba(0, 0, 0, 0.12)',
  warningSurface: '#FFF3E0',
  warningBorder: '#C4622D',
  background: '#FAF6F2',
  surface: '#FFFFFF',
  text: '#1F1A17',
  muted: '#7A6E66',
  border: '#D7CFC8',
  inputBorder: '#CCCCCC',
  glassBackgroundIOS: 'rgba(255, 255, 255, 0.78)',
  glassBackgroundAndroid: 'rgba(255, 255, 255, 0.96)',
  glassBorder: 'rgba(31, 26, 23, 0.08)',
  glassShadow: '#1F1A17',
  glassShadowOpacity: 0.18,
  tabItemActiveBg: 'rgba(196, 98, 45, 0.13)',
};

export function useColors(): NafasColors {
  return useMemo(() => TOKENS, []);
}