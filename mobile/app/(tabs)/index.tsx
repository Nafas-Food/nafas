import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { signOut as signOutApi } from '../../services/auth';

export default function HomePlaceholder() {
  const { user, clearSession, getRefreshToken } = useAuth();
  const { t } = useLanguage();

  const onSignOut = async () => {
    try {
      const stored = await getRefreshToken();
      if (stored) {
        await signOutApi(stored).catch(() => {}); // best-effort server revocation
      }
    } finally {
      await clearSession();
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ fontSize: 18, marginBottom: 24 }}>
        {user ? t('home.greeting', { name: user.fullName }) : t('common.loading')}
      </Text>
      <Pressable onPress={onSignOut} accessibilityRole="button">
        <Text style={{ fontSize: 16 }}>{t('profile.signOut')}</Text>
      </Pressable>
    </View>
  );
}
