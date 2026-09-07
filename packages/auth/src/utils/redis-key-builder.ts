/**
 * Redis Key Builder
 *
 * Utility for building namespaced Redis keys with proper tenant isolation.
 *
 * @packageDocumentation
 */

/**
 * Redis key types
 */
export const enum RedisKeyType {
  /** Refresh token storage */
  REFRESH_TOKEN = 'refresh',
  /** Refresh token by token ID lookup */
  REFRESH_TOKEN_TOKEN_ID = 'refresh-token-id',
  /** Access token blacklist */
  ACCESS_TOKEN_BLACKLIST = 'blacklist-access',
  /** Session storage */
  SESSION = 'session',
  /** Token usage tracking (replay prevention) */
  TOKEN_USAGE = 'token-usage',
  /** Admin token cache (Keycloak) */
  ADMIN_TOKEN = 'admin-token',
  /** Authorization detection cache (Keycloak) */
  AUTHZ_ENABLED = 'authz-enabled',
  /** Permission cache */
  PERMISSION = 'permission',
  /** Role cache */
  ROLE = 'role'
}

/**
 * Redis Key Builder
 *
 * Builds Redis keys with proper namespace and tenant isolation.
 *
 * @example
 * ```typescript
 * // Build a refresh token key
 * const key = RedisKeyBuilder.build(
 *   RedisKeyType.REFRESH_TOKEN,
 *   'tenant-123',
 *   'token-abc'
 * );
 * // Result: 'node-monorepo-boilerplate:auth:refresh:tenant-123:token-abc'
 *
 * // Build a permission cache key
 * const permKey = RedisKeyBuilder.build(
 *   RedisKeyType.PERMISSION,
 *   'tenant-123',
 *   'user-456'
 * );
 * // Result: 'node-monorepo-boilerplate:auth:permission:tenant-123:user-456'
 * ```
 */
export class RedisKeyBuilder {
  /**
   * Application namespace prefix from environment
   */
  private static readonly NAMESPACE =
    process.env['REDIS_KEY_PREFIX'] || process.env['APP_NAME'] || 'node-monorepo-boilerplate';

  /**
   * Auth component prefix
   */
  private static readonly COMPONENT = 'auth';

  /**
   * Build a Redis key with namespace and parts
   *
   * @param type - The type of key (determines the key type segment)
   * @param parts - Additional key parts (e.g., tenantId, tokenId, userId)
   * @returns Fully qualified Redis key
   */
  static build(type: RedisKeyType, ...parts: string[]): string {
    return [this.NAMESPACE, this.COMPONENT, type, ...parts].join(':');
  }

  /**
   * Build a refresh token key
   *
   * @param tenantId - Tenant ID
   * @param tokenId - Token ID (jti)
   * @returns Refresh token Redis key
   */
  static refresh_token(tenantId: string, tokenId: string): string {
    return this.build(RedisKeyType.REFRESH_TOKEN, tenantId, tokenId);
  }

  /**
   * Build a refresh token lookup key by token ID
   *
   * @param tokenId - Token ID (jti)
   * @returns Refresh token ID lookup key
   */
  static refresh_token_id(tokenId: string): string {
    return this.build(RedisKeyType.REFRESH_TOKEN_TOKEN_ID, tokenId);
  }

  /**
   * Build an access token blacklist key
   *
   * @param tenantId - Tenant ID
   * @param tokenId - Token ID (jti)
   * @returns Access token blacklist key
   */
  static access_token_blacklist(tenantId: string, tokenId: string): string {
    return this.build(RedisKeyType.ACCESS_TOKEN_BLACKLIST, tenantId, tokenId);
  }

  /**
   * Build a session key
   *
   * @param tenantId - Tenant ID
   * @param sessionId - Session ID
   * @returns Session Redis key
   */
  static session(tenantId: string, sessionId: string): string {
    return this.build(RedisKeyType.SESSION, tenantId, sessionId);
  }

  /**
   * Build a token usage tracking key (for replay prevention)
   *
   * @param tenantId - Tenant ID
   * @param tokenId - Token ID (jti)
   * @returns Token usage tracking key
   */
  static token_usage(tenantId: string, tokenId: string): string {
    return this.build(RedisKeyType.TOKEN_USAGE, tenantId, tokenId);
  }

  /**
   * Build an admin token cache key (Keycloak)
   *
   * @param realm - Keycloak realm
   * @returns Admin token cache key
   */
  static admin_token(realm: string): string {
    return this.build(RedisKeyType.ADMIN_TOKEN, realm);
  }

  /**
   * Build an authorization detection cache key (Keycloak)
   *
   * @param realm - Keycloak realm
   * @param tenantId - Tenant ID
   * @returns Authorization detection cache key
   */
  static authz_enabled(realm: string, tenantId: string): string {
    return this.build(RedisKeyType.AUTHZ_ENABLED, realm, tenantId);
  }

  /**
   * Build a permission cache key
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @returns Permission cache key
   */
  static permission(tenantId: string, userId: string): string {
    return this.build(RedisKeyType.PERMISSION, tenantId, userId);
  }

  /**
   * Build a role cache key
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @returns Role cache key
   */
  static role(tenantId: string, userId: string): string {
    return this.build(RedisKeyType.ROLE, tenantId, userId);
  }

  /**
   * Get the current namespace prefix
   *
   * @returns Current namespace
   */
  static getNamespace(): string {
    return this.NAMESPACE;
  }
}

/**
 * Legacy Redis key prefixes (deprecated)
 *
 * @deprecated Use RedisKeyBuilder instead for proper namespacing
 */
export const LegacyRedisKeyPrefix = {
  REFRESH_TOKEN: 'auth:refresh',
  REFRESH_TOKEN_TOKEN_ID: 'auth:refresh:token-id',
  ACCESS_TOKEN_BLACKLIST: 'auth:blacklist:access',
  SESSION: 'auth:session'
} as const;
