import React from 'react';
import { Slot } from 'expo-router';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import { AuthProvider } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

function ProvidersInner({ children }: { children: React.ReactNode }) {
  const { ready } = useLanguage();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <>{children}</>;
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