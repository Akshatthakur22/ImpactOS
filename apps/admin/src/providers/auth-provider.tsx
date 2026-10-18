"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthData, PublicUser } from "@sportdesk/contracts";
import { loginWithPassword, logoutWebSession, refreshWebSession } from "@/lib/auth-api";

type AuthContextValue = {
  user: PublicUser | null;
  accessToken: string | null;
  loading: boolean;
  sessionRestoreError: string | null;
  refreshSession: () => Promise<string | null>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applyAuth(
  data: AuthData,
  setUser: (user: PublicUser | null) => void,
  setToken: (token: string | null) => void,
  setExpiry: (expiry: number | null) => void,
) {
  setUser(data.user);
  setToken(data.accessToken);
  setExpiry(Date.parse(data.expiresAt));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [sessionRestoreError, setSessionRestoreError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const data = await refreshWebSession();
      if (!data) {
        setUser(null);
        setAccessToken(null);
        setExpiresAt(null);
        setSessionRestoreError(null);
        return null;
      }
      applyAuth(data, setUser, setAccessToken, setExpiresAt);
      setSessionRestoreError(null);
      return data.accessToken;
    } catch (error) {
      setSessionRestoreError(
        error instanceof Error ? error.message : "Could not restore your session. Try again.",
      );
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession()
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshSession]);

  useEffect(() => {
    if (!accessToken || !expiresAt) return;
    let active = true;
    let timer: number | undefined;

    const attemptRefresh = () => {
      void refreshSession().catch(() => {
        if (active) timer = window.setTimeout(attemptRefresh, 15_000);
      });
    };

    timer = window.setTimeout(attemptRefresh, Math.max(1_000, expiresAt - Date.now() - 60_000));
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accessToken, expiresAt, refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginWithPassword(email, password);
    applyAuth(data, setUser, setAccessToken, setExpiresAt);
    setSessionRestoreError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutWebSession();
    } finally {
      setUser(null);
      setAccessToken(null);
      setExpiresAt(null);
      setSessionRestoreError(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      loading,
      sessionRestoreError,
      refreshSession,
      login,
      logout,
    }),
    [user, accessToken, loading, sessionRestoreError, refreshSession, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
