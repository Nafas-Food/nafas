import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../context/LanguageContext';
import { useColors, type NafasColors } from '../hooks/useColors';

// Fixed order (EN | عربي) regardless of active locale — it's a language
// selector, not content, so it should not flip with RTL.
const SEGMENTS: { value: 'en' | 'ar'; label: string; a11y: string }[] = [
  { value: 'en', label: 'EN', a11y: 'English' },
  { value: 'ar', label: 'عربي', a11y: 'العربية' },
];

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.track}>
      {SEGMENTS.map((seg) => {
        const active = locale === seg.value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => {
              if (!active) setLocale(seg.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seg.a11y}
          >
            <Text
              allowFontScaling={false}
              style={[styles.segmentText, active && styles.segmentTextActive]}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 3,
    },
    segment: {
      minWidth: 46,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
    },
    segmentTextActive: {
      color: colors.primaryText,
    },
  });
}
