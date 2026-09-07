/**
 * E2E Test Database Helper
 *
 * Provides utilities for database setup and cleanup in E2E tests.
 * Wraps existing @package/test-utils infrastructure.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { tenants, organizations, users, userTenants } from '@package/db-core';
import { eq } from 'drizzle-orm';

import { MAIN_DB } from '../../src/common/database/database.constants';

import type { TestServer } from './bootstrap';
import type { INestApplication } from '@nestjs/common';
import type { ITestDatabase } from '@package/test-utils';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type ServerOrApp = TestServer | INestApplication | undefined | null;

export const TEST_USER_ENCRYPTION_KEY_VERSION = 'primary-encryption-key/cryptoKeyVersions/1';

function getApp(serverOrApp: ServerOrApp): INestApplication | undefined {
  if (!serverOrApp) {
    return undefined;
  }
  if ('app' in serverOrApp) {
    return serverOrApp.app;
  }
  return serverOrApp;
}

/**
 * Get global test database connection URLs from connection file.
 * Returns null if the file doesn't exist or no usable URLs are present.
 * Supports both legacy single-DB and multi-DB formats.
 *
 * Checks multiple locations for the connection file:
 * 1. Current working directory (when running from monorepo root)
 * 2. apps/api directory (when daemon is started from apps/api)
 *
 * @returns Object with optional `main` and `events` URLs, or null
 */
function getGlobalITestDatabaseUrls(): { main?: string; events?: string } | null {
  // Try current working directory first (for when running from root)
  const cwdFile = resolve(process.cwd(), '.test-db-connection.json');
  // Try apps/api directory (daemon is started from there)
  const apiFile = resolve(process.cwd(), 'apps/api/.test-db-connection.json');
  // Also try relative path if we're in a subdirectory
  const parentFile = resolve(process.cwd(), '../.test-db-connection.json');

  const possibleFiles = [cwdFile, apiFile, parentFile];

  for (const connectionFile of possibleFiles) {
    if (!existsSync(connectionFile)) {
      continue;
    }

    try {
      const data = JSON.parse(readFileSync(connectionFile, 'utf-8')) as ConnectionData;

      // New format: multiple databases
      if (data.databases) {
        const urls: { main?: string; events?: string } = {};
        if (data.databases.main?.connectionUrl) {
          urls.main = data.databases.main.connectionUrl;
        }
        if (data.databases.events?.connectionUrl) {
          urls.events = data.databases.events.connectionUrl;
        }
        if (Object.keys(urls).length > 0) {
          return urls;
        }
      }

      // Legacy format: single database
      if (data.connectionUrl) {
        return { main: data.connectionUrl, events: data.connectionUrl };
      }
    } catch {
      // Try next file
      continue;
    }
  }

  return null;
}

function normalizeGlobalTestDatabaseUrls(urls: {
  main?: string;
  events?: string;
}): { main?: string; events?: string } | null {
  if (!urls.main) {
    return null;
  }

  if (urls.events && urls.events !== urls.main) {
    console.warn(
      '[E2E] Global test DB advertised a separate events database. ' +
        'Normalizing EVENTS_DATABASE_URL to DATABASE_URL because transactional outbox ' +
        'tests require both schemas on the same Postgres database.'
    );
  }

  return {
    main: urls.main,
    events: urls.main
  };
}

/**
 * Set required environment variables for E2E tests.
 */
function setRequiredEnvVars(): void {
  const requiredEnvVars = {
    // API Versioning
    API_VERSIONS: 'v1:1.0.0:active',
    API_DEFAULT_VERSION: 'v1',
    API_DEPRECATION_WARNING_DAYS: '365',
    API_VERSIONING_ENABLED: 'true',

    // Swagger
    SWAGGER_ENABLED: 'true',
    SWAGGER_PATH: 'api/docs',
    SWAGGER_TITLE: 'Platform Service REST API',
    SWAGGER_DESCRIPTION:
      'Interactive OpenAPI specification and developer reference for Platform Services',
    SWAGGER_VERSION: '1.0.0',
    SWAGGER_TAG: 'Core Platform',

    // CORS
    CORS_ENABLED: 'true',
    CORS_ORIGIN: '*',

    // I18n
    API_DEFAULT_LANGUAGE: 'en',
    API_AVAILABLE_LANGUAGES: 'en,ar-SA',

    // Node
    NODE_ENV: 'test'
  };

  // Set environment variables only if not already set
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    process.env[key] = value;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Setup E2E test database for Jest.
 * Auto-detects CI vs local, starts Testcontainers if needed.
 *
 * This is the main entry point for E2E test database setup.
 */
export async function setupE2ETestDatabaseJest(): Promise<void> {
  // Check if global database is available
  const globalUrls = normalizeGlobalTestDatabaseUrls(getGlobalITestDatabaseUrls() ?? {});

  if (globalUrls?.main) {
    // Use global database - set environment variables
    process.env['DATABASE_URL'] = globalUrls.main;
    process.env['EVENTS_DATABASE_URL'] = globalUrls.events ?? globalUrls.main;
    setRequiredEnvVars();
    return;
  }

  // Start local Testcontainers
  const { setupTestDatabaseJest } = await import('@package/test-utils');
  await setupTestDatabaseJest();
  setRequiredEnvVars();
}

/**
 * Get test database instance.
 * Must be called after setupE2ETestDatabaseJest().
 *
 * @throws Error if database not initialized
 */
export async function getE2ETestDb(): Promise<ITestDatabase> {
  const { getTestDb } = await import('@package/test-utils');
  return getTestDb();
}

/**
 * Create a test organization (tenant + organization) using the app's database connection.
 *
 * This function uses the NestJS app's database connection pool to ensure
 * data visibility during E2E tests.
 *
 * @param app - NestJS application instance
 * @param name - Optional organization name
 * @returns Object containing tenantId and organizationId
 */
export async function createTestOrganization(
  serverOrApp: ServerOrApp,
  name?: string
): Promise<{ tenantId: number; organizationId: number }> {
  // Get the database connection from the app's module
  const app = getApp(serverOrApp);
  if (!app) {
    throw new Error('createTestOrganization requires an initialized test server or Nest app');
  }
  const db = app.get<NodePgDatabase>(MAIN_DB);

  const orgName = name ?? 'Test Org';
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const orgSlug = `${orgName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${randomSuffix}`;

  // Create tenant (tenants table has: type, status, settings)
  const [tenant] = await db
    .insert(tenants)
    .values({
      type: 'organization',
      status: 'active'
    })
    .returning();

  if (!tenant) {
    throw new Error('Failed to create test tenant');
  }

  // Create organization (organizations table has: tenantId, name, slug, etc.)
  const [organization] = await db
    .insert(organizations)
    .values({
      tenantId: tenant.id,
      name: orgName,
      slug: orgSlug,
      isActive: true
    })
    .returning();

  if (!organization) {
    throw new Error('Failed to create test organization');
  }

  // Explicitly extract IDs and cast to number
  const tenantId = Number(tenant.id);
  const organizationId = Number(organization.id);

  return {
    tenantId,
    organizationId
  };
}

/**
 * Legacy alias for createTestOrganization.
 * Creates tenant + organization together.
 */
export async function createTestOrganizationWithTenant(
  serverOrApp: ServerOrApp,
  name?: string
): Promise<{ tenantId: number; organizationId: number }> {
  return createTestOrganization(serverOrApp, name);
}

/**
 * Create a test tenant record.
 *
 * @param app - NestJS application instance
 * @param tenantType - Tenant type (e.g., 'organization', 'team', 'individual')
 * @param status - Tenant status ('draft', 'trial', 'active', 'suspended', 'deleted')
 * @returns Created tenant ID
 */
export async function createTestTenant(
  serverOrApp: ServerOrApp,
  tenantType: 'organization' | 'team' | 'individual' = 'organization',
  status: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted' = 'active'
): Promise<number> {
  const app = getApp(serverOrApp);
  if (!app) {
    throw new Error('createTestTenant requires an initialized test server or Nest app');
  }
  const db = app.get<NodePgDatabase>(MAIN_DB);

  const [tenant] = await db
    .insert(tenants)
    .values({
      type: tenantType,
      status
    })
    .returning();

  if (!tenant) {
    throw new Error('Failed to create test tenant');
  }

  return tenant.id as number; // Use auto-incrementing integer ID from database
}

/**
 * Create a test user-tenant membership record.
 *
 * @param app - NestJS application instance
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param role - User role
 * @param isDefault - Whether this is the default tenant for the user
 */
export async function createTestUserTenant(
  serverOrApp: ServerOrApp,
  userId: number,
  tenantId: number,
  role: 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer' = 'tenant_user',
  isDefault: boolean = false
): Promise<void> {
  const app = getApp(serverOrApp);
  if (!app) {
    throw new Error('createTestUserTenant requires an initialized test server or Nest app');
  }
  const db = app.get<NodePgDatabase>(MAIN_DB);

  await db.insert(userTenants).values({
    userId,
    tenantId,
    role,
    isDefault
  });
}

/**
 * Clean up all test data for an organization.
 *
 * This function deletes all users belonging to an organization,
 * which is useful for test isolation.
 *
 * @param app - NestJS application instance
 * @param orgIdOrTenantCtx - Organization ID (number) or tenant context (object with tenantId and organizationId)
 */
export async function cleanupOrganization(
  serverOrApp: ServerOrApp,
  orgIdOrTenantCtx: number | { tenantId: number; organizationId: number }
): Promise<void> {
  const app = getApp(serverOrApp);
  if (!app) {
    return;
  }
  const db = app.get<NodePgDatabase>(MAIN_DB);

  // Support both legacy (number) and new format (object) signatures
  const organizationId =
    typeof orgIdOrTenantCtx === 'number' ? orgIdOrTenantCtx : orgIdOrTenantCtx.organizationId;

  // Delete all users in organization
  await db.delete(users).where(eq(users.organizationId, organizationId));

  // Delete organization
  await db.delete(organizations).where(eq(organizations.id, organizationId));
}

/**
 * Clean up tenant data.
 *
 * @param app - NestJS application instance
 * @param tenantId - Tenant ID to clean up
 */
export async function cleanupTenant(serverOrApp: ServerOrApp, tenantId: number): Promise<void> {
  const app = getApp(serverOrApp);
  if (!app) {
    return;
  }
  const db = app.get<NodePgDatabase>(MAIN_DB);

  // Delete all user-tenant memberships for this tenant
  await db.delete(userTenants).where(eq(userTenants.tenantId, tenantId));

  // Delete the tenant
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

/**
 * Clean up all test data by dropping and recreating the public schema.
 *
 * This removes all tables, views, functions, and data, then recreates
 * the schema with default permissions. After calling this, migrations
 * need to be re-run before using the database again.
 *
 * @param db - ITestDatabase instance
 */
export async function cleanITestDatabase(db: ITestDatabase): Promise<void> {
  const { cleanTestDatabase } = await import('@package/test-utils');

  await cleanTestDatabase(db.pool);
}

// ============================================================================
// TYPES
// ============================================================================

interface ConnectionData {
  connectionUrl?: string; // Legacy format
  databases?: {
    main?: {
      connectionUrl: string;
    };
    events?: {
      connectionUrl: string;
    };
  };
}
