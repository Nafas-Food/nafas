import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, _setAccessTokenGetter, _setRefreshHook } from '../services/api';
import { refresh, getMe } from '../services/auth';

const REFRESH_KEY = 'nafas.refreshToken';

export type Role = 'CUSTOMER' | 'CHEF' | 'ADMIN' | 'DRIVER';

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
  const accessRef = useRef<string | null>(null);

  useEffect(() => {
    _setAccessTokenGetter(() => accessRef.current);
  }, []);

  const setSession = useCallback(
    async (next: { user: AuthUser; accessToken: string; refreshToken: string }) => {
      accessRef.current = next.accessToken;
      await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken);
      setUser(next.user);
    },
    [],
  );

  const clearSession = useCallback(async () => {
    accessRef.current = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setUser(null);
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
      } catch {
        accessRef.current = null;
        await SecureStore.deleteItemAsync(REFRESH_KEY);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, setSession, clearSession, getRefreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}