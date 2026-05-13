import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useRouter } from 'expo-router';
import { useColors, type NafasColors } from '../hooks/useColors';
import { useLanguage } from '../context/LanguageContext';
import { useRTL } from '../hooks/useRTL';
import { addressesService, type Address } from '../services/addresses';
import { defaultAddressStore } from '../services/defaultAddress';

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; address: Address };

export function DeliverToChip() {
  const colors = useColors();
  const { t } = useLanguage();
  const { rowDirection, textAlign } = useRTL();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const [items, storedDefault] = await Promise.all([
        addressesService.list(),
        defaultAddressStore.get(),
      ]);
      if (items.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      const picked =
        (storedDefault && items.find((a) => a.id === storedDefault)) ||
        items[0];
      setState({ kind: 'ready', address: picked });
    } catch {
      setState({ kind: 'empty' });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onPress = () => {
    if (state.kind === 'empty') {
      router.push('/(tabs)/profile/addresses/new');
    } else {
      router.push('/(tabs)/profile/addresses');
    }
  };

  const bottomText =
    state.kind === 'ready'
      ? state.address.label
      : t('home.addAddress');

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, pressed && styles.wrapPressed]}
      accessibilityRole="button"
      accessibilityLabel={
        state.kind === 'ready'
          ? `${t('home.deliverTo')}: ${state.address.label}`
          : t('home.addAddress')
      }
    >
      <View style={[styles.topRow, { flexDirection: rowDirection }]}>
        <Feather name="map-pin" size={14} color={colors.primary} />
        <Text style={[styles.topLabel, { textAlign }]} numberOfLines={1}>
          {t('home.deliverTo')}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.primary} />
      </View>

      {state.kind === 'loading' ? (
        <ActivityIndicator
          size="small"
          color={colors.muted}
          style={styles.loadingSpinner}
        />
      ) : (
        <Text
          style={[styles.bottomText, { textAlign }]}
          numberOfLines={1}
        >
          {bottomText}
        </Text>
      )}
    </Pressable>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    wrap: {
      alignSelf: 'flex-start',
      paddingHorizontal: 20,
      paddingVertical: 4,
      gap: 2,
    },
    wrapPressed: {
      opacity: 0.6,
    },
    topRow: {
      alignItems: 'center',
      gap: 6,
    },
    topLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.primary,
      letterSpacing: 0.1,
    },
    bottomText: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    loadingSpinner: {
      alignSelf: 'flex-start',
      marginTop: 4,
    },
  });
}
