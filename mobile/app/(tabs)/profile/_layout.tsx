import { useEffect } from 'react';
import { Stack, useNavigation } from 'expo-router';

type StackLikeNavigation = {
  canGoBack: () => boolean;
  popToTop: () => void;
  getParent: () => {
    addListener: (event: string, handler: () => void) => () => void;
  } | undefined;
};

export default function ProfileLayout() {
  const navigation = useNavigation() as unknown as StackLikeNavigation;

  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;

    // Reset the Profile stack to its root on any tab press so the user
    // always lands on the Profile screen (name + menu) rather than the
    // deep route they last visited (e.g. /profile/addresses).
    const unsubscribe = parent.addListener('tabPress', () => {
      if (navigation.canGoBack()) {
        navigation.popToTop();
      }
    });
    return unsubscribe;
  }, [navigation]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
