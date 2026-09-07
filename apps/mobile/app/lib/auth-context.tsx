import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { asyncStorageDriver } from './storage-driver';
import { createAuth, type Session } from './auth';

const auth = createAuth(asyncStorageDriver);

interface AuthContextValue {
  session: Session | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void auth.getSession().then((restored) => {
      setSession(restored);
      setReady(true);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      login: async (email, password) => {
        const next = await auth.login(email, password);
        setSession(next);
        return next;
      },
      logout: async () => {
        await auth.logout();
        setSession(null);
      }
    }),
    [session, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
