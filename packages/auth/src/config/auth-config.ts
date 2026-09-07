/**
 * Auth Module Configuration
 *
 * This file maintains backward compatibility with existing AuthModule configuration
 * while the new configuration layer is in config/index.ts.
 *
 * @deprecated Use the new configuration layer from '@package/auth/config'
 * which provides a more flexible configuration system with environment variable fallbacks.
 *
 * @example New approach (recommended):
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 *
 * const config = resolveConfig({
 *   keycloak: {
 *     authServerUrl: 'http://localhost:8080',
 *     realm: 'my-realm',
 *     clientId: 'my-client',
 *   },
 * });
 * ```
 *
 * @example Old approach (still supported for backward compatibility):
 * ```typescript
 * import { keycloakAuthConfig } from '@package/auth';
 *
 * AuthModule.forRoot({
 *   providers: [keycloakAuthConfig()],
 * })
 * ```
 */

import { AuthProviderType } from '../constants';
import { InvalidAuthProviderConfigError } from '../errors';

import type { AuthProviderConfig } from '../providers/factory';
import type {
  KeycloakAuthProviderOptions,
  GoogleAuthProviderOptions,
  GoogleIdentityPlatformAuthProviderOptions,
  CustomJwtAuthProviderOptions,
  DatabaseTables,
  DatabaseQueryUtils,
  EncryptionUtils,
  PasswordHasher
} from '../providers/factory.types';

/**
 * Token storage configuration
 *
 * @deprecated Use TokenStorageConfig from '@package/auth/config'
 */
export interface TokenStorageConfig {
  /** Enable refresh token storage in Redis */
  enabled: boolean;
  /** Enable token rotation on refresh */
  enableRotation: boolean;
  /** Enable token blacklisting (access tokens) */
  enableBlacklisting: boolean;
  /** Refresh token expiration in seconds (default: 30 days) */
  refreshTokenExpiration: number;
  /** Session expiration in seconds (default: 7 days) */
  sessionExpiration: number;
}

/**
 * Auth module configuration
 *
 * @deprecated Use InfrastructureAuthConfig from '@package/auth/config'
 */
export interface AuthModuleConfig {
  /**
   * Array of auth provider configurations
   * At least one provider must be marked as default
   */
  providers: AuthProviderConfig[];

  /**
   * Token storage configuration
   */
  tokenStorage?: Partial<TokenStorageConfig>;

  /**
   * JWT configuration
   */
  jwt?: {
    /** Token expiration in seconds (default: 1 hour) */
    expiresIn?: number;
    /** Token algorithm (default: RS256) */
    algorithm?: string;
    /** Token issuer */
    issuer?: string;
    /** Token audience */
    audience?: string;
  };
}

/**
 * Default token storage configuration
 *
 * @deprecated Use DEFAULT_TOKEN_STORAGE_CONFIG from '@package/auth/config'
 */
export const DEFAULT_TOKEN_STORAGE_CONFIG: TokenStorageConfig = {
  enabled: true,
  enableRotation: true,
  enableBlacklisting: true,
  refreshTokenExpiration: 2592000, // 30 days
  sessionExpiration: 604800 // 7 days
};

/**
 * Create Keycloak auth provider configuration from environment variables
 *
 * @deprecated Use the new configuration layer:
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 * const config = resolveConfig();
 * ```
 *
 * This function is maintained for backward compatibility.
 *
 * @param overrides - Optional partial configuration to override environment defaults
 * @returns AuthProviderConfig configured for Keycloak
 * @throws {InvalidAuthProviderConfigError} When required environment variables are missing
 *   (KEYCLOAK_AUTH_SERVER_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID)
 */
export function keycloakAuthConfig(
  overrides?: Partial<KeycloakAuthProviderOptions> & { default?: boolean }
): AuthProviderConfig {
  const authServerUrl = process.env['KEYCLOAK_AUTH_SERVER_URL'];
  const realm = process.env['KEYCLOAK_REALM'];
  const clientId = process.env['KEYCLOAK_CLIENT_ID'];
  const clientSecret = process.env['KEYCLOAK_CLIENT_SECRET'];

  if (!authServerUrl || !realm || !clientId) {
    throw new InvalidAuthProviderConfigError(
      'Missing required Keycloak environment variables: KEYCLOAK_AUTH_SERVER_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID'
    );
  }

  const options: KeycloakAuthProviderOptions = {
    authServerUrl,
    realm,
    clientId,
    ...overrides
  };

  // Only set clientSecret if it's defined
  const resolvedClientSecret = clientSecret ?? overrides?.clientSecret;
  if (resolvedClientSecret !== undefined) {
    options.clientSecret = resolvedClientSecret;
  }

  return {
    type: AuthProviderType.KEYCLOAK,
    default: overrides?.default ?? true,
    options
  };
}

/**
 * Validate auth configuration
 *
 * @param config - Auth module configuration to validate
 * @throws {InvalidAuthProviderConfigError} When validation fails:
 *   - No providers configured
 *   - No default provider specified
 *   - Multiple default providers specified
 *   - Provider missing type or options
 */
export function validateAuthConfig(config: AuthModuleConfig): void {
  if (!config.providers || config.providers.length === 0) {
    throw new InvalidAuthProviderConfigError('At least one auth provider must be configured');
  }

  const defaultProviders = config.providers.filter((p) => p.default);
  if (defaultProviders.length === 0) {
    throw new InvalidAuthProviderConfigError('At least one provider must be marked as default');
  }
  if (defaultProviders.length > 1) {
    throw new InvalidAuthProviderConfigError('Only one provider can be marked as default');
  }

  // Validate each provider config
  for (const provider of config.providers) {
    if (!provider.type || !provider.options) {
      throw new InvalidAuthProviderConfigError(
        'Invalid provider configuration: type and options are required'
      );
    }
  }
}

/**
 * Create Google auth provider configuration from environment variables
 *
 * @deprecated Use the new configuration layer:
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 * const config = resolveConfig();
 * ```
 *
 * This function is maintained for backward compatibility.
 *
 * @param overrides - Optional partial configuration to override environment defaults
 * @returns AuthProviderConfig configured for Google OAuth
 * @throws {InvalidAuthProviderConfigError} When GOOGLE_CLIENT_ID environment variable is missing
 */
export function googleAuthConfig(
  overrides?: Partial<GoogleAuthProviderOptions> & { default?: boolean }
): AuthProviderConfig {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  const redirectUri = process.env['GOOGLE_REDIRECT_URI'];

  if (!clientId) {
    throw new InvalidAuthProviderConfigError(
      'Missing required Google environment variable: GOOGLE_CLIENT_ID'
    );
  }

  const options: GoogleAuthProviderOptions = {
    clientId,
    redirectUri: redirectUri ?? overrides?.redirectUri ?? '',
    ...overrides
  };

  // Only set clientSecret if it's defined
  const resolvedClientSecret = clientSecret ?? overrides?.clientSecret;
  if (resolvedClientSecret !== undefined) {
    options.clientSecret = resolvedClientSecret;
  }

  const projectId = process.env['GOOGLE_PROJECT_ID'] ?? overrides?.projectId;
  if (projectId !== undefined) {
    options.projectId = projectId;
  }

  const hd = process.env['GOOGLE_HD'] ?? overrides?.hd;
  if (hd !== undefined) {
    options.hd = hd;
  }

  const tenantId = process.env['GOOGLE_TENANT_ID'] ?? overrides?.tenantId;
  if (tenantId !== undefined) {
    options.tenantId = tenantId;
  }

  return {
    type: AuthProviderType.GOOGLE,
    default: overrides?.default ?? false,
    options
  };
}

/**
 * Create Google Cloud Identity Platform auth provider configuration from environment variables
 *
 * @deprecated Use the new configuration layer:
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 * const config = resolveConfig();
 * ```
 *
 * This function is maintained for backward compatibility.
 *
 * @param overrides - Optional partial configuration to override environment defaults
 * @returns AuthProviderConfig configured for Google Identity Platform
 * @throws {InvalidAuthProviderConfigError} When neither GOOGLE_CLOUD_PROJECT_ID nor
 *   FIREBASE_PROJECT_ID environment variable is set
 *
 * @example
 * ```typescript
 * import { AuthModule, googleIdentityPlatformAuthConfig } from '@package/auth';
 *
 * @Module({
 *   imports: [
 *     AuthModule.forRoot({
 *       providers: [
 *         googleIdentityPlatformAuthConfig({
 *           default: true,
 *         }),
 *       ],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export function googleIdentityPlatformAuthConfig( // eslint-disable-line complexity
  overrides?: Partial<GoogleIdentityPlatformAuthProviderOptions> & { default?: boolean }
): AuthProviderConfig {
  // Check for GOOGLE_CLOUD_PROJECT_ID or FIREBASE_PROJECT_ID
  const projectId =
    process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
    process.env['FIREBASE_PROJECT_ID'] ||
    overrides?.projectId;

  if (!projectId) {
    throw new InvalidAuthProviderConfigError(
      'Missing required Google Cloud Identity Platform environment variable: GOOGLE_CLOUD_PROJECT_ID or FIREBASE_PROJECT_ID'
    );
  }

  // Build service account from environment variables if not provided in overrides
  const serviceAccount = overrides?.serviceAccount ?? {
    projectId,
    privateKey: process.env['FIREBASE_PRIVATE_KEY'] ?? '',
    clientEmail: process.env['FIREBASE_CLIENT_EMAIL'] ?? ''
  };

  const options: GoogleIdentityPlatformAuthProviderOptions = {
    projectId,
    serviceAccount,
    ...overrides
  };

  const clientId = process.env['FIREBASE_CLIENT_ID'] ?? overrides?.clientId;
  if (clientId !== undefined) {
    options.clientId = clientId;
  }

  const clientSecret = process.env['FIREBASE_CLIENT_SECRET'] ?? overrides?.clientSecret;
  if (clientSecret !== undefined) {
    options.clientSecret = clientSecret;
  }

  const tenantId = process.env['FIREBASE_TENANT_ID'] ?? overrides?.tenantId;
  if (tenantId !== undefined) {
    options.tenantId = tenantId;
  }

  const apiKey = process.env['FIREBASE_API_KEY'] ?? overrides?.apiKey;
  if (apiKey !== undefined) {
    options.apiKey = apiKey;
  }

  return {
    type: AuthProviderType.GOOGLE_IDENTITY_PLATFORM,
    default: overrides?.default ?? true,
    options
  };
}

/**
 * Create Custom JWT auth provider configuration from environment variables
 *
 * @param overrides - Optional partial configuration to override defaults
 * @returns AuthProviderConfig configured for Custom JWT authentication
 *
 * @example
 * ```typescript
 * import { AuthModule, customJwtAuthConfig } from '@package/auth';
 *
 * @Module({
 *   imports: [
 *     AuthModule.forRoot({
 *       providers: [
 *         customJwtAuthConfig({
 *           default: true,
 *         }),
 *       ],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export function customJwtAuthConfig(
  overrides?: Partial<CustomJwtAuthProviderOptions> & { default?: boolean }
): AuthProviderConfig {
  // Note: Custom JWT provider uses environment variables for configuration
  // The actual dependencies (db, roleService, etc.) are injected via the provider factory
  // when the module initializes, not through this config function.

  // Create a placeholder dependencies object that satisfies the type checker
  // The actual dependencies will be injected at runtime by the provider factory
  const placeholderDeps: CustomJwtAuthProviderOptions['dependencies'] = {
    db: {} as Record<string, unknown>,
    tables: {} as DatabaseTables,
    queryUtils: {} as DatabaseQueryUtils,
    passwordHasher: {
      verify: async () => false
    } as PasswordHasher,
    encryption: {
      decryptField: async () => ''
    } as EncryptionUtils,
    roleService: {
      getSystemRoles: async () => [],
      getTenantRole: async () => null
    },
    permissionService: {
      getUserPermissions: async () => []
    },
    tokenService: {
      storeRefreshToken: async () => {},
      getRefreshToken: async () => undefined,
      deleteRefreshToken: async () => {},
      blacklistAccessToken: async () => {},
      isAccessTokenBlacklisted: async () => false
    },
    cacheService: {
      get: async () => null,
      set: async () => {},
      delete: async () => {}
    }
  };

  return {
    type: AuthProviderType.CUSTOM_JWT,
    default: overrides?.default ?? true,
    options: {
      name: overrides?.name ?? 'custom-jwt',
      dependencies: placeholderDeps
    }
  };
}
