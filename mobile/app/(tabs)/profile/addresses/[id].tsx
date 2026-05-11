// US3 acceptance scenario 3 — verified manually per quickstart Step 6.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { AddressPickerMap } from '../../../../components/AddressPickerMap';
import { addressesService, Address, AddressInUseError } from '../../../../services/addresses';
import { useLanguage } from '../../../../context/LanguageContext';
import { useColors } from '../../../../hooks/useColors';
import { useRTL } from '../../../../hooks/useRTL';

export default function EditAddressScreen() {
  const { t } = useLanguage();
  const { textAlign } = useRTL();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Address | null>(null);
  const [label, setLabel] = useState('');
  const [streetName, setStreetName] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [inUse, setInUse] = useState<AddressInUseError | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await addressesService.list();
        if (cancelled) return;
        const found = all.find((a) => a.id === id);
        if (!found) {
          router.back();
          return;
        }
        setLoaded(found);
        setLabel(found.label);
        setStreetName(found.streetName);
        setCoords({ latitude: parseFloat(found.latitude), longitude: parseFloat(found.longitude) });
      } catch {
        if (!cancelled) router.back();
      }
    })();
    return () => { cancelled = true; };
  }, [id, router]);

  if (!loaded || !coords) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  const onSave = async () => {
    if (!label.trim()) { Alert.alert(t('addresses.validation.labelRequired')); return; }
    setBusy(true);
    try {
      await addressesService.update(loaded.id, {
        label: label.trim(),
        streetName,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      router.back();
    } catch {
      Alert.alert(t('common.networkError'));
    } finally { setBusy(false); }
  };

  const onDeleteConfirmed = async () => {
    setBusy(true);
    try {
      await addressesService.delete(loaded.id);
      router.back();
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409 && e.response.data?.code === 'ADDRESS_IN_USE') {
        setInUse(e.response.data as AddressInUseError);
      } else {
        Alert.alert(t('common.networkError'));
      }
    } finally { setBusy(false); }
  };

  const onDelete = () => {
    Alert.alert(
      t('addresses.deleteConfirm.title'),
      t('addresses.deleteConfirm.body'),
      [
        { text: t('addresses.deleteConfirm.cancel'), style: 'cancel' },
        { text: t('addresses.deleteConfirm.confirm'), style: 'destructive', onPress: onDeleteConfirmed },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <AddressPickerMap value={coords} onChange={setCoords} onReverseGeocode={setStreetName} />

      <Text style={[styles.label, { textAlign }]}>{t('addresses.form.label')}</Text>
      <TextInput
        style={[styles.input, { textAlign }]}
        value={label}
        onChangeText={setLabel}
        maxLength={80}
      />

      <Text style={[styles.label, { textAlign }]}>{t('addresses.form.streetName')}</Text>
      <TextInput
        style={[styles.input, { textAlign }]}
        value={streetName}
        onChangeText={setStreetName}
        maxLength={200}
      />

      <Pressable style={[styles.cta, busy && styles.disabled]} onPress={onSave} disabled={busy}>
        <Text style={styles.ctaText}>{t('addresses.form.save')}</Text>
      </Pressable>

      <Pressable style={[styles.danger, busy && styles.disabled]} onPress={onDelete} disabled={busy}>
        <Text style={styles.dangerText}>{t('addresses.edit.delete')}</Text>
      </Pressable>

      {inUse ? (
        <View style={styles.inUseBox}>
          <Text style={[styles.inUseTitle, { textAlign }]}>{t('addresses.inUse.title')}</Text>
          <Text style={[styles.inUseBody, { textAlign }]}>{t('addresses.inUse.body')}</Text>
          <Pressable
            style={styles.cta}
            onPress={() => router.push(`/(tabs)/orders/${inUse.activeOrderId}`)}
          >
            <Text style={styles.ctaText}>{t('addresses.inUse.viewOrderCta')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryCta} onPress={() => setInUse(null)}>
            <Text>{t('addresses.inUse.ok')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    wrap: { padding: 16, gap: 8, backgroundColor: colors.background },
    label: { fontSize: 14, fontWeight: '600', marginTop: 12, color: colors.text },
    input: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, backgroundColor: colors.surface },
    cta: { marginTop: 24, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    secondaryCta: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
    ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
    disabled: { opacity: 0.6 },
    danger: { marginTop: 12, borderWidth: 1, borderColor: colors.danger, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    dangerText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
    inUseBox: { marginTop: 24, padding: 16, borderRadius: 8, backgroundColor: colors.warningSurface, borderColor: colors.warningBorder, borderWidth: 1, gap: 8 },
    inUseTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    inUseBody: { fontSize: 14, color: colors.text },
  });
}