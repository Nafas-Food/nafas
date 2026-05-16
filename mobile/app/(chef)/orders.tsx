import React from 'react';
import { SafeAreaView, Text, StyleSheet } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useLanguage } from '../../context/LanguageContext';

export default function OrdersPlaceholder() {
  const colors = useColors();
  const { t } = useLanguage();
  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{t('chefTabs.orders')}</Text>
      <Text style={styles.body}>Coming soon</Text>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    body: {
      fontSize: 14,
      color: colors.muted,
    },
  });
}
