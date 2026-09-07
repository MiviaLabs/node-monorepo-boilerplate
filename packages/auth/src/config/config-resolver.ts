/**
 * Configuration resolver for auth package
 *
 * Merges user configuration, environment variables, and defaults
 * to produce the final resolved configuration.
 *
 * Priority order:
 * 1. User-provided configuration (highest priority)
 * 2. Environment variables
 * 3. Default values (lowest priority)
 */

import { resolveAdminCredentials } from './admin-credentials.config';
import {
  DEFAULT_KEYCLOAK_CONFIG,
  DEFAULT_GOOGLE_CONFIG,
  DEFAULT_GOOGLE_IDENTITY_PLATFORM_CONFIG,
  DEFAULT_JWT_CONFIG,
  DEFAULT_TOKEN_STORAGE_CONFIG,
  DEFAULT_REDIS_KEY_PREFIX_CONFIG
} from './defaults';

import type {
  InfrastructureAuthConfig,
  ResolvedInfrastructureAuthConfig,
  EnvironmentVariableNames,
  TokenStorageConfig,
  RedisKeyPrefixConfig,
  ResolvedKeycloakConfig,
  ResolvedGoogleConfig,
  ResolvedGoogleIdentityPlatformConfig,
  ResolvedJwtConfig
} from './interfaces';

/**
 * Default environment variable names
 */
const DEFAULT_ENV_VAR_NAMES: Required<EnvironmentVariableNames> = {
  // Keycloak
  keycloakAuthServerUrl: 'KEYCLOAK_AUTH_SERVER_URL',
  keycloakRealm: 'KEYCLOAK_REALM',
  keycloakClientId: 'KEYCLOAK_CLIENT_ID',
  keycloakClientSecret: 'KEYCLOAK_CLIENT_SECRET',
  keycloakPublicKey: 'KEYCLOAK_PUBLIC_KEY',
  keycloakPublicKeyUrl: 'KEYCLOAK_PUBLIC_KEY_URL',
  keycloakUseSsl: 'KEYCLOAK_USE_SSL',
  keycloakTimeout: 'KEYCLOAK_TIMEOUT',
  keycloakAdminUsername: 'KEYCLOAK_ADMIN_USERNAME',
  keycloakAdminPassword: 'KEYCLOAK_ADMIN_PASSWORD',

  // Google
  googleClientId: 'GOOGLE_CLIENT_ID',
  googleClientSecret: 'GOOGLE_CLIENT_SECRET',
  googleRedirectUri: 'GOOGLE_REDIRECT_URI',
  googleProjectId: 'GOOGLE_PROJECT_ID',
  googleHd: 'GOOGLE_HD',
  googleTenantId: 'GOOGLE_TENANT_ID',
  googleName: 'GOOGLE_NAME',
  googleUseSsl: 'GOOGLE_USE_SSL',
  googleTimeout: 'GOOGLE_TIMEOUT',

  // Google Identity Platform
  googleIdentityPlatformProjectId: 'GOOGLE_CLOUD_PROJECT_ID',
  googleIdentityPlatformClientId: 'FIREBASE_CLIENT_ID',
  googleIdentityPlatformClientSecret: 'FIREBASE_CLIENT_SECRET',
  googleIdentityPlatformTenantId: 'FIREBASE_TENANT_ID',
  googleIdentityPlatformApiKey: 'FIREBASE_API_KEY',
  googleIdentityPlatformName: 'GOOGLE_IDENTITY_PLATFORM_NAME',
  googleIdentityPlatformTimeout: 'GOOGLE_IDENTITY_PLATFORM_TIMEOUT',

  // JWT
  jwtSecret: 'JWT_SECRET',
  jwtIssuer: 'JWT_ISSUER',
  jwtAudience: 'JWT_AUDIENCE',
  jwtExpiresIn: 'JWT_EXPIRES_IN',
  jwtAlgorithm: 'JWT_ALGORITHM',

  // Token storage
  tokenStorageEnabled: 'AUTH_TOKEN_STORAGE_ENABLED',
  tokenStorageRotation: 'AUTH_TOKEN_STORAGE_ROTATION',
  tokenStorageBlacklisting: 'AUTH_TOKEN_STORAGE_BLACKLISTING',
  refreshTokenExpiration: 'AUTH_REFRESH_TOKEN_EXPIRATION',
  sessionExpiration: 'AUTH_SESSION_EXPIRATION',

  // Redis key prefix
  redisKeyPrefixRefresh: 'AUTH_REDIS_KEY_PREFIX_REFRESH',
  redisKeyPrefixBlacklist: 'AUTH_REDIS_KEY_PREFIX_BLACKLIST',
  redisKeyPrefixSession: 'AUTH_REDIS_KEY_PREFIX_SESSION'
};

/**
 * Configuration resolver class
 */
export class ConfigResolver {
  constructor(
    private userConfig: InfrastructureAuthConfig = {},
    private env = process.env
  ) {}

  /**
   * Resolve a configuration value with priority: user > env > default
   *
   * @param userValue - User-provided value (highest priority)
   * @param envVarName - Environment variable name
   * @param defaultValue - Default value (lowest priority)
   * @param parser - Optional parser function for environment values
   * @returns Resolved value
   */
  private resolveValue<T>(
    userValue: T | undefined,
    envVarName: string | undefined,
    defaultValue: T,
    parser?: (envValue: string) => T
  ): T {
    if (userValue !== undefined) return userValue;
    if (envVarName && this.env[envVarName]) {
      const envValue = this.env[envVarName];
      return parser ? parser(envValue) : (envValue as unknown as T);
    }
    return defaultValue;
  }

  /**
   * Parse string to boolean
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true';
  }

  /**
   * Parse string to number
   */
  private parseNumber(value: string): number {
    return parseInt(value, 10);
  }

  /**
   * Get environment variable names (custom or default)
   */
  private getEnvVarNames(): Required<EnvironmentVariableNames> {
    return { ...DEFAULT_ENV_VAR_NAMES, ...this.userConfig.envVarNames };
  }

  /**
   * Get Keycloak configuration
   *
   * @returns Resolved Keycloak configuration
   */
  getKeycloakConfig(): ResolvedKeycloakConfig {
    const envNames = this.getEnvVarNames();
    const userKeycloak = this.userConfig.keycloak || {};

    const clientSecret = this.resolveValue(
      userKeycloak.clientSecret,
      envNames.keycloakClientSecret,
      undefined
    );
    const publicKey = this.resolveValue(
      userKeycloak.publicKey,
      envNames.keycloakPublicKey,
      undefined
    );
    const publicKeyUrl = this.resolveValue(
      userKeycloak.publicKeyUrl,
      envNames.keycloakPublicKeyUrl,
      undefined
    );
    const adminCredentials = resolveAdminCredentials(userKeycloak.adminCredentials, this.env, {
      keycloakAdminUsername: envNames.keycloakAdminUsername,
      keycloakAdminPassword: envNames.keycloakAdminPassword
    });

    return {
      authServerUrl: this.resolveValue(
        userKeycloak.authServerUrl,
        envNames.keycloakAuthServerUrl,
        DEFAULT_KEYCLOAK_CONFIG.authServerUrl
      ),
      realm: this.resolveValue(
        userKeycloak.realm,
        envNames.keycloakRealm,
        DEFAULT_KEYCLOAK_CONFIG.realm
      ),
      clientId: this.resolveValue(
        userKeycloak.clientId,
        envNames.keycloakClientId,
        DEFAULT_KEYCLOAK_CONFIG.clientId
      ),
      name: this.resolveValue(userKeycloak.name, undefined, DEFAULT_KEYCLOAK_CONFIG.name),
      useSsl: this.resolveValue(
        userKeycloak.useSsl,
        envNames.keycloakUseSsl,
        DEFAULT_KEYCLOAK_CONFIG.useSsl,
        this.parseBoolean
      ),
      timeout: this.resolveValue(
        userKeycloak.timeout,
        envNames.keycloakTimeout,
        DEFAULT_KEYCLOAK_CONFIG.timeout,
        this.parseNumber
      ),
      ...(clientSecret !== undefined && { clientSecret }),
      ...(publicKey !== undefined && { publicKey }),
      ...(publicKeyUrl !== undefined && { publicKeyUrl }),
      ...(adminCredentials !== undefined && { adminCredentials })
    };
  }

  /**
   * Get Google configuration
   *
   * @returns Resolved Google OAuth configuration
   */
  getGoogleConfig(): ResolvedGoogleConfig {
    const envNames = this.getEnvVarNames();
    const userGoogle = this.userConfig.google || {};

    const clientSecret = this.resolveValue(
      userGoogle.clientSecret,
      envNames.googleClientSecret,
      undefined
    );
    const projectId = this.resolveValue(userGoogle.projectId, envNames.googleProjectId, undefined);
    const hd = this.resolveValue(userGoogle.hd, envNames.googleHd, undefined);
    const tenantId = this.resolveValue(userGoogle.tenantId, envNames.googleTenantId, undefined);

    return {
      clientId: this.resolveValue(
        userGoogle.clientId,
        envNames.googleClientId,
        DEFAULT_GOOGLE_CONFIG.clientId
      ),
      redirectUri: this.resolveValue(
        userGoogle.redirectUri,
        envNames.googleRedirectUri,
        DEFAULT_GOOGLE_CONFIG.redirectUri
      ),
      name: this.resolveValue(userGoogle.name, envNames.googleName, DEFAULT_GOOGLE_CONFIG.name),
      useSsl: this.resolveValue(
        userGoogle.useSsl,
        envNames.googleUseSsl,
        DEFAULT_GOOGLE_CONFIG.useSsl,
        this.parseBoolean
      ),
      timeout: this.resolveValue(
        userGoogle.timeout,
        envNames.googleTimeout,
        DEFAULT_GOOGLE_CONFIG.timeout,
        this.parseNumber
      ),
      ...(clientSecret !== undefined && { clientSecret }),
      ...(projectId !== undefined && { projectId }),
      ...(hd !== undefined && { hd }),
      ...(tenantId !== undefined && { tenantId })
    };
  }

  /**
   * Get Google Identity Platform configuration
   *
   * @returns Resolved Google Identity Platform configuration
   */
  getGoogleIdentityPlatformConfig(): ResolvedGoogleIdentityPlatformConfig {
    const envNames = this.getEnvVarNames();
    const userGIP = this.userConfig.googleIdentityPlatform || {};

    // For projectId, check both GOOGLE_CLOUD_PROJECT_ID and FIREBASE_PROJECT_ID
    const projectId =
      this.resolveValue(userGIP.projectId, undefined, undefined) ||
      this.resolveValue(undefined, 'GOOGLE_CLOUD_PROJECT_ID', undefined) ||
      this.resolveValue(undefined, 'FIREBASE_PROJECT_ID', undefined);
    const clientId = this.resolveValue(
      userGIP.clientId,
      envNames.googleIdentityPlatformClientId,
      undefined
    );
    const clientSecret = this.resolveValue(
      userGIP.clientSecret,
      envNames.googleIdentityPlatformClientSecret,
      undefined
    );
    const tenantId = this.resolveValue(
      userGIP.tenantId,
      envNames.googleIdentityPlatformTenantId,
      undefined
    );
    const apiKey = this.resolveValue(
      userGIP.apiKey,
      envNames.googleIdentityPlatformApiKey,
      undefined
    );
    const serviceAccount = userGIP.serviceAccount; // Service account should be provided via user config for security

    return {
      name: this.resolveValue(
        userGIP.name,
        envNames.googleIdentityPlatformName,
        DEFAULT_GOOGLE_IDENTITY_PLATFORM_CONFIG.name
      ),
      timeout: this.resolveValue(
        userGIP.timeout,
        envNames.googleIdentityPlatformTimeout,
        DEFAULT_GOOGLE_IDENTITY_PLATFORM_CONFIG.timeout,
        this.parseNumber
      ),
      ...(projectId !== undefined && { projectId }),
      ...(clientId !== undefined && { clientId }),
      ...(clientSecret !== undefined && { clientSecret }),
      ...(tenantId !== undefined && { tenantId }),
      ...(apiKey !== undefined && { apiKey }),
      ...(serviceAccount !== undefined && { serviceAccount })
    };
  }

  /**
   * Get JWT configuration
   *
   * @returns Resolved JWT configuration
   */
  getJwtConfig(): ResolvedJwtConfig {
    const envNames = this.getEnvVarNames();
    const userJwt = this.userConfig.jwt || {};

    const secret = this.resolveValue(userJwt.secret, envNames.jwtSecret, DEFAULT_JWT_CONFIG.secret);

    return {
      issuer: this.resolveValue(userJwt.issuer, envNames.jwtIssuer, DEFAULT_JWT_CONFIG.issuer),
      audience: this.resolveValue(
        userJwt.audience,
        envNames.jwtAudience,
        DEFAULT_JWT_CONFIG.audience
      ),
      expiresIn: this.resolveValue(
        userJwt.expiresIn,
        envNames.jwtExpiresIn,
        DEFAULT_JWT_CONFIG.expiresIn,
        this.parseNumber
      ),
      algorithm: this.resolveValue(
        userJwt.algorithm,
        envNames.jwtAlgorithm,
        DEFAULT_JWT_CONFIG.algorithm
      ),
      ...(secret !== undefined && { secret })
    };
  }

  /**
   * Get token storage configuration
   *
   * @returns Token storage configuration
   */
  getTokenStorageConfig(): Required<TokenStorageConfig> {
    const envNames = this.getEnvVarNames();
    const userTokenStorage = this.userConfig.tokenStorage || {};

    return {
      enabled: this.resolveValue(
        userTokenStorage.enabled,
        envNames.tokenStorageEnabled,
        DEFAULT_TOKEN_STORAGE_CONFIG.enabled,
        this.parseBoolean
      ),
      enableRotation: this.resolveValue(
        userTokenStorage.enableRotation,
        envNames.tokenStorageRotation,
        DEFAULT_TOKEN_STORAGE_CONFIG.enableRotation,
        this.parseBoolean
      ),
      enableBlacklisting: this.resolveValue(
        userTokenStorage.enableBlacklisting,
        envNames.tokenStorageBlacklisting,
        DEFAULT_TOKEN_STORAGE_CONFIG.enableBlacklisting,
        this.parseBoolean
      ),
      refreshTokenExpiration: this.resolveValue(
        userTokenStorage.refreshTokenExpiration,
        envNames.refreshTokenExpiration,
        DEFAULT_TOKEN_STORAGE_CONFIG.refreshTokenExpiration,
        this.parseNumber
      ),
      sessionExpiration: this.resolveValue(
        userTokenStorage.sessionExpiration,
        envNames.sessionExpiration,
        DEFAULT_TOKEN_STORAGE_CONFIG.sessionExpiration,
        this.parseNumber
      )
    };
  }

  /**
   * Get Redis key prefix configuration
   *
   * @returns Redis key prefix configuration
   */
  getRedisKeyPrefixConfig(): Required<RedisKeyPrefixConfig> {
    const envNames = this.getEnvVarNames();
    const userRedisKeyPrefix = this.userConfig.redisKeyPrefix || {};

    return {
      refreshToken: this.resolveValue(
        userRedisKeyPrefix.refreshToken,
        envNames.redisKeyPrefixRefresh,
        DEFAULT_REDIS_KEY_PREFIX_CONFIG.refreshToken
      ),
      blacklist: this.resolveValue(
        userRedisKeyPrefix.blacklist,
        envNames.redisKeyPrefixBlacklist,
        DEFAULT_REDIS_KEY_PREFIX_CONFIG.blacklist
      ),
      session: this.resolveValue(
        userRedisKeyPrefix.session,
        envNames.redisKeyPrefixSession,
        DEFAULT_REDIS_KEY_PREFIX_CONFIG.session
      )
    };
  }

  /**
   * Resolve complete configuration
   *
   * @returns Resolved configuration with all defaults applied
   */
  resolve(): ResolvedInfrastructureAuthConfig {
    // Call all getter methods directly to build the config
    // Note: These methods must not call resolve() to avoid circular dependency
    return {
      keycloak: this.getKeycloakConfig(),
      google: this.getGoogleConfig(),
      googleIdentityPlatform: this.getGoogleIdentityPlatformConfig(),
      jwt: this.getJwtConfig(),
      tokenStorage: this.getTokenStorageConfig(),
      redisKeyPrefix: this.getRedisKeyPrefixConfig()
    };
  }
}

/**
 * Resolve configuration from user config and environment
 *
 * @param userConfig - User-provided configuration
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved configuration
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 *
 * const config = resolveConfig({
 *   keycloak: {
 *     authServerUrl: 'http://localhost:8080',
 *     realm: 'my-realm',
 *     clientId: 'my-client',
 *   },
 *   jwt: {
 *     secret: 'my-secret',
 *     algorithm: 'HS256',
 *   },
 * });
 * ```
 */
export function resolveConfig(
  userConfig: InfrastructureAuthConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedInfrastructureAuthConfig {
  const resolver = new ConfigResolver(userConfig, env);
  return resolver.resolve();
}
