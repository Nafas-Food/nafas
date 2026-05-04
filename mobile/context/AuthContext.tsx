import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, _setAccessTokenGetter } from '../services/api';

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
    // T072 will replace this stub with a silent-restore call to /auth/me.
    setIsLoading(false);
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