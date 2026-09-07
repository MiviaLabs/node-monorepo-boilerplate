/**
 * Domain types for User entity
 */

/**
 * Unique identifier for a user
 */
export type UserId = string;

/**
 * User roles in the system
 */
export const UserRole = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
} as const;

/** User role type */
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * User account status
 */
export const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  DELETED: 'deleted'
} as const;

/** User status type */
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * User entity interface
 */
export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly name?: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input for creating a new user
 */
export interface CreateUserInput {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
  readonly role?: UserRole;
}

/**
 * Input for updating a user
 */
export interface UpdateUserInput {
  readonly email?: string;
  readonly name?: string;
  readonly role?: UserRole;
  readonly status?: UserStatus;
}
