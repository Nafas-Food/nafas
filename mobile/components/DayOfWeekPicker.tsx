import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';

interface DayOfWeekPickerProps {
  selected: number[];                 // 0..6
  onChange: (next: number[]) => void;
}

export function DayOfWeekPicker({ selected, onChange }: DayOfWeekPickerProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();

  const days: { value: number; key: string }[] = [
    { value: 0, key: 'common.day.sun' },
    { value: 1, key: 'common.day.mon' },
    { value: 2, key: 'common.day.tue' },
    { value: 3, key: 'common.day.wed' },
    { value: 4, key: 'common.day.thu' },
    { value: 5, key: 'common.day.fri' },
    { value: 6, key: 'common.day.sat' },
  ];

  function toggle(day: number) {
    onChange(selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day]);
  }

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {days.map((d) => {
        const on = selected.includes(d.value);
        return (
          <Pressable
            key={d.value}
            onPress={() => toggle(d.value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: on ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.border,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={{ color: on ? colors.primaryText : colors.text }}>{t(d.key)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
