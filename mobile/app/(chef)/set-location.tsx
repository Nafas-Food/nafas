import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KitchenLocationPicker } from '../../components/KitchenLocationPicker';
import { updateChefProfile } from '../../services/chefProfile';
import { useLanguage } from '../../context/LanguageContext';
import { useColors, type NafasColors } from '../../hooks/useColors';

// One-time post-verification screen. The chef tab bar (chef)/_layout.tsx
// routes the verified chef here on first sign-in (lat=0 AND lng=0
// sentinel from the apply flow). After save, the layout's guard sees
// real coords and lets the chef into the dashboard.

type Coords = { latitude: number; longitude: number };

export default function SetLocationScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [coords, setCoords] = useState<Coords | null>(null);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!coords) {
      Alert.alert(t('setLocation.validation.coordinatesRequired'));
      return;
    }
    if (coords.latitude === 0 && coords.longitude === 0) {
      Alert.alert(t('setLocation.validation.coordinatesRequired'));
      return;
    }
    setSaving(true);
    try {
      await updateChefProfile({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      router.replace('/(chef)/dashboard');
    } catch {
      Alert.alert(t('common.networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>{t('setLocation.title')}</Text>
        <Text style={styles.subtitle}>{t('setLocation.subtitle')}</Text>
      </View>

      <View style={styles.mapFull}>
        <KitchenLocationPicker value={coords} onChange={setCoords} />
      </View>

      <View
        style={[styles.ctaWrap, { paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable
          onPress={onSave}
          disabled={saving || !coords}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.primaryCtaPressed,
            (!coords || saving) && styles.primaryCtaDisabled,
          ]}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.primaryCtaText}>{t('setLocation.saveCta')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
    },
    mapFull: { flex: 1 },
    ctaWrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    primaryCta: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 100,
      alignItems: 'center',
    },
    primaryCtaPressed: { opacity: 0.9 },
    primaryCtaDisabled: { opacity: 0.5 },
    primaryCtaText: {
      color: colors.primaryText,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
