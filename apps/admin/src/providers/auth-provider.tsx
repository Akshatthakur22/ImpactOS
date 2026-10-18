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

  const refreshSession = useCallback(async () => {
    const data = await refreshWebSession();
    if (!data) {
      setUser(null);
      setAccessToken(null);
      setExpiresAt(null);
      return null;
    }
    applyAuth(data, setUser, setAccessToken, setExpiresAt);
    return data.accessToken;
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
    const delay = Math.max(1_000, expiresAt - Date.now() - 60_000);
    const timer = window.setTimeout(() => {
      void refreshSession().catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [accessToken, expiresAt, refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginWithPassword(email, password);
    applyAuth(data, setUser, setAccessToken, setExpiresAt);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutWebSession();
    } finally {
      setUser(null);
      setAccessToken(null);
      setExpiresAt(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, accessToken, loading, refreshSession, login, logout }),
    [user, accessToken, loading, refreshSession, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
