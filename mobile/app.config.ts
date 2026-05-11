import type { ExpoConfig } from 'expo/config';

function envKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const iosMapsKey = envKey(process.env.GOOGLE_MAPS_API_KEY_IOS);
const androidMapsKey = envKey(process.env.GOOGLE_MAPS_API_KEY_ANDROID);

if (!iosMapsKey || !androidMapsKey) {
  const missing: string[] = [];
  if (!iosMapsKey) missing.push('GOOGLE_MAPS_API_KEY_IOS');
  if (!androidMapsKey) missing.push('GOOGLE_MAPS_API_KEY_ANDROID');
  console.warn(
    `[app.config] Missing Google Maps key(s): ${missing.join(', ')}. ` +
    'Map tiles may not render on affected platform(s).',
  );
}

const config: ExpoConfig = {
  name: 'mobile',
  slug: 'mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    config: {
      ...(iosMapsKey ? { googleMapsApiKey: iosMapsKey } : {}),
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FAF7F2',
    },
    edgeToEdgeEnabled: true,
    // predictiveBackGestureEnabled is intentionally false: edge-to-edge is
    // enabled for visual immersion, but Nafas uses custom back handling via
    // expo-router (e.g., sheet dismiss, confirmation dialogs on unsaved
    // edits). Enabling the predictive back animation would conflict with
    // those interceptors on Android 15+.
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        ...(androidMapsKey ? { apiKey: androidMapsKey } : {}),
      },
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-secure-store',
    'expo-localization',
    'expo-router',
  ],
};

export default config;