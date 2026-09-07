/**
 * JWT payload types
 */

/**
 * JWT payload with tenant and actor information
 */
export interface JwtPayload {
  /** Subject (Firebase UID) */
  sub: string;
  /** Database user ID (from custom claims) */
  db_user_id?: string;
  /** Username */
  username?: string;
  /** User's display name */
  name?: string;
  /** Email */
  email?: string;
  /** Tenant ID */
  tenant_id: string;
  /** Actor ID (user performing the action) */
  actor_id?: string;
  /** User roles */
  roles?: string[];
  /** User permissions */
  permissions?: string[];
  /** Token issuer */
  iss?: string;
  /** Token audience */
  aud?: string | string[];
  /** Token expiration time */
  exp?: number;
  /** Token issued at time */
  iat?: number;
  /** Token ID (for revocation) */
  jti?: string;
  /** Token type */
  typ?: string;
}

/**
 * JWT validation options
 */
export interface JwtValidateOptions {
  /** Whether to verify token expiration */
  ignoreExpiration?: boolean;
  /** Whether to verify token issuer */
  ignoreNotBefore?: boolean;
  /** Allowed token issuers */
  issuers?: string[];
  /** Required audience */
  audience?: string;
}

/**
 * JWT token pair
 */
export interface JwtTokenPair {
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken: string;
  /** Access token expiration (seconds) */
  expiresIn: number;
  /** Refresh token expiration (seconds) */
  refreshExpiresIn: number;
}
