import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { api, _setAccessTokenGetter, _setRefreshHook } from '../services/api';
import { refresh, getMe } from '../services/auth';
import { registerFcmToken } from '../services/users';

const REFRESH_KEY = 'nafas.refreshToken';

// Expo Go (SDK 53+) dropped remote-push support. Importing `expo-notifications`
// there triggers a noisy auto-registration error, so we only touch the module
// in a real dev/production build — never in Expo Go.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export type Role = 'customer' | 'chef' | 'admin' | 'driver';

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string;
  role: Role;
  phoneVerified: boolean;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  pendingApplication: { applicationId: string } | null;
  role: Role;
  /** Stores the new session pair and updates `user`. Used by sign-in/register/refresh outcomes. */
  setSession: (next: { user: AuthUser; accessToken: string; refreshToken: string }) => Promise<void>;
  /** Clears local state and SecureStore. Server-side revocation lives in a separate task (T101). */
  clearSession: () => Promise<void>;
  getRefreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingApplication, setPendingApplication] = useState<{ applicationId: string } | null>(null);
  const accessRef = useRef<string | null>(null);

  useEffect(() => {
    _setAccessTokenGetter(() => accessRef.current);
  }, []);

  const setSession = useCallback(
    async (next: { user: AuthUser; accessToken: string; refreshToken: string; pendingApplication?: { applicationId: string } | null }) => {
      accessRef.current = next.accessToken;
      await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken);
      setUser(next.user);
      setPendingApplication(next.pendingApplication ?? null);
    },
    [],
  );

  const clearSession = useCallback(async () => {
    accessRef.current = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setUser(null);
    setPendingApplication(null);
  }, []);

  const getRefreshToken = useCallback(() => SecureStore.getItemAsync(REFRESH_KEY), []);

  useEffect(() => {
    _setRefreshHook(
      async () => {
        const stored = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!stored) throw new Error('NO_REFRESH_TOKEN');
        const next = await refresh(stored);
        accessRef.current = next.accessToken;
        await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken);
        // user remains the same; getMe will be re-fetched on next demand if needed
        return { accessToken: next.accessToken, refreshToken: next.refreshToken };
      },
      () => {
        accessRef.current = null;
        SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
        setUser(null);
      },
    );

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!stored) {
          setIsLoading(false);
          return;
        }
        // Use the refresh credential to mint a fresh access credential, then load the user.
        const session = await refresh(stored);
        accessRef.current = session.accessToken;
        await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
        const me = await getMe();
        setUser(me.user);
        setPendingApplication(me.pendingApplication ?? null);
      } catch {
        accessRef.current = null;
        await SecureStore.deleteItemAsync(REFRESH_KEY);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Register FCM push token when a user session is established (FR-014).
  // Tracks the last user id we registered for so we don't re-prompt on every
  // re-render, and never re-prompts after the OS reports `denied` — that
  // would mean asking again on every cold-start of the app on Android 13+.
  const fcmRegisteredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      fcmRegisteredForRef.current = null;
      return;
    }
    if (fcmRegisteredForRef.current === user.id) return;
    fcmRegisteredForRef.current = user.id;
    // Expo Go has no remote-push support — skip the whole path so the
    // `expo-notifications` module is never even loaded there.
    if (isExpoGo) return;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const perm = await Notifications.getPermissionsAsync();
        let status = perm.status;
        if (status === 'undetermined') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status === 'granted') {
          const token = await Notifications.getExpoPushTokenAsync();
          await registerFcmToken(token.data);
        }
      } catch {
        // ignore — registration is best-effort
      }
    })();
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user, isLoading, pendingApplication, role: user?.role ?? 'customer', setSession, clearSession, getRefreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}