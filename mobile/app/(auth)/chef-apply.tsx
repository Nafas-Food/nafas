import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { KitchenLocationPicker } from '../../components/KitchenLocationPicker';
import { applyToBeAChef, type ApplyErrorPayload } from '../../services/chefApply';
import { useLanguage } from '../../context/LanguageContext';
import { useColors, type NafasColors } from '../../hooks/useColors';
import { useRTL } from '../../hooks/useRTL';

type Step = 'location' | 'details';

type Coords = { latitude: number; longitude: number };

export default function ChefApplyScreen() {
  const { t } = useLanguage();
  const { rowDirection, textAlign, isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [step, setStep] = useState<Step>('location');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [chefName, setChefName] = useState('');
  const [bio, setBio] = useState('');
  const [minOrderPrice, setMinOrderPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onConfirmLocation = () => {
    if (!coords) {
      Alert.alert(t('chefApply.validation.coordinatesRequired'));
      return;
    }
    setStep('details');
  };

  const onSubmit = async () => {
    const name = chefName.trim();
    if (!name) {
      Alert.alert(t('chefApply.validation.chefNameRequired'));
      return;
    }
    if (!bio.trim()) {
      Alert.alert(t('chefApply.validation.bioRequired'));
      return;
    }
    const price = parseFloat(minOrderPrice);
    if (!price || price <= 0) {
      Alert.alert(t('chefApply.validation.minOrderPricePositive'));
      return;
    }
    if (!coords) {
      Alert.alert(t('chefApply.validation.coordinatesRequired'));
      setStep('location');
      return;
    }

    setSubmitting(true);
    try {
      await applyToBeAChef({
        chefName: name,
        bio: bio.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        minOrderPrice: price,
      });
      router.replace('/(auth)/pending-verification');
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: ApplyErrorPayload } };
      if (ax.response?.status === 409 && ax.response.data) {
        const data = ax.response.data;
        switch (data.code) {
          case 'ALREADY_CHEF':
            Alert.alert(t('chefApply.error.alreadyChef'));
            break;
          case 'APPLICATION_PENDING':
            router.replace('/(auth)/pending-verification');
            break;
          case 'APPLICATION_COOLDOWN_IN_EFFECT': {
            const date = new Date(data.earliestResubmitAt).toLocaleDateString();
            Alert.alert(t('chefApply.error.cooldown', { date }));
            break;
          }
        }
      } else {
        Alert.alert(t('common.networkError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === 'details') {
      setStep('location');
    } else {
      router.back();
    }
  };

  const title =
    step === 'location'
      ? t('chefApply.locationStep.title')
      : t('chefApply.detailsStep.title');

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather
            name={isRTL ? 'chevron-right' : 'chevron-left'}
            size={24}
            color={colors.text}
          />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {step === 'location' ? (
        <LocationStep
          colors={colors}
          coords={coords}
          setCoords={setCoords}
          onConfirm={onConfirmLocation}
          insetsBottom={insets.bottom}
          confirmLabel={t('chefApply.locationStep.confirmCta')}
          textAlign={textAlign}
        />
      ) : (
        <DetailsStep
          colors={colors}
          rowDirection={rowDirection}
          textAlign={textAlign}
          insetsBottom={insets.bottom}
          chefName={chefName}
          setChefName={setChefName}
          bio={bio}
          setBio={setBio}
          minOrderPrice={minOrderPrice}
          setMinOrderPrice={setMinOrderPrice}
          submitting={submitting}
          onSubmit={onSubmit}
          t={t}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ───────── Step 1: location picker ─────────

function LocationStep({
  colors,
  coords,
  setCoords,
  onConfirm,
  insetsBottom,
  confirmLabel,
  textAlign,
}: {
  colors: NafasColors;
  coords: Coords | null;
  setCoords: (c: Coords) => void;
  onConfirm: () => void;
  insetsBottom: number;
  confirmLabel: string;
  textAlign: 'left' | 'right';
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.mapStep}>
      <View style={styles.mapFull}>
        <KitchenLocationPicker
          value={coords}
          onChange={setCoords}
        />
      </View>
      <View
        style={[
          styles.mapCtaWrap,
          { paddingBottom: insetsBottom + 24 },
        ]}
      >
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.primaryCtaPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
        >
          <Text style={styles.primaryCtaText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ───────── Step 2: details form ─────────

function DetailsStep({
  colors,
  rowDirection,
  textAlign,
  insetsBottom,
  chefName,
  setChefName,
  bio,
  setBio,
  minOrderPrice,
  setMinOrderPrice,
  submitting,
  onSubmit,
  t,
}: {
  colors: NafasColors;
  rowDirection: 'row' | 'row-reverse';
  textAlign: 'left' | 'right';
  insetsBottom: number;
  chefName: string;
  setChefName: (s: string) => void;
  bio: string;
  setBio: (s: string) => void;
  minOrderPrice: string;
  setMinOrderPrice: (s: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.formScroll,
          { paddingBottom: 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { textAlign }]}>
            {t('chefApply.detailsStep.chefNameLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { textAlign }]}
            value={chefName}
            onChangeText={setChefName}
            placeholder={t('chefApply.detailsStep.chefNameLabel')}
            placeholderTextColor={colors.muted}
            maxLength={80}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { textAlign }]}>
            {t('chefApply.detailsStep.bioLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textarea, { textAlign }]}
            value={bio}
            onChangeText={setBio}
            placeholder={t('chefApply.detailsStep.bioLabel')}
            placeholderTextColor={colors.muted}
            maxLength={1000}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { textAlign }]}>
            {t('chefApply.detailsStep.minOrderPriceLabel')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { textAlign }]}
            value={minOrderPrice}
            onChangeText={setMinOrderPrice}
            placeholder="50.00"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            maxLength={10}
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.formCtaWrap,
          { paddingBottom: insetsBottom + 16 },
        ]}
      >
        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.primaryCtaPressed,
            submitting && styles.primaryCtaDisabled,
          ]}
          accessibilityRole="button"
        >
          <View style={[styles.primaryCtaRow, { flexDirection: rowDirection }]}>
            <Feather name="send" size={20} color={colors.primaryText} />
            <Text style={styles.primaryCtaText}>
              {t('chefApply.detailsStep.submitCta')}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    // location step
    mapStep: { flex: 1, position: 'relative' },
    mapFull: { flex: 1, height: undefined },
    mapCtaWrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 0,
      paddingTop: 8,
    },
    // form step
    formScroll: {
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 16,
    },
    field: { gap: 6 },
    fieldLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    required: { color: colors.danger },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    textarea: {
      minHeight: 100,
      paddingTop: 12,
    },
    formCtaWrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    // shared CTA
    primaryCta: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 100,
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 6,
    },
    primaryCtaPressed: { opacity: 0.9 },
    primaryCtaDisabled: { opacity: 0.6 },
    primaryCtaRow: {
      alignItems: 'center',
      gap: 10,
    },
    primaryCtaText: {
      color: colors.primaryText,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
