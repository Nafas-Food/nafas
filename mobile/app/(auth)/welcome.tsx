import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, Font, FontSize, Spacing, Radius } from '../../constants/theme';
import { fetchSettings } from '../../services/settings';

const FALLBACK_IMAGE = require('../../assets/hero_vertical.png');

export default function WelcomeScreen() {
  const { t, locale, setLocale, isRTL } = useLanguage();
  const router = useRouter();
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await fetchSettings();
        if (mounted && settings.WELCOME_BACKGROUND_IMAGE) {
          setBgUrl(settings.WELCOME_BACKGROUND_IMAGE);
        }
      } catch {
        // offline — fallback will be used
      } finally {
        if (mounted) setSettingsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const imageSource = bgUrl ? { uri: bgUrl } : FALLBACK_IMAGE;

  return (
    <ImageBackground
      source={imageSource}
      style={styles.container}
      resizeMode="cover"
      onError={() => setBgUrl(null)}
    >
      <View style={styles.overlay} />

      <View style={styles.content}>
        <View style={[styles.wordmark, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.wordmarkAr}>{t('welcome.wordmarkAr')}</Text>
          <View style={styles.wordmarkDivider} />
          <Text style={styles.wordmarkEn}>{t('welcome.wordmarkEn')}</Text>
        </View>
        <Text style={[styles.tagline, { textAlign: isRTL ? 'right' : 'center' }]}>{t('welcome.tagline')}</Text>

        {settingsLoading && (
          <ActivityIndicator
            color={Colors.primaryForeground}
            style={styles.loader}
          />
        )}

        <View style={styles.buttonGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.primaryButtonText}>
              {t('welcome.createAccount')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.ghostButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push('/(auth)/sign-in')}
          >
            <Text style={styles.ghostButtonText}>
              {t('welcome.signIn')}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.langToggle}
        onPress={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
      >
        <Text style={styles.langToggleText}>
          {t('welcome.languageToggle')}
        </Text>
      </Pressable>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 10, 0, 0.45)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.s5,
    zIndex: 1,
  },
  wordmark: {
    alignItems: 'center',
    gap: Spacing.s2,
  },
  wordmarkAr: {
    fontSize: FontSize.h1,
    fontFamily: Font.bold,
    color: Colors.primaryForeground,
    letterSpacing: -0.5,
  },
  wordmarkEn: {
    fontSize: FontSize.h1,
    fontFamily: Font.bold,
    color: Colors.primaryForeground,
    letterSpacing: 0.5,
  },
  wordmarkDivider: {
    width: 1.5,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  tagline: {
    fontSize: FontSize.body,
    fontFamily: Font.regular,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: Spacing.s2,
    lineHeight: FontSize.body * 1.5,
  },
  loader: {
    marginTop: Spacing.s4,
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
    fontFamily: Font.bold,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderRadius: Radius.pill,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primaryForeground,
  },
  ghostButtonText: {
    color: Colors.primaryForeground,
    fontSize: FontSize.bodyLg,
    fontFamily: Font.semibold,
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: Radius.pill,
    zIndex: 1,
  },
  langToggleText: {
    color: Colors.primaryForeground,
    fontSize: FontSize.bodySm,
    fontFamily: Font.semibold,
  },
});
