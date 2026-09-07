/**
 * Auth Module Types
 *
 * Type definitions for authentication operations
 */

/**
 * User information returned from authentication
 */
export interface UserInfo {
  userId: string;
  username?: string;
  email?: string;
  name?: string;
  displayName?: string;
  emailVerified?: boolean;
  roles?: string[];
  permissions?: string[];
  tenantId?: string;
  photoUrl?: string | null;
  avatarFileId?: number | null;
  attributes?: Record<string, unknown>;
}

/**
 * Authentication result from providers
 */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

/**
 * Authentication request for email/password
 */
export interface EmailPasswordAuthRequest {
  email: string;
  password: string;
  tenantId: string;
}

/**
 * Authentication request for OAuth providers
 */
export interface OAuthAuthRequest {
  provider: string;
  idToken: string;
  accessToken?: string;
  tenantId: string;
}

/**
 * Authentication request for phone auth
 */
export interface PhoneAuthRequest {
  phoneNumber: string;
  verificationCode: string;
  tenantId: string;
}

/**
 * Registration request
 */
export interface RegisterRequest {
  email: string;
  password: string;
  tenantId: string;
  displayName?: string;
}

/**
 * Link identity request
 */
export interface LinkIdentityRequest {
  userId: number;
  tenantId: string;
  provider: string;
  providerUid: string;
  idToken?: string;
  accessToken?: string;
  displayName?: string;
  photoUrl?: string;
}

/**
 * Unlink identity request
 */
export interface UnlinkIdentityRequest {
  userId: number;
  tenantId: string;
  provider: string;
  providerUid: string;
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  refreshToken: string;
  tenantId: string;
}

/**
 * Logout request
 */
export interface LogoutRequest {
  userId: number;
  tenantId: string;
  refreshToken: string;
  accessToken?: string;
}

/**
 * Authentication response with user info
 */
export interface AuthResponse extends AuthResult {
  user: UserInfo;
  isNewUser: boolean;
}

/**
 * Session information
 */
export interface Session {
  id: string;
  userId: number;
  tenantId: string;
  tokenId: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
  active: boolean;
}

/**
 * Token pair
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

/**
 * Provider-specific profile data
 */
export interface ProviderProfile {
  provider: string;
  providerUid: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string;
  photoUrl?: string;
}
