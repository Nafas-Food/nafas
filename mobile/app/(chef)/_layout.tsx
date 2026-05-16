import { Tabs } from 'expo-router';
import { ChefGlassTabBar } from '../../components/ChefGlassTabBar';

export default function ChefLayout() {
  return (
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
    </Tabs>
  );
}
