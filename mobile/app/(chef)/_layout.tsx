import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
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
  const [profileError, setProfileError] = React.useState(false);

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
        if (!cancelled) setChecking(false);
      } catch {
        if (!cancelled) setProfileError(true);
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
  if (profileError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <Text style={{ color: colors.danger }}>Failed to load profile.</Text>
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
