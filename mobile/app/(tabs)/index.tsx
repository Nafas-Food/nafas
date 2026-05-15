import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useRTL } from '../../hooks/useRTL';
import { useColors } from '../../hooks/useColors';
import { DeliverToChip } from '../../components/DeliverToChip';

export default function HomePlaceholder() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { textAlign } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <DeliverToChip />

        <View style={styles.greetingWrap}>
          <Text style={[styles.greeting, { textAlign }]}>
            {user
              ? t('home.greeting', { name: user.fullName })
              : t('common.loading')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    greetingWrap: {
      paddingHorizontal: 20,
      paddingTop: 28,
    },
    greeting: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.muted,
    },
  });
}
