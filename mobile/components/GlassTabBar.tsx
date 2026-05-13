import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import { useRTL } from '../hooks/useRTL';
import { useColors, type NafasColors } from '../hooks/useColors';

function TabButton({
  tab,
  colors,
}: {
  tab: {
    name: string;
    icon: keyof typeof Feather.glyphMap;
    label: string;
    isFocused: boolean;
    onPress: () => void;
    onLongPress: () => void;
  };
  colors: NafasColors;
}) {
  const styles = makeStyles(colors);
  const iconColor = tab.isFocused ? colors.primary : colors.muted;

  return (
    <Pressable
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      style={[styles.tabItem, tab.isFocused && styles.tabItemActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: tab.isFocused }}
    >
      <Feather name={tab.icon} size={22} color={iconColor} />
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={[styles.tabLabel, tab.isFocused && styles.tabLabelActive]}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

const TOP_LEVEL_TABS = ['index', 'explore', 'favorites', 'orders', 'profile'];

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();
  const { isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const filteredRoutes = state.routes.filter((route) =>
    TOP_LEVEL_TABS.includes(route.name),
  );
  const filteredIndex = filteredRoutes.findIndex(
    (route) => route.key === state.routes[state.index]?.key,
  );

  const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
    index: 'home',
    explore: 'search',
    favorites: 'heart',
    orders: 'shopping-bag',
    profile: 'user',
  };

  const labelMap: Record<string, string> = {
    index: t('tabs.home'),
    explore: t('tabs.explore'),
    favorites: t('tabs.favorites'),
    orders: t('tabs.orders'),
    profile: t('tabs.profile'),
  };

  return (
    <View
      style={[
        styles.barContainer,
        { paddingBottom: Math.max(insets.bottom, 16) },
        isRTL && styles.barContainerRtl,
      ]}
    >
      <BlurView intensity={60} tint="light" style={styles.glassPill}>
        {filteredRoutes.map((route, index) => {
          const isFocused = index === filteredIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate({
                name: route.name,
                key: route.key,
                merge: true,
              } as never);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <TabButton
              key={route.key}
              tab={{
                name: route.name,
                icon: iconMap[route.name] ?? 'home',
                label: labelMap[route.name] ?? route.name,
                isFocused,
                onPress,
                onLongPress,
              }}
              colors={colors}
            />
          );
        })}
      </BlurView>
    </View>
  );
}

function makeStyles(colors: NafasColors) {
  return StyleSheet.create({
    barContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    barContainerRtl: {
      direction: 'rtl',
    },
    glassPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 100,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.75)',
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 32,
        },
        android: {
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          elevation: 10,
        },
      }),
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderRadius: 100,
      minHeight: 48,
    },
    tabItemActive: {
      backgroundColor: 'rgba(196, 98, 45, 0.13)',
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.muted,
      letterSpacing: 0.2,
    },
    tabLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
}