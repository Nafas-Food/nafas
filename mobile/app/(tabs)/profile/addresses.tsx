import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { addressesService, Address } from '../../../services/addresses';
import { useLanguage } from '../../../context/LanguageContext';
import { useColors } from '../../../hooks/useColors';
import { useRTL } from '../../../hooks/useRTL';

export default function AddressesScreen() {
  const { t } = useLanguage();
  const { rowDirection, textAlign } = useRTL();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [items, setItems] = React.useState<Address[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems(await addressesService.list());
    } catch {
      setError(t('common.networkError'));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (items === null) {
    return (
      <View style={styles.center}><ActivityIndicator /></View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { textAlign }]}>{t('addresses.list.empty.title')}</Text>
        <Text style={[styles.emptyBody, { textAlign }]}>{t('addresses.list.empty.body')}</Text>
        <Link href="/(tabs)/profile/addresses/new" asChild>
          <Pressable style={styles.cta}>
            <Text style={styles.ctaText}>{t('addresses.list.addCta')}</Text>
          </Pressable>
        </Link>
        {error ? <Text style={[styles.error, { textAlign }]}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/profile/addresses/${item.id}`)}
            style={[styles.row, { flexDirection: rowDirection }]}
          >
            <Text style={[styles.label, { textAlign }]}>{item.label}</Text>
            <Text style={[styles.street, { textAlign }]}>{item.streetName || '—'}</Text>
          </Pressable>
        )}
      />
      <Link href="/(tabs)/profile/addresses/new" asChild>
        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>{t('addresses.list.addCta')}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
    emptyBody: { fontSize: 14, color: colors.muted },
    wrap: { flex: 1, padding: 16, backgroundColor: colors.background },
    row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, justifyContent: 'space-between' },
    label: { fontSize: 16, fontWeight: '600', color: colors.text },
    street: { fontSize: 14, color: colors.muted },
    cta: { alignSelf: 'center', marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
    error: { color: colors.danger, marginTop: 12 },
  });
}