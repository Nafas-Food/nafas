import React from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, clearSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;

    // The mobile app is customer/chef only. Admin and driver accounts must
    // not be allowed past sign-in — they have separate surfaces.
    if (user && user.role !== 'customer' && user.role !== 'chef') {
      clearSession().catch(() => {});
      return;
    }

    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/welcome');
    } else if (user && inAuth) {
      router.replace(user.role === 'chef' ? '/(chef)' : '/(tabs)');
    }
  }, [isLoading, user, segments, router, clearSession]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Synchronous guard: never flash protected UI for unsupported roles.
  // Session clearing for this case is handled by the effect above —
  // calling clearSession() here would be a side effect during render.
  if (user && user.role !== 'customer' && user.role !== 'chef') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <>{children}</>;
}

function ProvidersInner({ children }: { children: React.ReactNode }) {
  const { ready, isRTL } = useLanguage();
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // If font loading errors out (e.g., offline first launch), don't block the
  // app — fall back to system fonts so the user can still sign in.
  if (!ready || (!fontsLoaded && !fontsError)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <View key={isRTL ? 'rtl' : 'ltr'} style={{ flex: 1 }}>
      <RouteGuard>{children}</RouteGuard>
    </View>
  );
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
