import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addressesService, Address } from '../../../services/addresses';
import { defaultAddressStore } from '../../../services/defaultAddress';
import { useLanguage } from '../../../context/LanguageContext';
import { useColors, type NafasColors } from '../../../hooks/useColors';
import { useRTL } from '../../../hooks/useRTL';

const TAB_BAR_CLEARANCE = 96;

export default function AddressesScreen() {
  const { t } = useLanguage();
  const { rowDirection, textAlign, isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [items, setItems] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, storedDefault] = await Promise.all([
        addressesService.list(),
        defaultAddressStore.get(),
      ]);
      setItems(list);
      if (storedDefault && list.some((a) => a.id === storedDefault)) {
        setDefaultId(storedDefault);
      } else if (list.length > 0) {
        // First-run / stale-default fallback — promote the first address.
        await defaultAddressStore.set(list[0].id);
        setDefaultId(list[0].id);
      } else {
        setDefaultId(null);
      }
    } catch {
      setItems([]);
      setError(t('common.networkError'));
    }
  }, [t]);

  const onSetDefault = useCallback(async (id: string) => {
    setDefaultId(id);
    await defaultAddressStore.set(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onAdd = () => router.push('/(tabs)/profile/addresses/new');

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
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
          {t('addresses.list.title')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Feather name="map-pin" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { textAlign }]}>
            {t('addresses.list.empty.title')}
          </Text>
          <Text style={[styles.emptyBody, { textAlign }]}>
            {t('addresses.list.empty.body')}
          </Text>
          {error ? (
            <Text style={[styles.error, { textAlign }]}>{error}</Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + 80 },
          ]}
          renderItem={({ item }) => (
            <AddressRow
              item={item}
              isDefault={item.id === defaultId}
              onPress={() =>
                router.push(`/(tabs)/profile/addresses/${item.id}`)
              }
              onSetDefault={() => onSetDefault(item.id)}
              colors={colors}
              rowDirection={rowDirection}
              textAlign={textAlign}
              isRTL={isRTL}
              defaultLabel={t('addresses.list.defaultBadge')}
              setDefaultA11y={t('addresses.list.setDefaultA11y')}
            />
          )}
        />
      )}

      <View
        pointerEvents="box-none"
        style={[
          styles.fabWrap,
          { bottom: insets.bottom + TAB_BAR_CLEARANCE },
        ]}
      >
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('addresses.list.addCta')}
        >
          <View style={[styles.fabRow, { flexDirection: rowDirection }]}>
            <Feather name="plus" size={22} color={colors.primaryText} />
            <Text style={styles.fabText}>{t('addresses.list.addCta')}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function AddressRow({
  item,
  isDefault,
  onPress,
  onSetDefault,
  colors,
  rowDirection,
  textAlign,
  isRTL,
  defaultLabel,
  setDefaultA11y,
}: {
  item: Address;
  isDefault: boolean;
  onPress: () => void;
  onSetDefault: () => void;
  colors: NafasColors;
  rowDirection: 'row' | 'row-reverse';
  textAlign: 'left' | 'right';
  isRTL: boolean;
  defaultLabel: string;
  setDefaultA11y: string;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const detailLine = [
    item.streetName,
    item.building,
    item.floor,
    item.apartment,
  ]
    .map((s) => (s ? s.trim() : ''))
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isDefault && styles.rowDefault,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.rowInner, { flexDirection: rowDirection }]}>
        <View style={styles.rowIconWrap}>
          <Feather name="map-pin" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowText}>
          <View
            style={[styles.rowLabelRow, { flexDirection: rowDirection }]}
          >
            <Text
              style={[styles.rowLabel, { textAlign }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {isDefault ? (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>{defaultLabel}</Text>
              </View>
            ) : null}
          </View>
          {detailLine ? (
            <Text
              style={[styles.rowDetail, { textAlign }]}
              numberOfLines={2}
            >
              {detailLine}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onSetDefault}
          disabled={isDefault}
          hitSlop={10}
          style={styles.starBtn}
          accessibilityRole="button"
          accessibilityLabel={setDefaultA11y}
          accessibilityState={{ selected: isDefault }}
        >
          <Ionicons
            name={isDefault ? 'radio-button-on' : 'radio-button-off'}
            size={24}
            color={isDefault ? colors.primary : colors.muted}
          />
        </Pressable>
        <Feather
          name={isRTL ? 'chevron-left' : 'chevron-right'}
          size={20}
          color={colors.muted}
        />
      </View>
    </Pressable>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 12,
      backgroundColor: colors.background,
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    emptyBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 10,
    },
    row: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 1,
    },
    rowDefault: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    rowPressed: {
      backgroundColor: colors.primaryLight,
    },
    rowInner: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    rowIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1, gap: 2 },
    rowLabelRow: {
      alignItems: 'center',
      gap: 8,
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      flexShrink: 1,
    },
    rowDetail: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
    defaultBadge: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    defaultBadgeText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    starBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabWrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      alignItems: 'stretch',
    },
    fab: {
      backgroundColor: colors.primary,
      paddingHorizontal: 22,
      paddingVertical: 16,
      borderRadius: 100,
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 6,
    },
    fabPressed: { opacity: 0.85 },
    fabRow: { alignItems: 'center', gap: 10 },
    fabText: {
      color: colors.primaryText,
      fontSize: 16,
      fontWeight: '700',
    },
    error: { color: colors.danger, marginTop: 12 },
  });
}
