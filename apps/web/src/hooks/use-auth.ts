/**
 * useAuth Hook
 *
 * Convenience hook for using auth context
 */

import { useAuth as useAuthContext } from '~/contexts/auth-context';

/**
 * Hook to access auth context
 *
 * @returns Auth context with user, login, logout, and authentication state
 * @throws Error if used outside of AuthProvider
 *
 * @example
 * ```tsx
 * const { user, login, logout, isAuthenticated } = useAuth();
 *
 * if (!isAuthenticated) {
 *   return <LoginForm />;
 * }
 *
 * return <div>Welcome, {user?.email}</div>;
 * ```
 */
export function useAuth() {
  const context = useAuthContext();

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
