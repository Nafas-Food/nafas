import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

export default function WelcomeScreen() {
  const { t, locale, setLocale } = useLanguage();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkAr}>نفَس</Text>
          <View style={styles.wordmarkDivider} />
          <Text style={styles.wordmarkEn}>Nafas</Text>
        </View>
        <Text style={styles.tagline}>{t('welcome.tagline')}</Text>

        <View style={styles.buttonGroup}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.primaryButtonText}>{t('welcome.createAccount')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
            onPress={() => router.push('/(auth)/sign-in')}
          >
            <Text style={styles.ghostButtonText}>{t('welcome.signIn')}</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.langToggle}
        onPress={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
      >
        <Text style={styles.langToggleText}>{t('welcome.languageToggle')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.s5,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s2,
  },
  wordmarkAr: {
    fontSize: FontSize.h1,
    fontWeight: '700',
    color: Colors.foreground,
    letterSpacing: -0.5,
  },
  wordmarkEn: {
    fontSize: FontSize.h1,
    fontWeight: '700',
    color: Colors.foreground,
    letterSpacing: 0.5,
  },
  wordmarkDivider: {
    width: 1.5,
    height: 22,
    backgroundColor: Colors.border,
  },
  tagline: {
    fontSize: FontSize.body,
    color: Colors.mutedForeground,
    textAlign: 'center',
    marginTop: Spacing.s2,
    lineHeight: FontSize.body * 1.5,
  },
  buttonGroup: {
    width: '100%',
    marginTop: Spacing.s8,
    gap: Spacing.s3,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: Colors.primaryForeground,
    fontSize: FontSize.bodyLg,
    fontWeight: '700',
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderRadius: Radius.pill,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghostButtonText: {
    color: Colors.primary,
    fontSize: FontSize.bodyLg,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  langToggle: {
    position: 'absolute',
    bottom: Spacing.s8,
    alignSelf: 'center',
    paddingHorizontal: Spacing.s4,
    paddingVertical: Spacing.s2,
    backgroundColor: Colors.muted,
    borderRadius: Radius.pill,
  },
  langToggleText: {
    color: Colors.primary,
    fontSize: FontSize.bodySm,
    fontWeight: '600',
  },
});