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
      <Feather name={tab.icon} size={20} color={iconColor} />
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

const TOP_LEVEL_TABS = ['dashboard', 'orders', 'menu', 'stats', 'schedule', 'profile'];

export function ChefGlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();
  const { isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const focusedRouteName = state.routes[state.index]?.name;
  // Hide the floating bar on non-tab screens (e.g. the one-time
  // /(chef)/set-location gate). Otherwise the pill draws on top of the
  // screen's own CTA at the bottom.
  if (!focusedRouteName || !TOP_LEVEL_TABS.includes(focusedRouteName)) {
    return null;
  }

  const filteredRoutes = state.routes.filter((route) =>
    TOP_LEVEL_TABS.includes(route.name),
  );
  const filteredIndex = filteredRoutes.findIndex(
    (route) => route.key === state.routes[state.index]?.key,
  );

  const iconMap: Record<string, keyof typeof Feather.glyphMap> = {
    dashboard: 'bar-chart-2',
    orders: 'clipboard',
    menu: 'menu',
    stats: 'pie-chart',
    schedule: 'calendar',
    profile: 'user',
  };

  const labelMap: Record<string, string> = {
    dashboard: t('chefTabs.dashboard'),
    orders: t('chefTabs.orders'),
    menu: t('chefTabs.menu'),
    stats: t('chefTabs.stats'),
    schedule: t('chefTabs.schedule'),
    profile: t('chefTabs.profile'),
  };

  return (
    <View
      style={[
        styles.barContainer,
        { paddingBottom: Math.max(insets.bottom, 16) },
        isRTL && styles.barContainerRtl,
      ]}
    >
      <BlurView intensity={80} tint="light" style={styles.glassPill}>
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
      gap: 0,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 100,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.glassBorder,
      ...Platform.select({
        ios: {
          backgroundColor: colors.glassBackgroundIOS,
          shadowColor: colors.glassShadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: colors.glassShadowOpacity,
          shadowRadius: 24,
        },
        android: {
          backgroundColor: colors.glassBackgroundAndroid,
          elevation: 12,
        },
      }),
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 5,
      paddingHorizontal: 2,
      borderRadius: 100,
      minHeight: 44,
    },
    tabItemActive: {
      backgroundColor: colors.tabItemActiveBg,
    },
    tabLabel: {
      fontSize: 9,
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
