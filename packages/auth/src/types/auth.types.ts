/**
 * Authentication types
 */

/**
 * Authentication result
 */
export interface AuthResult {
  /** Access token */
  accessToken: string;
  /** Refresh token */
  refreshToken: string;
  /** ID token */
  idToken: string;
  /** Token expiration time (seconds) */
  expiresIn: number;
  /** Refresh token expiration time (seconds) */
  refreshExpiresIn: number;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** User ID if valid */
  userId?: string;
  /** Tenant ID if valid */
  tenantId?: string;
  /** Error message if invalid */
  error?: string;
  /** Expiration time */
  exp?: number;
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  /** New access token */
  accessToken: string;
  /** New refresh token (if rotated) */
  refreshToken?: string;
  /** New ID token */
  idToken: string;
  /** Token expiration time (seconds) */
  expiresIn: number;
  /** Whether the refresh token was rotated */
  rotated: boolean;
  /** Refresh token expiration time (seconds) */
  refreshExpiresIn?: number;
}

/**
 * User information
 */
export interface UserInfo {
  /** User ID */
  userId: string;
  /** Username */
  username: string;
  /** Email address */
  email: string;
  /** First name */
  givenName?: string;
  /** Last name */
  familyName?: string;
  /** Full name */
  name?: string;
  /** Email verification status */
  emailVerified?: boolean;
  /** User roles */
  roles: string[];
  /** User permissions */
  permissions: string[];
  /** Tenant ID */
  tenantId: string;
  /** Additional attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Session information
 */
export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Token ID (jti) */
  tokenId: string;
  /** Session creation time */
  createdAt: Date;
  /** Session expiration time */
  expiresAt: Date;
  /** Last activity time */
  lastActivity: Date;
  /** Whether the session is active */
  active: boolean;
}

/**
 * Refresh token info
 */
export interface RefreshTokenInfo {
  /** Token ID (jti) */
  tokenId: string;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Session ID */
  sessionId: string;
  /** Expiration time */
  expiresAt: Date;
  /** Whether the token is revoked */
  revoked: boolean;
}

/**
 * Request context for token validation
 *
 * Used for token replay attack prevention by binding tokens to specific request contexts
 */
export interface RequestContext {
  /** Client IP address */
  ip?: string;
  /** User agent string */
  userAgent?: string;
  /** Session ID (optional, for enhanced security) */
  sessionId?: string;
  /** Client ID (optional, for multi-client scenarios) */
  clientId?: string;
}

/**
 * Token binding claims
 *
 * These claims are added to tokens to prevent confused deputy attacks
 * by binding tokens to the specific client/session that requested them.
 */
export interface TokenBinding {
  /** Client ID that requested the token */
  client_id: string;
  /** Session ID for this authentication session */
  session_id: string;
  /** Device fingerprint (hash of user-agent + IP) */
  device_fp?: string;
}

/**
 * Token usage tracking information
 *
 * Tracks the first time a token was used to detect replay attacks
 */
export interface TokenUsage {
  /** Token ID (jti) */
  tokenId: string;
  /** Tenant ID */
  tenantId: string;
  /** User ID */
  userId: string;
  /** IP address of first use */
  ip: string | null;
  /** User agent of first use */
  userAgent: string | null;
  /** Timestamp of first use */
  firstUsedAt: number;
  /** Number of times this token has been used */
  useCount: number;
  /** Last use timestamp */
  lastUsedAt: number;
}

/**
 * Security alert type
 */
export const enum SecurityAlertType {
  TOKEN_REPLAY = 'token_replay',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  TOKEN_THEFT = 'token_theft'
}

/**
 * Security alert severity level
 */
export const enum SecurityAlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security alert data for replay attack detection
 */
export interface SecurityAlert {
  /** Alert type */
  type: SecurityAlertType;
  /** Severity level */
  severity: SecurityAlertSeverity;
  /** Tenant ID */
  tenantId: string;
  /** User ID */
  userId: string;
  /** Token ID */
  tokenId: string;
  /** Alert message */
  message: string;
  /** Original usage context */
  originalContext: {
    ip: string | null;
    userAgent: string | null;
    firstUsedAt: number;
  };
  /** Current context that triggered the alert */
  currentContext: {
    ip: string | null;
    userAgent: string | null;
    timestamp: number;
  };
  /** Alert timestamp */
  timestamp: number;
}
