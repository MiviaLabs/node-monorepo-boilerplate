/**
 * Mock Token Service for testing
 *
 * This mock prevents Redis connections during testing by providing
 * in-memory implementations of TokenService methods.
 */

import type { RefreshTokenInfo, SessionInfo } from '../../types/auth.types';

// In-memory storage for mock tokens
const mockRefreshTokens = new Map<string, RefreshTokenInfo>();
const mockSessions = new Map<string, SessionInfo>();
const mockBlacklist = new Map<string, boolean>();

/**
 * Mock TokenService class
 */
export class MockTokenService {
  /**
   * Store refresh token (no-op in mock)
   */
  async storeRefreshToken(
    _tokenId: string,
    _userId: string,
    _tenantId: string,
    _sessionId: string,
    _expiresIn: number = 604800
  ): Promise<void> {
    // No-op in mock
  }

  /**
   * Get refresh token (returns undefined in mock)
   */
  async getRefreshToken(
    _tokenId: string,
    _tenantId?: string
  ): Promise<RefreshTokenInfo | undefined> {
    return undefined;
  }

  /**
   * Revoke refresh token (no-op in mock)
   */
  async revokeRefreshToken(_tokenId: string, _tenantId: string): Promise<void> {
    // No-op in mock
  }

  /**
   * Delete refresh token (no-op in mock)
   */
  async deleteRefreshToken(_tokenId: string, _tenantId: string): Promise<void> {
    // No-op in mock
  }

  /**
   * Store session (no-op in mock)
   */
  async storeSession(
    _sessionId: string,
    _userId: string,
    _tenantId: string,
    _tokenId: string,
    _expiresIn: number = 604800
  ): Promise<void> {
    // No-op in mock
  }

  /**
   * Get session (throws error in mock)
   */
  async getSession(_sessionId: string, _tenantId: string): Promise<SessionInfo> {
    throw new Error(`Session not found: ${_sessionId}`);
  }

  /**
   * Update session activity (no-op in mock)
   */
  async updateSessionActivity(_sessionId: string, _tenantId: string): Promise<void> {
    // No-op in mock
  }

  /**
   * Invalidate session (no-op in mock)
   */
  async invalidateSession(_sessionId: string, _tenantId: string): Promise<void> {
    // No-op in mock
  }

  /**
   * Delete session (no-op in mock)
   */
  async deleteSession(_sessionId: string, _tenantId: string): Promise<void> {
    // No-op in mock
  }

  /**
   * Blacklist access token (stores in memory)
   */
  async blacklistAccessToken(tokenId: string, tenantId: string, expiresIn: number): Promise<void> {
    const key = `${tenantId}:${tokenId}`;
    mockBlacklist.set(key, true);

    // Auto-remove after TTL
    setTimeout(() => {
      mockBlacklist.delete(key);
    }, expiresIn * 1000);
  }

  /**
   * Check if access token is blacklisted
   */
  async isAccessTokenBlacklisted(tokenId: string, tenantId: string): Promise<boolean> {
    const key = `${tenantId}:${tokenId}`;
    return mockBlacklist.get(key) ?? false;
  }

  /**
   * Clear all mock data (useful for test cleanup)
   */
  clear(): void {
    mockRefreshTokens.clear();
    mockSessions.clear();
    mockBlacklist.clear();
  }
}

/**
 * Export a singleton instance
 */
export const tokenService = new MockTokenService();
