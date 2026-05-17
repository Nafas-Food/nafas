import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { ChefGlassTabBar } from '../../components/ChefGlassTabBar';
import { useColors } from '../../hooks/useColors';
import { getOwnChefProfile } from '../../services/chefProfile';

// Sentinel: a freshly-verified chef has lat=0, lng=0 (the apply form
// no longer collects coordinates — that's deferred to set-location).
// If we see the sentinel on mount, force the one-time set-location
// screen before the chef can use the tab bar.
function ChefLocationGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const router = useRouter();
  const segments = useSegments() as string[];
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getOwnChefProfile();
        if (cancelled) return;
        const lat = Number(profile.latitude);
        const lng = Number(profile.longitude);
        const unset = lat === 0 && lng === 0;
        const onSetLocation =
          segments[0] === '(chef)' && segments[1] === 'set-location';
        if (unset && !onSetLocation) {
          router.replace('/(chef)/set-location');
        }
      } catch {
        // Profile fetch failed (network / token issue) — fall through;
        // the surrounding role guard will eventually re-route.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, segments]);

  if (checking) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function ChefLayout() {
  return (
    <ChefLocationGate>
      <Tabs
        tabBar={(props) => <ChefGlassTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="dashboard" options={{ href: undefined }} />
        <Tabs.Screen name="orders" options={{ href: undefined }} />
        <Tabs.Screen name="menu" options={{ href: undefined }} />
        <Tabs.Screen name="stats" options={{ href: undefined }} />
        <Tabs.Screen name="schedule" options={{ href: undefined }} />
        <Tabs.Screen name="profile" options={{ href: undefined }} />
        {/* set-location is reachable from the gate above but hidden from
            the floating tab bar (no entry in TOP_LEVEL_TABS). */}
        <Tabs.Screen name="set-location" options={{ href: null }} />
      </Tabs>
    </ChefLocationGate>
  );
}
