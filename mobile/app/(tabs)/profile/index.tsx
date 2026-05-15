import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../../../context/AuthContext';
import { signOut as signOutApi } from '../../../services/auth';
import { useLanguage } from '../../../context/LanguageContext';
import { useRTL } from '../../../hooks/useRTL';
import { useColors } from '../../../hooks/useColors';
import { LanguageToggle } from '../../../components/LanguageToggle';

export default function ProfileScreen() {
  const { user, clearSession, getRefreshToken } = useAuth();
  const { t } = useLanguage();
  const { rowDirection, textAlign, isRTL } = useRTL();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const onSignOut = async () => {
    try {
      const stored = await getRefreshToken();
      if (stored) {
        await signOutApi(stored).catch(() => {});
      }
    } finally {
      await clearSession();
    }
  };

  const confirmSignOut = () => {
    Alert.alert(t('profile.signOut'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: onSignOut },
    ]);
  };

  const menuItems = [
    {
      icon: 'map-pin' as const,
      label: t('addresses.list.title'),
      onPress: () => router.push('/(tabs)/profile/addresses'),
    },
    {
      icon: 'log-out' as const,
      label: t('profile.signOut'),
      onPress: confirmSignOut,
      danger: true,
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <LanguageToggle />
      </View>

      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <View style={styles.avatar}>
          <Feather name="user" size={24} color={colors.primary} />
        </View>
        <Text style={[styles.name, { textAlign }]}>
          {user?.fullName ?? ''}
        </Text>
      </View>

      <View style={styles.menu}>
        {menuItems.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={[styles.menuRow, { flexDirection: rowDirection }]}
          >
            <Feather
              name={item.icon}
              size={20}
              color={item.danger ? colors.danger : colors.text}
            />
            <Text
              style={[
                styles.menuLabel,
                { textAlign },
                item.danger && styles.menuLabelDanger,
              ]}
            >
              {item.label}
            </Text>
            {!item.danger && (
              <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color={colors.muted} />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      alignItems: 'flex-end',
      backgroundColor: colors.surface,
    },
    header: {
      alignItems: 'center',
      gap: 16,
      padding: 20,
      paddingTop: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    menu: {
      marginTop: 8,
    },
    menuRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 20,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    menuLabelDanger: {
      color: colors.danger,
    },
  });
}
