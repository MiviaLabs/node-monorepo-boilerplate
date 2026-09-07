/**
 * Configuration interfaces for auth package
 *
 * This module defines all configuration interfaces that allow users to override
 * default settings via input options, with environment variables as fallback.
 */

import type { AdminCredentials } from './admin-credentials.config';

/**
 * Keycloak authentication provider configuration
 */
export interface KeycloakConfig {
  /** Keycloak base URL (e.g., http://localhost:8080) */
  authServerUrl?: string;
  /** Keycloak realm name */
  realm?: string;
  /** OAuth 2.0 client ID */
  clientId?: string;
  /** OAuth 2.0 client secret (for confidential clients) */
  clientSecret?: string;
  /** Provider name (defaults to 'keycloak') */
  name?: string;
  /** Whether to use SSL/TLS for Keycloak connections */
  useSsl?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Public key for token verification (RS256) */
  publicKey?: string;
  /** Public key certificate URL */
  publicKeyUrl?: string;
  /** Admin credentials for Keycloak Admin REST API (optional) */
  adminCredentials?: AdminCredentials;
}

/**
 * Google Cloud Platform authentication provider configuration
 */
export interface GoogleConfig {
  /** OAuth 2.0 client ID */
  clientId?: string;
  /** OAuth 2.0 client secret (for confidential clients) */
  clientSecret?: string;
  /** OAuth 2.0 redirect URI */
  redirectUri?: string;
  /** Google Cloud project ID */
  projectId?: string;
  /** Google Workspace domain (for enterprise) */
  hd?: string;
  /** Google tenant ID (for workforce identity federation) */
  tenantId?: string;
  /** Provider name (defaults to 'google') */
  name?: string;
  /** Whether to use SSL/TLS for Google connections */
  useSsl?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Google Cloud Identity Platform authentication provider configuration
 */
export interface GoogleIdentityPlatformConfig {
  /** Google Cloud project ID (required for most operations) */
  projectId?: string;
  /** OAuth 2.0 client ID (for web client) */
  clientId?: string;
  /** OAuth 2.0 client secret (for web client) */
  clientSecret?: string;
  /** Identity Platform tenant ID (for multi-tenancy) */
  tenantId?: string;
  /** API key (for client SDK) */
  apiKey?: string;
  /** Service account credentials (for admin operations) */
  serviceAccount?: {
    /** Google Cloud project ID */
    projectId: string;
    /** Service account private key */
    privateKey: string;
    /** Service account email */
    clientEmail: string;
  };
  /** Provider name (defaults to 'google-identity-platform') */
  name?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * JWT token configuration
 */
export interface JwtConfig {
  /** JWT secret for signing tokens (required for HS256) */
  secret?: string;
  /** JWT issuer claim */
  issuer?: string;
  /** JWT audience claim */
  audience?: string;
  /** Token expiration time in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
  /** Token algorithm: HS256, RS256, etc. (default: RS256) */
  algorithm?: string;
}

/**
 * Token storage configuration (Redis-based)
 */
export interface TokenStorageConfig {
  /** Enable refresh token storage in Redis */
  enabled?: boolean;
  /** Enable token rotation on refresh */
  enableRotation?: boolean;
  /** Enable token blacklisting (access tokens) */
  enableBlacklisting?: boolean;
  /** Refresh token expiration in seconds (default: 2592000 = 30 days) */
  refreshTokenExpiration?: number;
  /** Session expiration in seconds (default: 604800 = 7 days) */
  sessionExpiration?: number;
}

/**
 * Redis key prefix configuration for token storage
 */
export interface RedisKeyPrefixConfig {
  /** Key prefix for refresh tokens (default: 'auth:refresh') */
  refreshToken?: string;
  /** Key prefix for access token blacklist (default: 'auth:blacklist:access') */
  blacklist?: string;
  /** Key prefix for session tokens (default: 'auth:session') */
  session?: string;
}

/**
 * Environment variable name mappings
 *
 * Allows customization of environment variable names for different deployment scenarios.
 */
export interface EnvironmentVariableNames {
  // Keycloak environment variables
  /** Keycloak auth server URL (default: KEYCLOAK_AUTH_SERVER_URL) */
  keycloakAuthServerUrl?: string;
  /** Keycloak realm (default: KEYCLOAK_REALM) */
  keycloakRealm?: string;
  /** Keycloak client ID (default: KEYCLOAK_CLIENT_ID) */
  keycloakClientId?: string;
  /** Keycloak client secret (default: KEYCLOAK_CLIENT_SECRET) */
  keycloakClientSecret?: string;
  /** Keycloak public key (default: KEYCLOAK_PUBLIC_KEY) */
  keycloakPublicKey?: string;
  /** Keycloak public key URL (default: KEYCLOAK_PUBLIC_KEY_URL) */
  keycloakPublicKeyUrl?: string;
  /** Keycloak use SSL (default: KEYCLOAK_USE_SSL) */
  keycloakUseSsl?: string;
  /** Keycloak timeout (default: KEYCLOAK_TIMEOUT) */
  keycloakTimeout?: string;
  /** Keycloak admin username (default: KEYCLOAK_ADMIN_USERNAME) */
  keycloakAdminUsername?: string;
  /** Keycloak admin password (default: KEYCLOAK_ADMIN_PASSWORD) */
  keycloakAdminPassword?: string;

  // Google environment variables
  /** Google client ID (default: GOOGLE_CLIENT_ID) */
  googleClientId?: string;
  /** Google client secret (default: GOOGLE_CLIENT_SECRET) */
  googleClientSecret?: string;
  /** Google redirect URI (default: GOOGLE_REDIRECT_URI) */
  googleRedirectUri?: string;
  /** Google project ID (default: GOOGLE_PROJECT_ID) */
  googleProjectId?: string;
  /** Google Workspace domain (default: GOOGLE_HD) */
  googleHd?: string;
  /** Google tenant ID (default: GOOGLE_TENANT_ID) */
  googleTenantId?: string;
  /** Google provider name (default: GOOGLE_NAME) */
  googleName?: string;
  /** Google use SSL (default: GOOGLE_USE_SSL) */
  googleUseSsl?: string;
  /** Google timeout (default: GOOGLE_TIMEOUT) */
  googleTimeout?: string;

  // Google Identity Platform environment variables
  /** Google Cloud project ID (default: GOOGLE_CLOUD_PROJECT_ID or FIREBASE_PROJECT_ID) */
  googleIdentityPlatformProjectId?: string;
  /** Firebase client ID (default: FIREBASE_CLIENT_ID) */
  googleIdentityPlatformClientId?: string;
  /** Firebase client secret (default: FIREBASE_CLIENT_SECRET) */
  googleIdentityPlatformClientSecret?: string;
  /** Firebase tenant ID (default: FIREBASE_TENANT_ID) */
  googleIdentityPlatformTenantId?: string;
  /** Firebase API key (default: FIREBASE_API_KEY) */
  googleIdentityPlatformApiKey?: string;
  /** Google Identity Platform provider name (default: GOOGLE_IDENTITY_PLATFORM_NAME) */
  googleIdentityPlatformName?: string;
  /** Google Identity Platform timeout (default: GOOGLE_IDENTITY_PLATFORM_TIMEOUT) */
  googleIdentityPlatformTimeout?: string;

  // JWT environment variables
  /** JWT secret (default: JWT_SECRET) */
  jwtSecret?: string;
  /** JWT issuer (default: JWT_ISSUER) */
  jwtIssuer?: string;
  /** JWT audience (default: JWT_AUDIENCE) */
  jwtAudience?: string;
  /** JWT expires in (default: JWT_EXPIRES_IN) */
  jwtExpiresIn?: string;
  /** JWT algorithm (default: JWT_ALGORITHM) */
  jwtAlgorithm?: string;

  // Token storage environment variables
  /** Token storage enabled (default: AUTH_TOKEN_STORAGE_ENABLED) */
  tokenStorageEnabled?: string;
  /** Token storage rotation (default: AUTH_TOKEN_STORAGE_ROTATION) */
  tokenStorageRotation?: string;
  /** Token storage blacklisting (default: AUTH_TOKEN_STORAGE_BLACKLISTING) */
  tokenStorageBlacklisting?: string;
  /** Refresh token expiration (default: AUTH_REFRESH_TOKEN_EXPIRATION) */
  refreshTokenExpiration?: string;
  /** Session expiration (default: AUTH_SESSION_EXPIRATION) */
  sessionExpiration?: string;

  // Redis key prefix environment variables
  /** Redis key prefix for refresh tokens (default: AUTH_REDIS_KEY_PREFIX_REFRESH) */
  redisKeyPrefixRefresh?: string;
  /** Redis key prefix for blacklist (default: AUTH_REDIS_KEY_PREFIX_BLACKLIST) */
  redisKeyPrefixBlacklist?: string;
  /** Redis key prefix for session (default: AUTH_REDIS_KEY_PREFIX_SESSION) */
  redisKeyPrefixSession?: string;
}

/**
 * Main configuration interface for auth package
 *
 * All configuration options are optional. If not provided, they will be
 * read from environment variables, or fall back to default values.
 */
export interface InfrastructureAuthConfig {
  /** Keycloak authentication provider configuration */
  keycloak?: KeycloakConfig;

  /** Google Cloud Platform authentication provider configuration */
  google?: GoogleConfig;

  /** Google Cloud Identity Platform authentication provider configuration */
  googleIdentityPlatform?: GoogleIdentityPlatformConfig;

  /** JWT token configuration */
  jwt?: JwtConfig;

  /** Token storage configuration */
  tokenStorage?: TokenStorageConfig;

  /** Redis key prefix configuration */
  redisKeyPrefix?: RedisKeyPrefixConfig;

  /** Custom environment variable names (optional) */
  envVarNames?: EnvironmentVariableNames;
}

/**
 * Resolved Keycloak configuration with all defaults applied
 *
 * Optional fields remain optional (clientSecret, publicKey, publicKeyUrl, adminCredentials)
 */
export type ResolvedKeycloakConfig = Required<
  Omit<KeycloakConfig, 'clientSecret' | 'publicKey' | 'publicKeyUrl' | 'adminCredentials'>
> & {
  clientSecret?: string;
  publicKey?: string;
  publicKeyUrl?: string;
  adminCredentials?: AdminCredentials;
};

/**
 * Resolved Google configuration with all defaults applied
 *
 * Optional fields remain optional (clientSecret, projectId, hd, tenantId)
 */
export type ResolvedGoogleConfig = Required<
  Omit<GoogleConfig, 'clientSecret' | 'projectId' | 'hd' | 'tenantId'>
> & {
  clientSecret?: string;
  projectId?: string;
  hd?: string;
  tenantId?: string;
};

/**
 * Resolved Google Identity Platform configuration with all defaults applied
 *
 * Optional fields remain optional (clientId, clientSecret, tenantId, apiKey, serviceAccount)
 */
export type ResolvedGoogleIdentityPlatformConfig = Required<
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
 * Resolved JWT configuration with all defaults applied
 *
 * The secret field remains optional as it's only required for HS256.
 */
export type ResolvedJwtConfig = Omit<Required<JwtConfig>, 'secret'> & { secret?: string };

/**
 * Resolved configuration with all defaults applied
 *
 * This interface represents the final configuration after merging user options,
 * environment variables, and defaults.
 */
export interface ResolvedInfrastructureAuthConfig {
  /** Keycloak configuration (with defaults) */
  keycloak: ResolvedKeycloakConfig;

  /** Google configuration (with defaults) */
  google: ResolvedGoogleConfig;

  /** Google Identity Platform configuration (with defaults) */
  googleIdentityPlatform: ResolvedGoogleIdentityPlatformConfig;

  /** JWT configuration (with defaults, secret may be undefined) */
  jwt: ResolvedJwtConfig;

  /** Token storage configuration (with defaults) */
  tokenStorage: Required<TokenStorageConfig>;

  /** Redis key prefix configuration (with defaults) */
  redisKeyPrefix: Required<RedisKeyPrefixConfig>;
}
