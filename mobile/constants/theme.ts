/**
 * Nafas Design System — Mobile Theme Tokens
 * Brand: Terracotta primary, Saffron accent, Earthy neutrals
 */

/* ── Primary — Terracotta ─────────────────────────────── */
export const Colors = {
  primary: '#C4622D',
  primaryHover: '#A8521F',
  primaryForeground: '#FFFFFF',
  primaryLight: '#F5ECD7',

  accent: '#D4944A',
  accentLight: '#FDEEC8',
  accentForeground: '#FFFFFF',

  /* ── Neutrals — Earthy & Warm ────────────────────────── */
  background: '#FAF7F2',
  foreground: '#2C1F14',
  card: '#FFFFFF',
  cardForeground: '#2C1F14',

  umber: '#2C1F14',
  mocha: '#6B5040',
  sand: '#B8A898',
  cream: '#F5ECD7',

  muted: '#F2EDE4',
  mutedForeground: '#6B5040',

  border: '#EDE6DA',
  input: '#F2EDE4',
  ring: '#C4622D',

  /* ── Semantic ─────────────────────────────────────────── */
  success: '#16A34A',
  successForeground: '#FFFFFF',
  destructive: '#C0392B',
  destructiveForeground: '#FFFFFF',
  warning: '#D4944A',
  warningForeground: '#FFFFFF',

  /* ── Status Colors (Order Lifecycle) ──────────────────── */
  statusPending: '#D4944A',
  statusConfirmed: '#3B82F6',
  statusPreparing: '#8B5CF6',
  statusReady: '#10B981',
  statusOnTheWay: '#C4622D',
  statusDelivered: '#16A34A',
  statusCancelled: '#C0392B',
} as const;

/* ── Typography ───────────────────────────────────────── */
export const Font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const FontSize = {
  h1: 28,
  h2: 20,
  h3: 17,
  bodyLg: 16,
  body: 15,
  bodySm: 14,
  caption: 13,
  micro: 12,
  nano: 11,
} as const;

export const LineHeight = {
  tight: 1.2,
  snug: 1.35,
  normal: 1.5,
  relaxed: 1.6,
} as const;

export const LetterSpacing = {
  tight: -0.3,
  normal: 0,
  wide: 0.5,
  widest: 1.5,
} as const;

/* ── Spacing Scale ─────────────────────────────────────── */
export const Spacing = {
  s1: 4,
  s2: 8,
  s3: 12,
  s3_5: 14,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 28,
  s8: 32,
} as const;

/* ── Border Radius ─────────────────────────────────────── */
export const Radius = {
  pill: 100,
  card: 16,
  cardLg: 18,
  input: 14,
  icon: 12,
  iconSm: 10,
  avatar: 50,
} as const;

/* ── Shadows ───────────────────────────────────────────── */
export const Shadows = {
  card: {
    shadowColor: '#2C1F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardMd: {
    shadowColor: '#2C1F14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4,
  },
  float: {
    shadowColor: '#C4622D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;

/* ── Glass (floating tab bars) ───────────────────────── */
export const Glass = {
  bg: 'rgba(255, 255, 255, 0.55)',
  border: 'rgba(255, 255, 255, 0.75)',
  blur: 20,
  saturate: 1.8,
} as const;
