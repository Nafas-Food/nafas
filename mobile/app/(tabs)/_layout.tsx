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
      <Tabs.Screen name="index" options={{ href: undefined }} />
      <Tabs.Screen name="explore" options={{ href: undefined }} />
      <Tabs.Screen name="favorites" options={{ href: undefined }} />
      <Tabs.Screen name="orders" options={{ href: undefined }} />
      <Tabs.Screen name="profile" options={{ href: undefined }} />
    </Tabs>
  );
}