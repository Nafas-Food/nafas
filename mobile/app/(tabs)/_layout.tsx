import { Tabs } from 'expo-router';
import { GlassTabBar } from '../../components/GlassTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
      <Tabs.Screen name="profile/addresses" options={{ href: null }} />
      <Tabs.Screen name="profile/addresses/new" options={{ href: null }} />
      <Tabs.Screen name="profile/addresses/[id]" options={{ href: null }} />
    </Tabs>
  );
}