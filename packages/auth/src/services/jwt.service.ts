/**
 * JWT Service
 *
 * Handles JWT token validation, verification, and decoding
 */

import { Injectable, Scope } from '@nestjs/common';

import { InvalidTokenError, TokenValidationError } from '../errors';
import { AuthOperation, withAuthTracingSync } from '../telemetry';

import type { TokenValidationResult } from '../types/auth.types';
import type { JwtPayload, JwtValidateOptions } from '../types/jwt.types';

/**
 * JWT Service for token validation and decoding
 *
 * Injectable service for NestJS DI. Provides methods to decode, validate,
 * and extract claims from JWT tokens without cryptographic verification.
 *
 * @example Injecting JwtService in a NestJS service
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { JwtService } from '@package/auth';
 *
 * @Injectable()
 * export class AuthService {
 *   constructor(private readonly jwtService: JwtService) {}
 *
 *   validateToken(token: string) {
 *     const result = this.jwtService.validate(token);
 *     if (!result.valid) {
 *       throw new UnauthorizedException(result.error);
 *     }
 *     return { userId: result.userId, tenantId: result.tenantId };
 *   }
 * }
 * ```
 *
 * @example Extracting claims from a token
 * ```typescript
 * const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
 * const jwtService = new JwtService();
 *
 * const userId = jwtService.extractUserId(token);
 * const tenantId = jwtService.extractTenantId(token);
 * const roles = jwtService.extractRoles(token);
 * const isExpired = jwtService.isExpired(token);
 * ```
 */
@Injectable({ scope: Scope.DEFAULT })
export class JwtService {
  /**
   * Decode JWT token without verification
   *
   * Note: For verification, use the auth provider's validateToken.
   *
   * @param token - JWT token string
   * @returns Decoded JWT payload
   * @throws {InvalidTokenError} When token format is invalid or cannot be decoded
   *
   * @example Decoding a JWT token
   * ```typescript
   * const jwtService = new JwtService();
   * const payload = jwtService.decode(token);
   * console.log(payload.sub);      // User ID
   * console.log(payload.tenant_id); // Tenant ID
   * console.log(payload.exp);      // Expiration timestamp
   * ```
   */
  decode(token: string): JwtPayload {
    return withAuthTracingSync(AuthOperation.JWT_DECODE, () => {
      return this.decodeInternal(token);
    });
  }

  /**
   * Internal decode implementation
   */
  private decodeInternal(token: string): JwtPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new InvalidTokenError('Invalid token format: JWT must have 3 parts');
      }

      const payload = parts[1];
      if (!payload) {
        throw new InvalidTokenError('Invalid token format: missing payload');
      }
      // Convert base64url to base64 by replacing characters and adding padding
      const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = base64Payload.padEnd(
        base64Payload.length + ((4 - (base64Payload.length % 4)) % 4),
        '='
      );
      const decoded = Buffer.from(paddedPayload, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (!parsed) {
        throw new InvalidTokenError('Failed to decode JWT token: empty payload');
      }
      return parsed as JwtPayload;
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }
      throw new InvalidTokenError('Failed to decode JWT token');
    }
  }

  /**
   * Validate JWT token (basic validation)
   *
   * Note: For cryptographic validation, use the auth provider's validateToken.
   *
   * @param token - JWT token string
   * @param options - Validation options
   * @returns Token validation result
   *
   * @example Basic token validation
   * ```typescript
   * const jwtService = new JwtService();
   * const result = jwtService.validate(token);
   *
   * if (result.valid) {
   *   console.log('User ID:', result.userId);
   *   console.log('Tenant ID:', result.tenantId);
   * } else {
   *   console.error('Validation failed:', result.error);
   * }
   * ```
   *
   * @example Validation with options
   * ```typescript
   * const result = jwtService.validate(token, {
   *   ignoreExpiration: false,
   *   issuers: ['https://auth.example.com'],
   *   audience: 'my-api'
   * });
   * ```
   */
  validate(token: string, options?: JwtValidateOptions): TokenValidationResult {
    return withAuthTracingSync(AuthOperation.JWT_VALIDATE, () => {
      return this.validateInternal(token, options);
    });
  }

  /**
   * Internal validate implementation
   */
  // eslint-disable-next-line complexity
  private validateInternal(token: string, options?: JwtValidateOptions): TokenValidationResult {
    try {
      const payload = this.decodeInternal(token);

      // Check expiration
      if (!options?.ignoreExpiration && payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
          return {
            valid: false,
            error: `Token expired at ${new Date(payload.exp * 1000).toISOString()}`
          };
        }
      }

      // Check issuer
      if (options?.issuers) {
        // Issuer must be present AND in the allowed list
        if (!payload.iss || !options.issuers.includes(payload.iss)) {
          return {
            valid: false,
            error: payload.iss
              ? `Invalid token issuer: ${payload.iss}`
              : 'Token is missing the required issuer claim'
          };
        }
      }

      // Check audience
      if (options?.audience) {
        // Token must contain the required audience
        const aud = payload.aud;
        const audienceList = Array.isArray(aud) ? aud : typeof aud === 'string' ? [aud] : [];
        if (!audienceList.includes(options.audience)) {
          return {
            valid: false,
            error:
              aud === undefined
                ? `Token does not contain required audience: ${options.audience}`
                : `Invalid token audience: ${String(aud)}`
          };
        }
      }

      const result: TokenValidationResult = {
        valid: true,
        userId: payload.sub
      };
      if (payload.tenant_id !== undefined) {
        result.tenantId = payload.tenant_id;
      }
      if (payload.exp !== undefined) {
        result.exp = payload.exp;
      }
      return result;
    } catch (error) {
      if (error instanceof TokenValidationError) {
        return {
          valid: false,
          error: error.message
        };
      }
      return {
        valid: false,
        error: 'Token validation failed'
      };
    }
  }

  /**
   * Extract tenant ID from JWT token
   *
   * @param token - JWT token string
   * @returns Tenant ID or undefined
   *
   * @example Extracting tenant ID for multi-tenant operations
   * ```typescript
   * const jwtService = new JwtService();
   * const tenantId = jwtService.extractTenantId(token);
   *
   * if (tenantId) {
   *   await this.tenantService.setContext(tenantId);
   * }
   * ```
   */
  extractTenantId(token: string): string | undefined {
    try {
      const payload = this.decode(token);
      return payload.tenant_id;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract user ID from JWT token
   *
   * @param token - JWT token string
   * @returns User ID or undefined
   */
  extractUserId(token: string): string | undefined {
    try {
      const payload = this.decode(token);
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract actor ID from JWT token
   *
   * @param token - JWT token string
   * @returns Actor ID or undefined
   */
  extractActorId(token: string): string | undefined {
    try {
      const payload = this.decode(token);
      return payload.actor_id;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract roles from JWT token
   *
   * @param token - JWT token string
   * @returns Array of role names
   *
   * @example Checking user roles from token
   * ```typescript
   * const jwtService = new JwtService();
   * const roles = jwtService.extractRoles(token);
   *
   * if (roles.includes('admin')) {
   *   // Grant admin access
   * }
   * ```
   */
  extractRoles(token: string): string[] {
    try {
      const payload = this.decode(token);
      return payload.roles ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Extract permissions from JWT token
   *
   * @param token - JWT token string
   * @returns Array of permission names
   *
   * @example Checking user permissions from token
   * ```typescript
   * const jwtService = new JwtService();
   * const permissions = jwtService.extractPermissions(token);
   *
   * if (permissions.includes('users:create')) {
   *   // Allow user creation
   * }
   * ```
   */
  extractPermissions(token: string): string[] {
    try {
      const payload = this.decode(token);
      return payload.permissions ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Check if token is expired
   *
   * @param token - JWT token string
   * @returns True if token is expired
   *
   * @example Checking token expiration before making API calls
   * ```typescript
   * const jwtService = new JwtService();
   *
   * if (jwtService.isExpired(accessToken)) {
   *   // Refresh the token
   *   accessToken = await this.refreshToken();
   * }
   * ```
   */
  isExpired(token: string): boolean {
    try {
      const payload = this.decode(token);
      if (!payload.exp) {
        return false; // No expiration set
      }
      const now = Math.floor(Date.now() / 1000);
      return payload.exp < now;
    } catch {
      return true; // Invalid token is considered expired
    }
  }

  /**
   * Get token expiration time
   *
   * @param token - JWT token string
   * @returns Expiration date or undefined
   */
  getExpiration(token: string): Date | undefined {
    try {
      const payload = this.decode(token);
      if (!payload.exp) {
        return undefined;
      }
      return new Date(payload.exp * 1000);
    } catch {
      return undefined;
    }
  }

  /**
   * Get token issued at time
   *
   * @param token - JWT token string
   * @returns Issued at date or undefined
   */
  getIssuedAt(token: string): Date | undefined {
    try {
      const payload = this.decode(token);
      if (!payload.iat) {
        return undefined;
      }
      return new Date(payload.iat * 1000);
    } catch {
      return undefined;
    }
  }

  /**
   * Get token ID (jti claim)
   *
   * @param token - JWT token string
   * @returns Token ID or undefined
   */
  getTokenId(token: string): string | undefined {
    try {
      const payload = this.decode(token);
      return payload.jti;
    } catch {
      return undefined;
    }
  }
}

/**
 * @deprecated Use dependency injection instead. Global singleton will be removed in future versions.
 * For backward compatibility only - prefer injecting JwtService via constructor.
 */
export const jwtService = new JwtService();
