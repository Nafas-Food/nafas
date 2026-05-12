import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useLanguage } from '../../context/LanguageContext';
import { useRTL } from '../../hooks/useRTL';
import { useColors } from '../../hooks/useColors';

export default function FavoritesScreen() {
  const { t } = useLanguage();
  const { textAlign } = useRTL();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Feather name="heart" size={40} color={colors.muted} />
      <Text style={[styles.title, { textAlign }]}>{t('common.loading')}</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.muted,
    },
  });
}