/**
 * Auth Provider Configuration Types
 *
 * Configuration options for different auth providers
 */

/**
 * Admin credentials for Keycloak Admin REST API
 */
export interface AdminCredentials {
  /** Admin username */
  username: string;
  /** Admin password */
  password: string;
}

/**
 * Keycloak provider options
 */
export interface KeycloakAuthProviderOptions {
  /** Keycloak base URL */
  authServerUrl: string;
  /** Keycloak realm name */
  realm: string;
  /** Client ID */
  clientId: string;
  /** Client secret (for confidential clients) */
  clientSecret?: string;
  /** Provider name (defaults to 'keycloak') */
  name?: string;
  /** Whether to use SSL/TLS */
  useSsl?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Public key for token verification (RS256) */
  publicKey?: string;
  /** Public key certificate URL */
  publicKeyUrl?: string;
  /** Admin credentials for Admin REST API (optional) */
  adminCredentials?: AdminCredentials;
}

/**
 * AWS Cognito provider options (future)
 */
export interface AwsCognitoAuthProviderOptions {
  /** AWS region */
  region: string;
  /** User pool ID */
  userPoolId: string;
  /** Client ID */
  clientId: string;
  /** Client secret (for confidential clients) */
  clientSecret?: string;
  /** Provider name (defaults to 'aws-cognito') */
  name?: string;
}

/**
 * Google Cloud Identity provider options (future)
 */
export interface GoogleAuthProviderOptions {
  /** OAuth 2.0 client ID */
  clientId: string;
  /** OAuth 2.0 client secret */
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
  /** Whether to use SSL/TLS */
  useSsl?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Google Cloud Identity Platform provider options
 */
export interface GoogleIdentityPlatformAuthProviderOptions {
  /** Google Cloud project ID (required) */
  projectId: string;
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
 * Azure AD provider options (future)
 */
export interface AzureAdAuthProviderOptions {
  /** Azure AD tenant ID */
  tenantId: string;
  /** Application (client) ID */
  clientId: string;
  /** Client secret (for confidential clients) */
  clientSecret?: string;
  /** Instance (defaults to https://login.microsoftonline.com) */
  instance?: string;
  /** Provider name (defaults to 'azure-ad') */
  name?: string;
}

/**
 * Database table definitions for CustomJwtAuthProvider
 *
 * These interfaces allow CustomJwtAuthProvider to receive database tables
 * and utilities via dependency injection instead of lazy-loading them,
 * avoiding circular dependencies with @package/db-core.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// We use any here because the actual table types come from @package/db-core
// which we don't want to directly import to avoid circular dependencies.
export interface DatabaseTables {
  /** Users table from @package/db-core */
  users: any;
  /** User identities table from @package/db-core */
  userIdentities: any;
}

/**
 * Database query utilities for CustomJwtAuthProvider
 */
export interface DatabaseQueryUtils {
  /** Drizzle eq operator */

  eq: any;
  /** Drizzle and operator */

  and: any;
  /** Drizzle isNull operator */

  isNull: any;
}

/**
 * Encryption utilities for CustomJwtAuthProvider
 */
export interface EncryptionUtils {
  /** Decrypt a field that was encrypted at rest */
  decryptField: (encrypted: string) => Promise<string>;
}

/**
 * Password hashing utilities for CustomJwtAuthProvider
 */
export interface PasswordHasher {
  /** Verify a password against a hash */
  verify: (hash: string, password: string) => Promise<boolean>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Replay detection failure behavior
 *
 * - FailOpen: Continue validation without replay protection (default - prioritizes availability)
 * - FailClosed: Return invalid token response (prioritizes security)
 */
export const REPLAY_DETECTION_FAIL_BEHAVIOR = {
  /** Continue validation without replay protection (default - prioritizes availability) */
  FailOpen: 'fail-open',
  /** Return invalid token response (prioritizes security) */
  FailClosed: 'fail-closed'
} as const;

export type ReplayDetectionFailBehavior =
  (typeof REPLAY_DETECTION_FAIL_BEHAVIOR)[keyof typeof REPLAY_DETECTION_FAIL_BEHAVIOR];

/**
 * Custom JWT provider options
 */
export interface CustomJwtAuthProviderOptions {
  /** Provider name (defaults to 'custom-jwt') */
  name?: string;
  /**
   * Behavior when replay detection fails due to cache/service errors.
   *
   * - 'fail-open': Continue validation without replay protection (default)
   *   Use when availability is critical and you have other security layers.
   * - 'fail-closed': Return invalid token response
   *   Use when security is paramount and downtime is acceptable.
   *
   * @default 'fail-open'
   */
  replayDetectionFailBehavior?: ReplayDetectionFailBehavior;
  /** Dependencies injected from module */
  dependencies: {
    /** Database instance */
    db: Record<string, unknown>;
    /** Database table definitions */
    tables: DatabaseTables;
    /** Database query utilities */
    queryUtils: DatabaseQueryUtils;
    /** Password hashing utilities */
    passwordHasher: PasswordHasher;
    /** Encryption utilities for PII fields */
    encryption: EncryptionUtils;
    /** Config service */
    configService?: Record<string, unknown>;
    /** Role service */
    roleService: {
      getSystemRoles(userId: number): Promise<string[]>;
      getTenantRole(userId: number, tenantId: number): Promise<string | null>;
    };
    /** Permission service */
    permissionService: {
      getUserPermissions(userId: number, tenantId?: number): Promise<string[]>;
    };
    /** Token service */
    tokenService: {
      storeRefreshToken: (
        tokenId: string,
        userId: string,
        tenantId: string,
        sessionId: string,
        expiresIn?: number
      ) => Promise<void>;
      getRefreshToken: (
        tokenId: string,
        tenantId?: string
      ) => Promise<
        | {
            userId: string;
            tokenId: string;
            tenantId: string;
            expiresAt: Date;
            revoked: boolean;
          }
        | undefined
      >;
      deleteRefreshToken: (tokenId: string, tenantId: string) => Promise<void>;
      blacklistAccessToken: (tokenId: string, tenantId: string, expiresIn: number) => Promise<void>;
      isAccessTokenBlacklisted: (tokenId: string, tenantId: string) => Promise<boolean>;
    };
    /** Cache service */
    cacheService: {
      get: <T = unknown>(key: string) => Promise<T | null>;
      set: (key: string, value: string, options?: { ttl?: number }) => Promise<void>;
      delete: (key: string) => Promise<void>;
    };
  };
}

/**
 * Union type for all auth provider options
 */
export type AuthProviderOptions =
  | KeycloakAuthProviderOptions
  | AwsCognitoAuthProviderOptions
  | GoogleAuthProviderOptions
  | GoogleIdentityPlatformAuthProviderOptions
  | AzureAdAuthProviderOptions
  | CustomJwtAuthProviderOptions;
