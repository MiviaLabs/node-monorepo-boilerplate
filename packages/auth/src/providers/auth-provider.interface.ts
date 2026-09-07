/**
 * Auth Provider Interface
 *
 * Defines the contract for all auth provider implementations (Keycloak, AWS Cognito, etc.)
 */

import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo,
  RequestContext
} from '../types/auth.types';
import type { UserCredentials } from '../types/user.types';

/**
 * Auth provider interface
 *
 * All auth providers (Keycloak, AWS Cognito, Google, Azure AD) must implement this interface
 */
export interface IAuthProvider {
  /**
   * Provider name identifier
   */
  readonly name: string;

  /**
   * Provider type (keycloak, aws-cognito, google, azure-ad)
   */
  readonly type: string;

  /**
   * Authenticate user with credentials
   *
   * @param credentials - User credentials (username, password, tenantId)
   * @returns Authentication result with tokens
   */
  authenticate(credentials: UserCredentials): Promise<AuthResult>;

  /**
   * Validate an access token
   *
   * @param token - JWT access token
   * @param requestContext - Optional request context for replay attack prevention
   * @returns Token validation result
   */
  validateToken(token: string, requestContext?: RequestContext): Promise<TokenValidationResult>;

  /**
   * Refresh an access token using a refresh token
   *
   * @param refreshToken - Refresh token
   * @returns Token refresh result with new tokens
   */
  refreshToken(refreshToken: string): Promise<TokenRefreshResult>;

  /**
   * Logout user and invalidate tokens
   *
   * @param refreshToken - Refresh token to revoke
   * @param accessToken - Access token to blacklist (optional)
   */
  logout(refreshToken: string, accessToken?: string): Promise<void>;

  /**
   * Get user information by user ID
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns User information
   */
  getUserInfo(userId: string, tenantId: string): Promise<UserInfo>;

  /**
   * Get user information from access token
   *
   * @param token - Access token
   * @returns User information
   */
  getUserInfoFromToken(token: string): Promise<UserInfo>;

  /**
   * Get user roles
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Array of role names
   */
  getRoles(userId: string, tenantId: string): Promise<string[]>;

  /**
   * Get user roles from token
   *
   * @param token - Access token
   * @returns Array of role names
   */
  getRolesFromToken(token: string): Promise<string[]>;

  /**
   * Get user permissions
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Array of permission names
   */
  getPermissions(userId: string, tenantId: string): Promise<string[]>;

  /**
   * Get user permissions from token
   *
   * @param token - Access token
   * @returns Array of permission names
   */
  getPermissionsFromToken(token: string): Promise<string[]>;

  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Health check for the provider
   */
  healthCheck(): Promise<boolean>;

  /**
   * Delete a user from the authentication provider
   *
   * @param userId - User ID to delete
   * @param tenantId - Optional tenant ID for multi-tenant providers
   * @returns Promise that resolves when user is deleted
   */
  deleteUser(userId: string, tenantId?: string): Promise<void>;

  /**
   * Delete all users in a tenant (bulk deletion)
   *
   * @param tenantId - Tenant ID
   * @returns Promise that resolves when all users are deleted
   */
  deleteTenantUsers(tenantId: string): Promise<void>;

  /**
   * Change a user's password in the authentication provider
   *
   * Optional because not all providers support local password auth.
   *
   * @param userId - Provider user ID
   * @param newPassword - New password value
   * @param tenantId - Optional tenant ID for multi-tenant providers
   */
  changePassword?(userId: string, newPassword: string, tenantId?: string): Promise<void>;
}

/**
 * Base auth provider options
 */
export interface BaseAuthProviderOptions {
  /** Provider name (defaults to type) */
  name?: string;
  /** Base URL for the auth server */
  authServerUrl: string;
  /** Realm name (for Keycloak) or equivalent */
  realm: string;
  /** Client ID */
  clientId: string;
  /** Client secret (for confidential clients) */
  clientSecret?: string;
  /** Whether to use SSL/TLS */
  useSsl?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}
