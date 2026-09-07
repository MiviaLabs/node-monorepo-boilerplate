/**
 * Auth constants
 *
 * This file contains constants that are now configurable via the new configuration layer.
 * For new code, import from '@package/auth/config' instead.
 */

/**
 * Auth provider types
 */
export enum AuthProviderType {
  KEYCLOAK = 'keycloak',
  GOOGLE = 'google',
  GOOGLE_IDENTITY_PLATFORM = 'google-identity-platform',
  CUSTOM_JWT = 'custom-jwt'
  // Future providers:
  // AWS_COGNITO = 'aws-cognito',
  // AZURE_AD = 'azure-ad',
}

/**
 * Token types
 */
export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  ID = 'id'
}

/**
 * JWT claim keys
 */
export const JwtClaim = {
  SUB: 'sub',
  EMAIL: 'email',
  NAME: 'name',
  FAMILY_NAME: 'family_name',
  GIVEN_NAME: 'given_name',
  ROLES: 'roles',
  PERMISSIONS: 'permissions',
  TENANT_ID: 'tenant_id',
  ACTOR_ID: 'actor_id',
  CLIENT_ID: 'client_id',
  SESSION_ID: 'session_id',
  DEVICE_FP: 'device_fp',
  ISS: 'iss',
  EXP: 'exp',
  IAT: 'iat',
  JTI: 'jti'
} as const;

/**
 * Redis key prefixes for token storage
 *
 * @deprecated Use resolveConfig() from '@package/auth/config' instead
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 * const config = resolveConfig();
 * const refreshKeyPrefix = config.redisKeyPrefix.refreshToken;
 * ```
 */
export const RedisKeyPrefix = {
  REFRESH_TOKEN: 'auth:refresh',
  REFRESH_TOKEN_TOKEN_ID: 'auth:refresh:token-id',
  ACCESS_TOKEN_BLACKLIST: 'auth:blacklist:access',
  SESSION: 'auth:session'
} as const;

/**
 * Token expiration times (in seconds)
 *
 * @deprecated Use resolveConfig() from '@package/auth/config' instead
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 * const config = resolveConfig();
 * const refreshTokenExpiration = config.tokenStorage.refreshTokenExpiration;
 * ```
 */
export const TokenExpiration = {
  ACCESS_TOKEN: 3600, // 1 hour
  REFRESH_TOKEN: 2592000, // 30 days
  ID_TOKEN: 3600 // 1 hour
} as const;

/**
 * Default token algorithm
 *
 * @deprecated Use resolveConfig() from '@package/auth/config' instead
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 * const config = resolveConfig();
 * const algorithm = config.jwt.algorithm;
 * ```
 */
export const DEFAULT_TOKEN_ALGORITHM = 'RS256' as const;
