/**
 * User-related types
 */

/**
 * User credentials
 */
export interface UserCredentials {
  /** Username or email */
  username: string;
  /** Password */
  password: string;
  /** Tenant ID */
  tenantId?: string;
}

/**
 * User role assignment
 */
export interface UserRole {
  /** Role name */
  role: string;
  /** Tenant ID */
  tenantId: string;
  /** Assigned at */
  assignedAt?: Date;
  /** Expires at */
  expiresAt?: Date;
}

/**
 * User permission
 */
export interface UserPermission {
  /** Permission name */
  permission: string;
  /** Resource */
  resource?: string;
  /** Action */
  action?: string;
  /** Tenant ID */
  tenantId: string;
}

/**
 * User context for auth operations
 */
export interface UserContext {
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Username */
  username?: string;
  /** Email */
  email?: string;
  /** User roles */
  roles?: string[];
  /** User permissions */
  permissions?: string[];
}
