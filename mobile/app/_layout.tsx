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

// /(auth) screens a signed-in customer is allowed to reach directly
// (e.g. via in-app navigation from /(tabs)). Without this whitelist the
// "customer in auth segment" rule would bounce them back to /(tabs)
// before they could see the screen.
const CUSTOMER_AUTH_SCREEN_WHITELIST: ReadonlySet<string> = new Set([
  'chef-apply',
  'pending-verification',
]);

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, pendingApplication, clearSession } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;

    const inAuth = segments[0] === '(auth)';
    const authScreen = inAuth ? segments[1] : undefined;
    const inChef = segments[0] === '(chef)';
    const inTabs = segments[0] === '(tabs)';

    // 1. Signed-out → welcome
    if (!user) {
      if (!inAuth) {
        router.replace('/(auth)/welcome');
      }
      return;
    }

    // 2. Admin → clear session and route to welcome (no mobile surface)
    if (user.role === 'admin') {
      clearSession().catch(() => {});
      return;
    }

    // 3. Pending application + customer → pending-verification
    if (pendingApplication && user.role === 'customer') {
      if (authScreen === 'pending-verification') {
        // already on the right screen
        return;
      }
      router.replace('/(auth)/pending-verification');
      return;
    }

    // 4. Chef → chef route group (redirect even when already in /(tabs)
    //    so a role change from customer→chef is picked up on re-render).
    if (user.role === 'chef') {
      if (!inChef) {
        router.replace('/(chef)');
      }
      return;
    }

    // 5. Customer with no pending application → tabs (redirect even when
    //    already in /(chef) so a role change from chef→customer is picked
    //    up, but allow whitelisted /(auth) screens).
    if (user.role === 'customer') {
      const onWhitelistedAuthScreen =
        inAuth && authScreen && CUSTOMER_AUTH_SCREEN_WHITELIST.has(authScreen);
      if (!inTabs && !onWhitelistedAuthScreen) {
        router.replace('/(tabs)');
      }
      return;
    }
  }, [isLoading, user, pendingApplication, segments, router, clearSession]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Synchronous guard: never flash protected UI for unsupported roles.
  // Session clearing for admin is handled by the effect above.
  if (user && user.role === 'admin') {
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
