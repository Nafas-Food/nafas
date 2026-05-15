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
import { AddressPickerMap } from '../../../../components/AddressPickerMap';
import { addressesService } from '../../../../services/addresses';
import { useLanguage } from '../../../../context/LanguageContext';
import { useColors, type NafasColors } from '../../../../hooks/useColors';
import { useRTL } from '../../../../hooks/useRTL';

type Coords = { latitude: number; longitude: number };

export default function NewAddressScreen() {
  const { t } = useLanguage();
  const { rowDirection, textAlign, isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [step, setStep] = useState<'map' | 'form'>('map');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [label, setLabel] = useState('');
  const [streetName, setStreetName] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const onConfirmLocation = () => {
    if (!coords) {
      Alert.alert(t('addresses.validation.coordinatesInvalid'));
      return;
    }
    setStep('form');
  };

  const onSave = async () => {
    if (!label.trim()) {
      Alert.alert(t('addresses.validation.labelRequired'));
      return;
    }
    if (!streetName.trim()) {
      Alert.alert(t('addresses.form.streetName'));
      return;
    }
    if (!coords) {
      Alert.alert(t('addresses.validation.coordinatesInvalid'));
      setStep('map');
      return;
    }
    setSaving(true);
    try {
      await addressesService.create({
        label: label.trim(),
        streetName: streetName.trim(),
        building: building.trim() || undefined,
        floor: floor.trim() || undefined,
        apartment: apartment.trim() || undefined,
        notes: notes.trim() || undefined,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      router.back();
    } catch {
      Alert.alert(t('common.networkError'));
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (step === 'form') {
      setStep('map');
    } else {
      router.back();
    }
  };

  const title =
    step === 'map'
      ? t('addresses.form.setLocationTitle')
      : t('addresses.form.addAddressTitle');

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

      {step === 'map' ? (
        <MapStep
          colors={colors}
          coords={coords}
          setCoords={setCoords}
          setStreetName={setStreetName}
          onConfirm={onConfirmLocation}
          insetsBottom={insets.bottom}
          permissionDeniedHint={t('addresses.picker.permissionDeniedHint')}
          confirmLabel={t('addresses.form.confirmLocation')}
          textAlign={textAlign}
        />
      ) : (
        <FormStep
          colors={colors}
          rowDirection={rowDirection}
          textAlign={textAlign}
          insetsBottom={insets.bottom}
          label={label}
          setLabel={setLabel}
          streetName={streetName}
          setStreetName={setStreetName}
          building={building}
          setBuilding={setBuilding}
          floor={floor}
          setFloor={setFloor}
          apartment={apartment}
          setApartment={setApartment}
          notes={notes}
          setNotes={setNotes}
          saving={saving}
          onChangeLocation={() => setStep('map')}
          onSave={onSave}
          t={t}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ───────── Step 1: full-screen map ─────────

function MapStep({
  colors,
  coords,
  setCoords,
  setStreetName,
  onConfirm,
  insetsBottom,
  permissionDeniedHint,
  confirmLabel,
  textAlign,
}: {
  colors: NafasColors;
  coords: Coords | null;
  setCoords: (c: Coords) => void;
  setStreetName: (s: string) => void;
  onConfirm: () => void;
  insetsBottom: number;
  permissionDeniedHint: string;
  confirmLabel: string;
  textAlign: 'left' | 'right';
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.mapStep}>
      <AddressPickerMap
        value={coords}
        onChange={setCoords}
        onReverseGeocode={setStreetName}
        style={styles.mapFull}
      />
      <Text style={[styles.mapHint, { textAlign }]}>
        {permissionDeniedHint}
      </Text>
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

// ───────── Step 2: form ─────────

function FormStep({
  colors,
  rowDirection,
  textAlign,
  insetsBottom,
  label,
  setLabel,
  streetName,
  setStreetName,
  building,
  setBuilding,
  floor,
  setFloor,
  apartment,
  setApartment,
  notes,
  setNotes,
  saving,
  onChangeLocation,
  onSave,
  t,
}: {
  colors: NafasColors;
  rowDirection: 'row' | 'row-reverse';
  textAlign: 'left' | 'right';
  insetsBottom: number;
  label: string;
  setLabel: (s: string) => void;
  streetName: string;
  setStreetName: (s: string) => void;
  building: string;
  setBuilding: (s: string) => void;
  floor: string;
  setFloor: (s: string) => void;
  apartment: string;
  setApartment: (s: string) => void;
  notes: string;
  setNotes: (s: string) => void;
  saving: boolean;
  onChangeLocation: () => void;
  onSave: () => void;
  t: (k: string, p?: Record<string, string>) => string;
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
        <Pressable
          onPress={onChangeLocation}
          style={({ pressed }) => [
            styles.locationChip,
            { flexDirection: rowDirection },
            pressed && styles.locationChipPressed,
          ]}
          accessibilityRole="button"
        >
          <Feather name="map-pin" size={18} color={colors.primary} />
          <Text style={[styles.locationChipText, { textAlign }]}>
            {t('addresses.form.pinnedLocation')}
          </Text>
          <Text style={styles.locationChange}>
            {t('addresses.form.changeLocation')}
          </Text>
        </Pressable>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { textAlign }]}>
            {t('addresses.form.label')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { textAlign }]}
            value={label}
            onChangeText={setLabel}
            placeholder={t('addresses.form.labelPlaceholder')}
            placeholderTextColor={colors.muted}
            maxLength={80}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { textAlign }]}>
            {t('addresses.form.streetName')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { textAlign }]}
            value={streetName}
            onChangeText={setStreetName}
            placeholder={t('addresses.form.streetNamePlaceholder')}
            placeholderTextColor={colors.muted}
            maxLength={200}
          />
        </View>

        <View style={[styles.row, { flexDirection: rowDirection }]}>
          <View style={styles.thirdField}>
            <Text style={[styles.fieldLabel, { textAlign }]}>
              {t('addresses.form.buildingLabel')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign }]}
              value={building}
              onChangeText={setBuilding}
              placeholder={t('addresses.form.buildingPlaceholder')}
              placeholderTextColor={colors.muted}
              maxLength={80}
              keyboardType="default"
            />
          </View>
          <View style={styles.thirdField}>
            <Text style={[styles.fieldLabel, { textAlign }]}>
              {t('addresses.form.floor')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign }]}
              value={floor}
              onChangeText={setFloor}
              placeholder={t('addresses.form.floorPlaceholder')}
              placeholderTextColor={colors.muted}
              maxLength={20}
            />
          </View>
          <View style={styles.thirdField}>
            <Text style={[styles.fieldLabel, { textAlign }]}>
              {t('addresses.form.apartmentLabel')}
            </Text>
            <TextInput
              style={[styles.input, { textAlign }]}
              value={apartment}
              onChangeText={setApartment}
              placeholder={t('addresses.form.apartmentPlaceholder')}
              placeholderTextColor={colors.muted}
              maxLength={20}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { textAlign }]}>
            {t('addresses.form.notesLabel')}
          </Text>
          <Text style={[styles.fieldHint, { textAlign }]}>
            {t('addresses.form.notesHint')}
          </Text>
          <TextInput
            style={[styles.input, styles.textarea, { textAlign }]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('addresses.form.notesPlaceholder')}
            placeholderTextColor={colors.muted}
            maxLength={500}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
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
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryCta,
            pressed && styles.primaryCtaPressed,
            saving && styles.primaryCtaDisabled,
          ]}
          accessibilityRole="button"
        >
          <View style={[styles.primaryCtaRow, { flexDirection: rowDirection }]}>
            <Feather name="save" size={20} color={colors.primaryText} />
            <Text style={styles.primaryCtaText}>
              {t('addresses.form.saveAddress')}
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
    // map step
    mapStep: { flex: 1, position: 'relative' },
    mapFull: { flex: 1, height: undefined },
    mapHint: {
      position: 'absolute',
      top: 12,
      left: 16,
      right: 16,
      backgroundColor: colors.surface,
      color: colors.muted,
      fontSize: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
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
    locationChip: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.primaryLight,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    locationChipPressed: { opacity: 0.85 },
    locationChipText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    locationChange: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    field: { gap: 6 },
    row: { gap: 12 },
    halfField: { flex: 1, gap: 6 },
    thirdField: { flex: 1, gap: 6 },
    fieldLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    fieldHint: {
      fontSize: 12,
      color: colors.muted,
      marginTop: -2,
      marginBottom: 2,
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
      minHeight: 84,
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
