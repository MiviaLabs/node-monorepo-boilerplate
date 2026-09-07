/**
 * Token Info Extractor
 *
 * Utility class for extracting information from JWT tokens.
 * Centralizes token parsing logic to avoid code duplication.
 *
 * @packageDocumentation
 */

import { jwtService } from '../services/jwt.service';

import type { JwtPayload } from '../types/jwt.types';

/**
 * Extracted token information
 */
export interface TokenInfo {
  /** Token ID (jti claim) */
  tokenId: string | undefined;
  /** User ID (sub claim) */
  userId: string | undefined;
  /** Tenant ID (tenant_id claim) */
  tenantId: string | undefined;
  /** Session ID (if present in token) */
  sessionId?: string;
  /** Token expiration date */
  expiration?: Date;
  /** Token payload */
  payload: JwtPayload;
  /** Whether token is expired */
  isExpired: boolean;
}

/**
 * Token info extraction options
 */
export interface TokenExtractionOptions {
  /** Throw error if token is invalid */
  throwOnError?: boolean;
  /** Throw error if token is expired */
  throwOnExpired?: boolean;
}

/**
 * Token Info Extractor
 *
 * Provides centralized methods for extracting information from JWT tokens.
 * This class consolidates token parsing logic that was previously duplicated
 * across AuthService and TokenService.
 */
export class TokenInfoExtractor {
  /**
   * Extract all available information from a token
   *
   * @param token - JWT token string
   * @param options - Extraction options
   * @returns Token information
   * @throws Error if token is invalid and throwOnError is true
   */
  static extract(token: string, options: TokenExtractionOptions = {}): TokenInfo {
    const { throwOnError = false, throwOnExpired = false } = options;

    // Decode the token
    const payload = jwtService.decode(token);
    if (!payload) {
      if (throwOnError) {
        throw new Error('Invalid token: unable to decode');
      }
      // Return minimal info for invalid tokens
      return {
        tokenId: undefined,
        userId: undefined,
        tenantId: undefined,
        payload: {} as JwtPayload,
        isExpired: true
      };
    }

    // Extract standard claims
    const tokenId = jwtService.getTokenId(token);
    const userId = jwtService.extractUserId(token);
    const tenantId = jwtService.extractTenantId(token);
    const expiration = jwtService.getExpiration(token);
    const isExpired = jwtService.isExpired(token);

    // Check if expired and throw if requested
    if (isExpired && throwOnExpired) {
      throw new Error('Token is expired');
    }

    // Extract session ID if present
    const sessionId = (payload as unknown as Record<string, unknown>)['session_id'] as
      | string
      | undefined;

    const result: TokenInfo = {
      payload,
      isExpired,
      tokenId: tokenId ?? '',
      userId: userId ?? '',
      tenantId: tenantId ?? ''
    };
    if (sessionId !== undefined) {
      result.sessionId = sessionId;
    }
    if (expiration !== undefined) {
      result.expiration = expiration;
    }
    return result;
  }

  /**
   * Extract token ID from a JWT token
   *
   * @param token - JWT token string
   * @returns Token ID or undefined
   */
  static getTokenId(token: string): string | undefined {
    return jwtService.getTokenId(token);
  }

  /**
   * Extract user ID from a JWT token
   *
   * @param token - JWT token string
   * @returns User ID or undefined
   */
  static getUserId(token: string): string | undefined {
    return jwtService.extractUserId(token);
  }

  /**
   * Extract tenant ID from a JWT token
   *
   * @param token - JWT token string
   * @returns Tenant ID or undefined
   */
  static getTenantId(token: string): string | undefined {
    return jwtService.extractTenantId(token);
  }

  /**
   * Get token expiration date
   *
   * @param token - JWT token string
   * @returns Expiration date or undefined
   */
  static getExpiration(token: string): Date | undefined {
    return jwtService.getExpiration(token);
  }

  /**
   * Check if token is expired
   *
   * @param token - JWT token string
   * @returns true if token is expired
   */
  static isExpired(token: string): boolean {
    return jwtService.isExpired(token);
  }

  /**
   * Get remaining time to live (TTL) in seconds
   *
   * @param token - JWT token string
   * @returns TTL in seconds, or 0 if expired/invalid
   */
  static getTTL(token: string): number {
    const exp = jwtService.getExpiration(token);
    if (!exp) return 0;
    return Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
  }

  /**
   * Extract token info with tenant default
   *
   * Convenience method that returns a default tenant ID if not present in token.
   *
   * @param token - JWT token string
   * @param defaultTenantId - Default tenant ID to use
   * @returns Token information with tenant ID defaulted
   */
  static extractWithTenantDefault(
    token: string,
    defaultTenantId: string = 'default'
  ): Omit<TokenInfo, 'payload'> {
    const info = this.extract(token);
    return {
      ...info,
      tenantId: info.tenantId ?? defaultTenantId
    };
  }

  /**
   * Validate token and extract info
   *
   * Combines basic validation with info extraction.
   *
   * @param token - JWT token string
   * @returns Token info if valid, undefined if invalid
   */
  static validateAndExtract(token: string): TokenInfo | undefined {
    const validation = jwtService.validate(token);
    if (!validation.valid) {
      return undefined;
    }
    return this.extract(token);
  }
}
