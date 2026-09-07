/**
 * User Fixture
 *
 * Provides test data factories for E2E tests.
 * Uses the NestJS application's database connection to ensure
 * fixture data is visible to the running server.
 *
 * @packageDocumentation
 */

import { MAIN_DB } from '../../src/common/database/database.constants';
import { UserRepository } from '../../src/modules/users/repositories/user.repository';

import type { INestApplication } from '@nestjs/common';
import type { User } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface CreateUserFixtureOptions {
  organizationId: number;
  emailHash?: string;
}

/**
 * Available user roles for tenant assignments
 */
export const enum UserRole {
  OWNER = 'tenant_owner',
  ADMIN = 'tenant_admin',
  USER = 'tenant_user',
  VIEWER = 'tenant_viewer'
}

export interface CreateUserWithTenantFixtureOptions {
  tenantId: number;
  organizationId: number;
  role?: UserRole;
  isDefault?: boolean;
  emailHash?: string;
}

/**
 * Creates a test user with user tenant record using the UserRepository and the NestJS app's database.
 * This ensures fixture data is visible to the running server via the same connection pool.
 *
 * This function creates both the user record AND the user tenant record with the specified role.
 *
 * @param app - The NestJS application instance
 * @param options - Fixture options with tenantId, organizationId, role, isDefault, and optional emailHash
 * @returns The created user
 *
 * @example
 * ```ts
 * import { createUserWithTenantFixture } from './fixtures/user.fixture';
 *
 * const user = await createUserWithTenantFixture(server.app, {
 *   tenantId: 1,
 *   organizationId: 1,
 *   role: 'tenant_user',
 *   isDefault: false,
 * });
 * ```
 */
export async function createUserWithTenantFixture(
  app: INestApplication,
  options: CreateUserWithTenantFixtureOptions
): Promise<User> {
  // Get the Drizzle db instance from the NestJS app
  const db = app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
  const repository = new UserRepository(db);

  // Create user using repository
  const user = await repository.createWithOrg({
    organizationId: options.organizationId,
    emailHash: options.emailHash
  });

  // Import createTestUserTenant to create user tenant record
  const { createTestUserTenant } = await import('../helpers/database');

  // Create user tenant record with role
  await createTestUserTenant(
    app,
    user.id,
    options.tenantId,
    options.role ?? UserRole.USER,
    options.isDefault ?? false
  );

  return user;
}

/**
 * Creates a test user using the UserRepository and the NestJS app's database.
 * This ensures fixture data is visible to the running server via the same connection pool.
 *
 * FIX: Uses the Drizzle db instance directly (not raw pg.Pool) to ensure consistent
 * connection pool state with HTTP requests. The UserRepository.createWithOrg() method
 * properly handles inserts through Drizzle, which shares the same connection pool.
 *
 * @param app - The NestJS application instance
 * @param options - Fixture options with organizationId and optional emailHash
 * @returns The created user
 *
 * @example
 * ```ts
 * import { createUserFixture } from './fixtures/user.fixture';
 *
 * const user = await createUserFixture(server.app, { organizationId: tenantId });
 * ```
 */
export async function createUserFixture(
  app: INestApplication,
  options: CreateUserFixtureOptions
): Promise<User> {
  // Get the Drizzle db instance from the NestJS app
  const db = app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
  const repository = new UserRepository(db);

  // Create user using repository - this uses Drizzle ORM which shares the same
  // connection pool as HTTP requests, ensuring immediate visibility
  const user = await repository.createWithOrg({
    organizationId: options.organizationId,
    emailHash: options.emailHash
  });

  return user;
}

/**
 * Legacy version that accepts a database instance directly.
 * Use the app-based version for E2E tests to ensure data visibility.
 *
 * NOTE: This version uses the repository pattern with the provided db instance.
 * Prefer the app-based version for E2E tests to ensure connection pool consistency.
 */
export async function createUserFixtureWithDb(
  db: NodePgDatabase<Record<string, never>>,
  options: CreateUserFixtureOptions
): Promise<User> {
  const repository = new UserRepository(db);
  return repository.createWithOrg({
    organizationId: options.organizationId,
    emailHash: options.emailHash
  });
}

/**
 * Deletes a test user using the UserRepository and the NestJS app's database.
 *
 * @param app - The NestJS application instance
 * @param organizationId - Organization ID (not tenant ID)
 * @param userId - User ID to delete
 *
 * @example
 * ```ts
 * import { deleteUserFixture } from './fixtures/user.fixture';
 *
 * await deleteUserFixture(server.app, organizationId, userId);
 * ```
 */
export async function deleteUserFixture(
  app: INestApplication,
  organizationId: number,
  userId: number
): Promise<void> {
  const db = app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
  const repository = new UserRepository(db);
  await repository.delete(organizationId, userId);
}

/**
 * Legacy version that accepts a database instance directly.
 */
export async function deleteUserFixtureWithDb(
  db: NodePgDatabase<Record<string, never>>,
  organizationId: number,
  userId: number
): Promise<void> {
  const repository = new UserRepository(db);
  await repository.delete(organizationId, userId);
}

/**
 * Creates multiple test users in a single tenant using the NestJS app's database.
 *
 * @param app - The NestJS application instance
 * @param organizationId - Organization ID
 * @param count - Number of users to create (default: 3)
 * @returns Array of created users
 *
 * @example
 * ```ts
 * import { createMultipleUsersFixture } from './fixtures/user.fixture';
 *
 * const users = await createMultipleUsersFixture(server.app, tenantId, 10);
 * ```
 */
export async function createMultipleUsersFixture(
  app: INestApplication,
  organizationId: number,
  count: number = 3
): Promise<User[]> {
  const users: User[] = [];

  for (let i = 0; i < count; i++) {
    const user = await createUserFixture(app, { organizationId });
    users.push(user);
  }

  return users;
}

/**
 * Legacy version that accepts a database instance directly.
 */
export async function createMultipleUsersFixtureWithDb(
  db: NodePgDatabase<Record<string, never>>,
  organizationId: number,
  count: number = 3
): Promise<User[]> {
  const users: User[] = [];

  for (let i = 0; i < count; i++) {
    const user = await createUserFixtureWithDb(db, { organizationId });
    users.push(user);
  }

  return users;
}
