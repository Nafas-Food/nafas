import { useMemo } from 'react';

export interface NafasColors {
  primary: string;
  primaryText: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  danger: string;
  warningSurface: string;
  warningBorder: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  inputBorder: string;
}

const TOKENS: NafasColors = {
  primary: '#C4622D',
  primaryText: '#FFFFFF',
  primaryLight: '#F5ECD7',
  accent: '#D4944A',
  accentLight: '#FDEEC8',
  danger: '#A33333',
  warningSurface: '#FFF3E0',
  warningBorder: '#C4622D',
  background: '#FAF6F2',
  surface: '#FFFFFF',
  text: '#1F1A17',
  muted: '#7A6E66',
  border: '#D7CFC8',
  inputBorder: '#CCCCCC',
};

export function useColors(): NafasColors {
  return useMemo(() => TOKENS, []);
}