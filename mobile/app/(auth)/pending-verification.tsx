import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useColors, type NafasColors } from '../../hooks/useColors';
import { useRTL } from '../../hooks/useRTL';

export default function PendingVerificationScreen() {
  const { t } = useLanguage();
  const { textAlign } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { clearSession } = useAuth();

  return (
    <View style={styles.wrap}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 80,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <Feather name="clock" size={48} color={colors.primary} />
        </View>

        <Text style={[styles.title, { textAlign }]}>
          {t('pending.title')}
        </Text>
        <Text style={[styles.body, { textAlign }]}>
          {t('pending.body')}
        </Text>

        <Pressable
          onPress={clearSession}
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && styles.signOutBtnPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.signOutBtnText}>
            {t('pending.signOutCta')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    iconWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: 32,
    },
    signOutBtn: {
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 100,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
    },
    signOutBtnPressed: {
      opacity: 0.85,
      backgroundColor: colors.muted,
    },
    signOutBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
  });
}
