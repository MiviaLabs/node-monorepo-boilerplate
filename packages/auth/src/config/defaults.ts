/**
 * Default configuration values for auth package
 *
 * These defaults are designed for production use with balanced
 * security, performance, and resource consumption.
 */

import type {
  KeycloakConfig,
  GoogleConfig,
  GoogleIdentityPlatformConfig,
  JwtConfig,
  TokenStorageConfig,
  RedisKeyPrefixConfig
} from './interfaces';

/**
 * Default Keycloak configuration
 *
 * These defaults are suitable for local development with Keycloak running in Docker.
 */
export const DEFAULT_KEYCLOAK_CONFIG: Required<
  Omit<KeycloakConfig, 'clientSecret' | 'publicKey' | 'publicKeyUrl' | 'adminCredentials'>
> & {
  clientSecret?: string;
  publicKey?: string;
  publicKeyUrl?: string;
  adminCredentials?: import('./admin-credentials.config').AdminCredentials;
} = Object.freeze({
  authServerUrl: 'http://localhost:8080',
  realm: 'master',
  clientId: 'nestjs-api',
  name: 'keycloak',
  useSsl: false,
  timeout: 5000 // 5 seconds
} as const) as Required<
  Omit<KeycloakConfig, 'clientSecret' | 'publicKey' | 'publicKeyUrl' | 'adminCredentials'>
> & {
  clientSecret?: string;
  publicKey?: string;
  publicKeyUrl?: string;
  adminCredentials?: import('./admin-credentials.config').AdminCredentials;
};

/**
 * Default Google configuration
 *
 * These defaults are suitable for development with Google OAuth 2.0.
 */
export const DEFAULT_GOOGLE_CONFIG: Required<
  Omit<GoogleConfig, 'clientSecret' | 'projectId' | 'hd' | 'tenantId'>
> & {
  clientSecret?: string;
  projectId?: string;
  hd?: string;
  tenantId?: string;
} = Object.freeze({
  clientId: '',
  redirectUri: 'http://localhost:3000/auth/callback/google',
  name: 'google',
  useSsl: true, // Google requires HTTPS for production
  timeout: 5000 // 5 seconds
} as const) as Required<Omit<GoogleConfig, 'clientSecret' | 'projectId' | 'hd' | 'tenantId'>> & {
  clientSecret?: string;
  projectId?: string;
  hd?: string;
  tenantId?: string;
};

/**
 * Default Google Identity Platform configuration
 *
 * These defaults are suitable for development with Google Cloud Identity Platform.
 */
export const DEFAULT_GOOGLE_IDENTITY_PLATFORM_CONFIG: Required<
  Omit<
    GoogleIdentityPlatformConfig,
    'projectId' | 'clientId' | 'clientSecret' | 'tenantId' | 'apiKey' | 'serviceAccount'
  >
> & {
  projectId?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  apiKey?: string;
  serviceAccount?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
} = Object.freeze({
  name: 'google-identity-platform',
  timeout: 10000 // 10 seconds (longer timeout for Identity Platform API calls)
} as const) as Required<
  Omit<
    GoogleIdentityPlatformConfig,
    'projectId' | 'clientId' | 'clientSecret' | 'tenantId' | 'apiKey' | 'serviceAccount'
  >
> & {
  projectId?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  apiKey?: string;
  serviceAccount?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
};

/**
 * Default JWT configuration
 *
 * Uses RS256 algorithm for production security. For HS256, provide a secret.
 */
export const DEFAULT_JWT_CONFIG: Omit<Required<JwtConfig>, 'secret'> & { secret?: string } =
  Object.freeze({
    issuer: 'keycloak',
    audience: 'nestjs-api',
    expiresIn: 3600, // 1 hour
    algorithm: 'RS256'
  } as const) as Omit<Required<JwtConfig>, 'secret'> & { secret?: string };

/**
 * Default token storage configuration
 *
 * Enables Redis-based token storage with rotation and blacklisting for enhanced security.
 */
export const DEFAULT_TOKEN_STORAGE_CONFIG: Required<TokenStorageConfig> = {
  enabled: true,
  enableRotation: true,
  enableBlacklisting: true,
  refreshTokenExpiration: 2592000, // 30 days
  sessionExpiration: 604800 // 7 days
};

/**
 * Default Redis key prefix configuration
 *
 * Provides consistent key naming for token storage in Redis.
 */
export const DEFAULT_REDIS_KEY_PREFIX_CONFIG: Required<RedisKeyPrefixConfig> = {
  refreshToken: 'auth:refresh',
  blacklist: 'auth:blacklist:access',
  session: 'auth:session'
};
