/**
 * Auth Storage
 *
 * Client-side session storage using localStorage and memory
 *
 * IMPORTANT: This is a CLIENT-ONLY implementation.
 * Server-side session storage with Redis should be handled by the API backend.
 */

import { type SessionData, type AuthTokens, type User, normalizeUser } from '~/types/auth.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const SESSION_COOKIE_NAME = 'sessionId';
const TENANT_COOKIE_NAME = 'tenantId';
const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
const SESSION_STORAGE_KEY = `auth_${SESSION_COOKIE_NAME}`;
const MIRROR_SESSION_ID_PREFIX = 'client-mirror';

/** Session ID expected length (64 hex characters = 256 bits) */
const SESSION_ID_HEX_LENGTH = 64;

/** Regex pattern for valid session ID (64 lowercase hex chars) */
const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate session expiration
 */
function calculateExpiration(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

function getCookieSecuritySuffix(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.protocol === 'https:' ? '; Secure' : '';
}

function clearLegacyCookies(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const secure = getCookieSecuritySuffix();
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `${TENANT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

/**
 * Validate session ID format
 *
 * @param sessionId - Session ID to validate
 * @returns True if valid 64-character hex string
 */
function isValidSessionIdFormat(sessionId: string): boolean {
  return (
    typeof sessionId === 'string' &&
    sessionId.length === SESSION_ID_HEX_LENGTH &&
    SESSION_ID_PATTERN.test(sessionId)
  );
}

/**
 * Generate a cryptographically secure session ID
 * Uses Web Crypto API for browser environments
 *
 * @throws Error if Web Crypto API is not available
 */
async function generateSessionId(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('generateSessionId must be called in browser environment');
  }

  if (!window.crypto?.getRandomValues) {
    throw new Error(
      'Web Crypto API not available. ' +
        'Session generation requires a secure browser environment with crypto.getRandomValues support.'
    );
  }

  // Browser environment: use Web Crypto API
  const array = new Uint8Array(32); // 256 bits
  window.crypto.getRandomValues(array);

  // Convert to hex string
  const sessionId = Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Validate generated session ID format
  if (!isValidSessionIdFormat(sessionId)) {
    throw new Error('Generated session ID failed format validation');
  }

  return sessionId;
}

// ============================================================================
// AUTH STORAGE CLASS
// ============================================================================

/**
 * Client-side auth storage using memory and localStorage
 *
 * This is a CLIENT-ONLY implementation.
 * Session data is stored in localStorage with fallback to memory.
 * The actual session validation and server-side storage happens on the API.
 */
export class AuthStorage {
  private static instance: AuthStorage | null = null;
  private sessionData: SessionData | null = null;
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // Load from localStorage on mount (if in browser)
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
    }
  }

  static getInstance(): AuthStorage {
    AuthStorage.instance ??= new AuthStorage();
    return AuthStorage.instance;
  }

  private buildMirrorSessionId(): string | null {
    if (!this.sessionData?.user.userId) {
      return null;
    }

    return `${MIRROR_SESSION_ID_PREFIX}:${this.sessionData.user.userId}`;
  }

  private clearLocalMirror(): void {
    this.sessionData = null;
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as SessionData;
        // Check expiration
        if (new Date() < new Date(data.expiresAt)) {
          this.sessionData = data;
        } else {
          this.clearLocalMirror();
        }
      }
    } catch (error) {
      console.error('Failed to load session from storage:', error);
      this.clearLocalMirror();
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      if (this.sessionData) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.sessionData));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to save session to storage:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Store session data (client-side only)
   *
   * CRITICAL: This only stores in browser memory/localStorage.
   * Server-side Redis storage is handled by the API backend.
   *
   * The browser copy is a convenience mirror only.
   */
  async setSession(tokens: AuthTokens, user: User | Record<string, unknown>): Promise<string> {
    // Normalize user data to ensure it's always a User type
    const normalizedUser = (user as User).userId
      ? (user as User)
      : normalizeUser(user as Record<string, unknown>);
    const sessionData: SessionData = {
      user: normalizedUser,
      tokens,
      createdAt: new Date(),
      expiresAt: calculateExpiration(tokens.expiresIn)
    };

    this.sessionData = sessionData;
    this.saveToStorage();

    this.notifyListeners();

    return this.buildMirrorSessionId() ?? (await generateSessionId());
  }

  /**
   * Get session data (client-side only)
   */
  async getSession(_sessionId: string): Promise<SessionData | null> {
    // Check if session is expired
    if (this.sessionData) {
      if (new Date() < new Date(this.sessionData.expiresAt)) {
        return this.sessionData;
      }
      // Session expired
      await this.clearSession();
    }

    return null;
  }

  /**
   * Refresh session tokens
   */
  async refreshSession(newTokens: AuthTokens, sessionId: string): Promise<void> {
    if (!this.sessionData) {
      throw new Error('Session not found');
    }

    if (sessionId !== this.buildMirrorSessionId()) {
      throw new Error('Session not found');
    }

    this.sessionData = {
      ...this.sessionData,
      tokens: newTokens,
      expiresAt: calculateExpiration(newTokens.expiresIn)
    };

    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Update current session user payload without changing token cookies.
   */
  async updateSessionUser(user: User): Promise<void> {
    if (!this.sessionData) {
      return;
    }

    this.sessionData = {
      ...this.sessionData,
      user
    };
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Clear session
   *
   * Clears all auth cookies.
   */
  async clearSession(_sessionId?: string): Promise<void> {
    this.clearLocalMirror();

    // Cleanup legacy browser-writable cookies from the pre-server-session model.
    clearLegacyCookies();

    this.notifyListeners();
  }

  /**
   * Check if session is valid
   */
  async isValidSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session !== null;
  }

  /**
   * Get current mirror session ID.
   */
  async getSessionId(): Promise<string | null> {
    return this.buildMirrorSessionId();
  }

  /**
   * Subscribe to session changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current session (synchronous for React components)
   */
  getCurrentSession(): SessionData | null {
    return this.sessionData;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let authStorageInstance: AuthStorage | null = null;

/**
 * Get auth storage instance (client-side only)
 *
 * @returns Singleton AuthStorage instance
 */
export function getAuthStorage(): AuthStorage {
  authStorageInstance ??= AuthStorage.getInstance();
  return authStorageInstance;
}

// ============================================================================
// EXPORTS (for unit testing)
// ============================================================================

export { SESSION_ID_HEX_LENGTH, SESSION_ID_PATTERN, isValidSessionIdFormat };
