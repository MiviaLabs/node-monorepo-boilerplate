'use client';

/**
 * Auth Context
 *
 * React context for authentication state and operations
 */

import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo
} from 'react';
import { toast } from 'sonner';

import type { IUserProfileResponse, SessionData, User } from '~/types/auth.types';

import { authApi } from '~/lib/api/auth-api';
import { runSingleFlight } from '~/lib/auth/async-lock';
import { getAuthStorage } from '~/lib/auth/auth-storage';
import { hydrateSessionUser } from '~/lib/auth/hydrate-session-user';
import { mergeUserProfile } from '~/lib/auth/user-profile-merge';
import { normalizeUser } from '~/types/auth.types';

interface AuthContextType {
  user: User | null;
  session: SessionData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (
    email: string,
    password: string,
    options?: {
      redirectTo?: string | null;
    }
  ) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName?: string,
    organizationName?: string,
    organizationSlug?: string,
    options?: {
      tenantId?: string;
      invitationToken?: string;
    }
  ) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  applyUserProfile: (profile: IUserProfileResponse) => Promise<void>;
  clearError: () => void;
  deleteAccount: (reason?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const LOGOUT_SYNC_COOKIE_NAME = 'authLogoutSync';
const REFRESH_LEAD_TIME_MS = 5 * 60 * 1000;
const MAX_REFRESH_ATTEMPTS = 2;

/**
 * Auth Provider Props
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

const enum RefreshAttemptResult {
  Success = 'success',
  AuthInvalid = 'auth_invalid',
  TransientFailure = 'transient_failure',
  MissingSession = 'missing_session'
}

/**
 * Safe error logger that filters sensitive data in production
 *
 * Redacts Bearer tokens and refresh tokens to prevent Class-C data leakage in logs.
 */
function safeErrorLog(message: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') {
    // In production, log only safe info
    const errorMessage =
      typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unknown error';
    // Redact tokens to prevent Class-C data in logs
    const sanitizedMessage = errorMessage
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/"refreshToken":"[^"]+"/g, '"refreshToken":"[REDACTED]"')
      .replace(/refreshToken=[^&\s]+/g, 'refreshToken=[REDACTED]');
    console.error(`${message}: ${sanitizedMessage}`);
    return;
  }

  // In development, log full error for debugging
  console.error(message, error);
}

/**
 * Invalidate server-side session cache
 *
 * Calls the cache invalidation API to clear server-side cached session.
 * Errors are logged but do not block the operation.
 */
async function invalidateServerCache(): Promise<void> {
  try {
    await fetch('/api/auth/invalidate-cache', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (err) {
    // Log but don't fail - cache invalidation is best-effort
    safeErrorLog('Failed to invalidate server cache', err);
  }
}

function isAuthInvalidRefreshError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('invalid or expired refresh token') ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token invalid') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  );
}

function isTransientRefreshError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('unavailable') ||
    message.includes('connection') ||
    message.includes('fetch')
  );
}

function buildSessionFromAuthResponse(
  currentSession: SessionData,
  response: Awaited<ReturnType<typeof authApi.refreshToken>>
): SessionData {
  return {
    ...currentSession,
    tokens: {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      idToken: response.idToken,
      expiresIn: response.expiresIn,
      refreshExpiresIn: response.refreshExpiresIn
    },
    expiresAt: new Date(Date.now() + response.expiresIn * 1000)
  };
}

function buildSessionFromFreshAuthResponse(
  response: Awaited<ReturnType<typeof authApi.refreshToken>>,
  user: User
): SessionData {
  const now = new Date();

  return {
    user,
    tokens: {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      idToken: response.idToken,
      expiresIn: response.expiresIn,
      refreshExpiresIn: response.refreshExpiresIn
    },
    createdAt: now,
    expiresAt: new Date(now.getTime() + response.expiresIn * 1000)
  };
}

/**
 * Auth Provider Component
 */
// eslint-disable-next-line max-lines-per-function
export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PERF-008: Track initialization to prevent multiple simultaneous inits
  // Lock pattern ensures only one session initialization runs at a time
  // The promise is stored in ref and awaited by subsequent calls
  // Lock is cleared in finally block to prevent memory leaks
  const initRef = useRef<Promise<void> | null>(null);
  // PERF-008: Add refresh lock to prevent concurrent refreshes
  // Same lock pattern as initRef - prevents race conditions during token refresh
  const refreshLockRef = useRef<Promise<RefreshAttemptResult> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearLocalSession = useCallback(async () => {
    const storage = getAuthStorage();
    const sessionId = await storage.getSessionId();
    await storage.clearSession(sessionId ?? undefined);
    setSession(null);
    setUser(null);
  }, []);

  const refreshSessionInternal = useCallback(
    async (
      currentSession: SessionData,
      options?: {
        silent?: boolean;
        allowRetry?: boolean;
      }
    ): Promise<RefreshAttemptResult> => {
      const storage = getAuthStorage();
      const sessionId = await storage.getSessionId();

      if (!sessionId) {
        return RefreshAttemptResult.MissingSession;
      }

      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        let lastError: unknown;

        for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
          try {
            const response = await authApi.refreshToken(
              currentSession.tokens.refreshToken,
              currentSession.user.tenantId
            );
            const newSessionData = buildSessionFromAuthResponse(currentSession, response);

            await storage.refreshSession(newSessionData.tokens, sessionId);

            const hydratedUser = await hydrateSessionUser(undefined, currentSession.user);

            newSessionData.user = hydratedUser;
            await storage.updateSessionUser(hydratedUser);
            setSession(newSessionData);
            setUser(hydratedUser);
            setError(null);
            return RefreshAttemptResult.Success;
          } catch (error) {
            lastError = error;

            if (isAuthInvalidRefreshError(error)) {
              await clearLocalSession();
              setError(error instanceof Error ? error.message : 'Session refresh failed');
              return RefreshAttemptResult.AuthInvalid;
            }

            if (
              !options?.allowRetry ||
              !isTransientRefreshError(error) ||
              attempt === MAX_REFRESH_ATTEMPTS - 1
            ) {
              break;
            }
          }
        }

        setError(lastError instanceof Error ? lastError.message : 'Session refresh failed');
        return RefreshAttemptResult.TransientFailure;
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [clearLocalSession]
  );

  const refreshIfDue = useCallback(
    async (candidateSession: SessionData | null, options?: { silent?: boolean }) => {
      if (!candidateSession) {
        return RefreshAttemptResult.MissingSession;
      }

      const expiresAt = new Date(candidateSession.expiresAt).getTime();
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;

      if (timeUntilExpiry > REFRESH_LEAD_TIME_MS) {
        return RefreshAttemptResult.Success;
      }

      return runSingleFlight(refreshLockRef, () =>
        refreshSessionInternal(candidateSession, {
          silent: options?.silent ?? false,
          allowRetry: true
        })
      );
    },
    [refreshSessionInternal]
  );

  /**
   * Initialize session on mount
   */
  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      await runSingleFlight(initRef, async () => {
        try {
          const storage = getAuthStorage();
          const logoutSyncCookiePresent =
            typeof document !== 'undefined' &&
            document.cookie
              .split(';')
              .some((cookie) => cookie.trim().startsWith(`${LOGOUT_SYNC_COOKIE_NAME}=`));

          if (logoutSyncCookiePresent) {
            await storage.clearSession();
            document.cookie = `${LOGOUT_SYNC_COOKIE_NAME}=; path=/; max-age=0`;
          }

          const mirroredSession = storage.getCurrentSession();

          if (cancelled) {
            return;
          }

          if (mirroredSession) {
            const refreshResult = await refreshIfDue(mirroredSession, { silent: true });

            if (cancelled) {
              return;
            }

            if (
              refreshResult === RefreshAttemptResult.AuthInvalid ||
              refreshResult === RefreshAttemptResult.MissingSession
            ) {
              return;
            }

            const nextMirroredSession = storage.getCurrentSession() ?? mirroredSession;

            try {
              const hydratedUser = await hydrateSessionUser(undefined, nextMirroredSession.user);
              nextMirroredSession.user = hydratedUser;
              await storage.updateSessionUser(hydratedUser);
              setSession(nextMirroredSession);
              setUser(hydratedUser);
              setError(null);
              return;
            } catch (err) {
              safeErrorLog('Failed to hydrate mirrored session user', err);
              setSession(nextMirroredSession);
              setUser(nextMirroredSession.user);
              setError(null);
              return;
            }
          }

          try {
            const response = await authApi.refreshToken(undefined);
            const normalizedUser = normalizeUser(response.user as Record<string, unknown>);
            const recoveredSession = buildSessionFromFreshAuthResponse(response, normalizedUser);

            await storage.setSession(recoveredSession.tokens, normalizedUser);

            try {
              const hydratedUser = await hydrateSessionUser(undefined, normalizedUser);
              recoveredSession.user = hydratedUser;
              await storage.updateSessionUser(hydratedUser);
              setSession(recoveredSession);
              setUser(hydratedUser);
            } catch (err) {
              safeErrorLog('Failed to hydrate recovered session user', err);
              setSession(recoveredSession);
              setUser(normalizedUser);
            }

            setError(null);
          } catch (err) {
            if (isAuthInvalidRefreshError(err)) {
              await clearLocalSession();
              return;
            }

            throw err;
          }
        } catch (err) {
          if (cancelled) {
            return;
          }
          safeErrorLog('Failed to initialize session', err);
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      });
    };

    initSession();

    // Cleanup function
    return () => {
      cancelled = true;
    };
  }, [refreshIfDue]);

  useEffect(() => {
    clearRefreshTimer();

    if (!session) {
      return;
    }

    const expiresAtMs = new Date(session.expiresAt).getTime();
    const delayMs = Math.max(expiresAtMs - Date.now() - REFRESH_LEAD_TIME_MS, 0);

    refreshTimerRef.current = setTimeout(() => {
      void refreshIfDue(session, { silent: true });
    }, delayMs);

    return () => {
      clearRefreshTimer();
    };
  }, [session, refreshIfDue, clearRefreshTimer]);

  useEffect(() => {
    const handleResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void refreshIfDue(getAuthStorage().getCurrentSession(), { silent: true });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleResume);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleResume);
      }

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume);
      }
    };
  }, [refreshIfDue]);

  /**
   * Login user
   *
   * NOTE: No artificial delay needed for cookie setting.
   * Cookies are sent synchronously with the HTTP response and are available
   * immediately for subsequent requests. The document.cookie API sets cookies
   * synchronously, making them available for the next navigation.
   */
  const login = useCallback(
    async (
      email: string,
      password: string,
      options?: {
        redirectTo?: string | null;
      }
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await authApi.login({ email, password });

        // Normalize user data from API response
        const normalizedUser = normalizeUser(response.user as Record<string, unknown>);

        const storage = getAuthStorage();
        await storage.setSession(response, normalizedUser);

        const sessionData: SessionData = {
          user: normalizedUser,
          tokens: {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            idToken: response.idToken,
            expiresIn: response.expiresIn,
            refreshExpiresIn: response.refreshExpiresIn
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + response.expiresIn * 1000)
        };

        setSession(sessionData);
        setUser(normalizedUser);

        toast.success('Login successful!', {
          description: 'Welcome back! You have been logged in.'
        });

        if (options?.redirectTo !== null) {
          router.push(options?.redirectTo ?? '/dashboard');
        }
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : 'Login failed';
        const isServiceError = /timeout|unavailable|network|failed to fetch|service/i.test(
          rawMessage
        );
        const message = isServiceError ? rawMessage : 'Invalid email or password';
        setError(message);
        toast.error('Login failed', {
          description: message
        });
        throw new Error(message, { cause: err });
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  /**
   * Register new user
   *
   * NOTE: No artificial delay needed for cookie setting.
   * Cookies are sent synchronously with the HTTP response and are available
   * immediately for subsequent requests.
   */
  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string,
      organizationName?: string,
      organizationSlug?: string,
      options?: {
        tenantId?: string;
        invitationToken?: string;
      }
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await authApi.register({
          email,
          password,
          displayName,
          organizationName,
          organizationSlug,
          ...(options?.tenantId !== undefined && { tenantId: options.tenantId }),
          ...(options?.invitationToken !== undefined && {
            invitationToken: options.invitationToken
          })
        });

        // Normalize user data from API response
        const normalizedUser = normalizeUser(response.user as Record<string, unknown>);

        const storage = getAuthStorage();
        await storage.setSession(response, normalizedUser);

        const sessionData: SessionData = {
          user: normalizedUser,
          tokens: {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            idToken: response.idToken,
            expiresIn: response.expiresIn,
            refreshExpiresIn: response.refreshExpiresIn
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + response.expiresIn * 1000)
        };

        setSession(sessionData);
        setUser(normalizedUser);

        toast.success('Account created successfully!', {
          description: 'Welcome aboard! Your account has been created.'
        });

        // Navigate to dashboard - cookies are already set synchronously
        router.push('/dashboard');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        toast.error('Registration failed', {
          description: message
        });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  /**
   * Logout user
   *
   * Clears both client-side session and server-side cache.
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Invalidate server-side cache first (best-effort, don't block on failure)
      await invalidateServerCache();

      const storage = getAuthStorage();
      const sessionId = await storage.getSessionId();

      try {
        await authApi.logout();
      } catch (err) {
        safeErrorLog('Logout API call failed', err);
      }

      // Always clear local session/cookies even when auth state has drifted from cookies.
      await storage.clearSession(sessionId ?? undefined);
      document.cookie = `${LOGOUT_SYNC_COOKIE_NAME}=1; path=/; max-age=10; SameSite=Lax`;

      setSession(null);
      setUser(null);

      toast.success('Logged out successfully', {
        description: 'You have been logged out.'
      });

      router.replace('/logout');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      setError(message);
      toast.error('Logout failed', {
        description: message
      });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  /**
   * Switch active tenant/workspace.
   */
  const switchTenant = useCallback(
    async (tenantId: string) => {
      const normalizedTenantId = tenantId.trim();
      if (!normalizedTenantId) {
        throw new Error('Tenant ID is required');
      }

      if (!user) {
        throw new Error('No active session');
      }

      if (user.tenantId === normalizedTenantId) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await authApi.refreshToken(
          session?.tokens.refreshToken,
          normalizedTenantId
        );
        const refreshedUser = normalizeUser(response.user as Record<string, unknown>);
        const tenantScopedUser: User = {
          ...refreshedUser,
          tenantId: normalizedTenantId
        };

        const storage = getAuthStorage();
        await storage.setSession(response, tenantScopedUser);

        const currentUserData = await authApi
          .getCurrentUser(undefined, normalizedTenantId)
          .catch(() => null);
        const mergedUser = currentUserData
          ? mergeUserProfile(tenantScopedUser, currentUserData)
          : tenantScopedUser;
        await storage.updateSessionUser(mergedUser);

        const nextSession: SessionData = {
          user: mergedUser,
          tokens: {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            idToken: response.idToken,
            expiresIn: response.expiresIn,
            refreshExpiresIn: response.refreshExpiresIn
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + response.expiresIn * 1000)
        };

        setSession(nextSession);
        setUser(mergedUser);
        await invalidateServerCache();
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to switch workspace';
        setError(message);
        toast.error('Workspace switch failed', {
          description: message
        });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router, session, user]
  );

  /**
   * Refresh session
   */
  const refreshSession = useCallback(async () => {
    if (!session) return;

    await runSingleFlight(refreshLockRef, async () => {
      setError(null);

      return refreshSessionInternal(session, {
        silent: false,
        allowRetry: true
      });
    });
  }, [session, refreshSessionInternal]);

  const applyUserProfile = useCallback(
    async (profile: IUserProfileResponse) => {
      if (!session || !user) {
        return;
      }

      const mergedUser = mergeUserProfile(user, profile);
      const storage = getAuthStorage();
      await storage.updateSessionUser(mergedUser);

      const nextSession: SessionData = {
        ...session,
        user: mergedUser
      };

      setSession(nextSession);
      setUser(mergedUser);
      await invalidateServerCache();
    },
    [session, user]
  );

  /**
   * Delete account with improved error handling and race condition fix
   */
  const deleteAccount = useCallback(
    // eslint-disable-next-line complexity
    async (reason?: string) => {
      if (!user) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);

      try {
        await authApi.deleteAccount(user.userId.toString(), undefined, user.tenantId, reason);

        // Success - navigate first, then clear session
        // This prevents UI flashing "logged in" state before navigation
        toast.success('Account deleted successfully', {
          description: 'Your account has been permanently deleted.'
        });

        // Navigate immediately after success
        router.push('/');

        // Small delay to allow navigation to start
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Clear session after navigation (don't fail if this errors)
        try {
          // Invalidate server cache
          await invalidateServerCache();

          const storage = getAuthStorage();
          const sessionId = await storage.getSessionId();

          if (sessionId) {
            await storage.clearSession(sessionId);
          }

          setSession(null);
          setUser(null);
        } catch (clearErr) {
          // Log but don't fail - account already deleted successfully
          safeErrorLog('Session cleanup after deletion failed (account still deleted)', clearErr);
        }
      } catch (err) {
        // Log error details for debugging
        console.error('[deleteAccount] API call failed:', {
          error: err,
          errorType: err instanceof Error ? err.constructor.name : typeof err,
          errorMessage: err instanceof Error ? err.message : String(err),
          userId: user.userId,
          tenantId: user.tenantId
        });

        // Parse error response for specific status codes
        let errorMessage = 'Account deletion failed';

        if (err instanceof Error) {
          const message = err.message.toLowerCase();

          // Check for specific HTTP status codes in error message
          if (message.includes('403') || message.includes('forbidden')) {
            errorMessage = "Permission denied - You don't have permission to delete this account";
          } else if (message.includes('404') || message.includes('not found')) {
            errorMessage = 'Account not found - It may have already been deleted';
          } else if (
            message.includes('network') ||
            message.includes('fetch') ||
            message.includes('connection')
          ) {
            errorMessage = 'Network error - Please check your internet connection and try again';
          } else {
            // Use the actual error message if it's informative
            errorMessage = err.message || errorMessage;
          }
        }

        setError(errorMessage);
        toast.error('Account deletion failed', {
          description: errorMessage
        });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user, router]
  );

  // Memoize context value to prevent unnecessary re-renders
  const value: AuthContextType = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: !!user,
      error,
      login,
      register,
      logout,
      switchTenant,
      refreshSession,
      applyUserProfile,
      clearError,
      deleteAccount
    }),
    [
      user,
      session,
      isLoading,
      error,
      login,
      register,
      logout,
      switchTenant,
      refreshSession,
      applyUserProfile,
      clearError,
      deleteAccount
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth Hook
 *
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
