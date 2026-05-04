import React from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, clearSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;

    // The mobile app is customer/chef only. Admin and driver accounts must
    // not be allowed past sign-in — they have separate surfaces.
    if (user && user.role !== 'CUSTOMER' && user.role !== 'CHEF') {
      clearSession().catch(() => {});
      return;
    }

    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/welcome');
    } else if (user && inAuth) {
      router.replace(user.role === 'CHEF' ? '/(chef)' : '/(tabs)');
    }
  }, [isLoading, user, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <>{children}</>;
}

function ProvidersInner({ children }: { children: React.ReactNode }) {
  const { ready } = useLanguage();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <RouteGuard>{children}</RouteGuard>;
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ProvidersInner>
          <Slot />
        </ProvidersInner>
      </AuthProvider>
    </LanguageProvider>
  );
}
