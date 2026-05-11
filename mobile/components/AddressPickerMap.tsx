import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLanguage } from '../context/LanguageContext';
import { useColors } from '../hooks/useColors';

interface Coords {
  latitude: number;
  longitude: number;
}

interface Props {
  value: Coords | null;
  onChange: (next: Coords) => void;
  onReverseGeocode?: (street: string) => void;
  initialRegion?: Region;
  testID?: string;
}

const CAIRO: Region = {
  latitude: 30.0444,
  longitude: 31.2357,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export function AddressPickerMap({
  value,
  onChange,
  onReverseGeocode,
  initialRegion,
  testID,
}: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialRegion || value) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const here = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        mapRef.current?.animateToRegion(
          {
            latitude: here.coords.latitude,
            longitude: here.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          500,
        );
      } catch {
        // swallow per FR-007 — Cairo fallback already in startRegion
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialRegion, value]);

  const handleRegionChangeComplete = (region: Region) => {
    const next = { latitude: region.latitude, longitude: region.longitude };
    onChange(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!onReverseGeocode) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await Location.reverseGeocodeAsync(next);
        const first = results[0];
        if (!first) return;
        const parts = [first.street, first.district, first.city].filter(Boolean);
        if (parts.length) onReverseGeocode(parts.join(', '));
      } catch {
        // FR-006: silently absorb
      }
    }, 500);
  };

  const startRegion: Region =
    initialRegion ??
    (value
      ? { ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : CAIRO);

  return (
    <View style={styles.wrap} testID={testID}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={startRegion}
        onRegionChangeComplete={handleRegionChangeComplete}
      />
      <View
        pointerEvents="none"
        style={styles.pinWrap}
        accessibilityLabel={t('addresses.picker.pinAccessibility')}
      >
        <View style={styles.pin} />
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: { width: '100%', height: 320, position: 'relative' },
    map: { width: '100%', height: '100%' },
    pinWrap: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginLeft: -12,
      marginTop: -24,
      width: 24,
      height: 24,
    },
    pin: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      borderWidth: 3,
      borderColor: colors.surface,
    },
  });
}