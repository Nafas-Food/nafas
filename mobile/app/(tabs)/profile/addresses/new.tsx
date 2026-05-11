import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, ScrollView, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { AddressPickerMap } from '../../../../components/AddressPickerMap';
import { addressesService } from '../../../../services/addresses';
import { useLanguage } from '../../../../context/LanguageContext';
import { useColors } from '../../../../hooks/useColors';
import { useRTL } from '../../../../hooks/useRTL';
import { errorCodeOf } from '../../../../services/api';

export default function NewAddressScreen() {
  const { t } = useLanguage();
  const { textAlign } = useRTL();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [streetName, setStreetName] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const onSave = async () => {
    if (!label.trim()) {
      setErrMsg(t('addresses.validation.labelRequired'));
      return;
    }
    if (!coords) {
      setErrMsg(t('addresses.validation.coordinatesInvalid'));
      return;
    }
    setSaving(true);
    setErrMsg(null);
    try {
      await addressesService.create({
        label: label.trim(),
        streetName,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      router.back();
    } catch (e) {
      setErrMsg(t(`errors.${errorCodeOf(e)}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <AddressPickerMap
        value={coords}
        onChange={setCoords}
        onReverseGeocode={setStreetName}
      />
      <Text style={[styles.hint, { textAlign }]}>{t('addresses.picker.permissionDeniedHint')}</Text>

      {errMsg ? <Text style={[styles.error, { textAlign }]}>{errMsg}</Text> : null}

      <Text style={[styles.label, { textAlign }]}>{t('addresses.form.label')}</Text>
      <TextInput
        style={[styles.input, { textAlign }]}
        value={label}
        onChangeText={setLabel}
        placeholder={t('addresses.form.labelPlaceholder')}
        maxLength={80}
      />

      <Text style={[styles.label, { textAlign }]}>{t('addresses.form.streetName')}</Text>
      <TextInput
        style={[styles.input, { textAlign }]}
        value={streetName}
        onChangeText={setStreetName}
        placeholder={t('addresses.form.streetNamePlaceholder')}
        maxLength={200}
      />

      <Pressable
        style={[styles.cta, saving && styles.ctaDisabled]}
        onPress={onSave}
        disabled={saving}
      >
        <Text style={styles.ctaText}>{t('addresses.form.save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: { padding: 16, gap: 8, backgroundColor: colors.background },
    hint: { fontSize: 12, color: colors.muted, marginTop: 8 },
    label: { fontSize: 14, fontWeight: '600', marginTop: 12, color: colors.text },
    input: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface },
    cta: { marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
    error: { color: colors.danger, marginTop: 8 },
  });
}