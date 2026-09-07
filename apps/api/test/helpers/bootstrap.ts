/**
 * E2E Test Bootstrap Helper
 *
 * Provides utilities to start and stop a real NestJS server for E2E testing.
 * This uses the NestJS Testing Module to ensure proper DI initialization.
 *
 * @packageDocumentation
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

// CRITICAL: Set environment variables BEFORE any module imports
// This ensures EncryptionModule.forRootAsync() can resolve KMS providers from env vars
// when AppModule is imported below

// Configure EnvVarProvider for E2E tests (required by SecureVaultModule -> EncryptionModule)
// EnvVarProvider uses hex-encoded environment variables for encryption keys
// Use a 32-byte (64 hex chars) key for AES-256-GCM

// SINGLE PRIMARY ENCRYPTION KEY (Phase 3: KMS Single-Key Architecture)
// All tenants share the primary encryption key. Tenant isolation is maintained through
// unique DEKs (Data Encryption Keys) per encrypted-store entry, not through separate KEKs.
// The EncryptedStoreKeyService now returns 'primary-encryption-key' for all tenants.
process.env['ENCRYPTION_KEY'] = '1d184ca8e107579837f3d2ff9f8ff7fcb061d3e586bd4a41fbac5dbd0b3e19e6';

// Also set the primary key with explicit ID for EnvVarProvider compatibility
process.env['ENCRYPTION_KEY_primary-encryption-key'] =
  '1d184ca8e107579837f3d2ff9f8ff7fcb061d3e586bd4a41fbac5dbd0b3e19e6';

// Secondary key for rotation testing (simulates a rotated key)
process.env['ENCRYPTION_KEY_primary-encryption-key-v2'] =
  '2e295db9f2186899480f4e30090008adc072e4f67ce5b52bfc6dec1c4f20af72';

// Third key for access log rotation test (unique key IDs to avoid rotation state collision)
process.env['ENCRYPTION_KEY_primary-encryption-key-v3'] =
  '3f3a6eca0d32979005915f4a110019bed083f5a78df6c63c0d7efd2d5a31b083';

import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import supertest from 'supertest';

import { AppModule } from '../../src/app.module';
import { setupSwagger } from '../../src/common/swagger/swagger.setup';

import type { INestApplication } from '@nestjs/common';

// Type definition for test response bodies (exported for use in tests)
interface ResponseBody {
  // E2E tests assert many heterogeneous API shapes; keep this permissive.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ConnectionData {
  connectionUrl?: string; // Legacy: single database
  databases?: {
    main?: { connectionUrl: string };
    events?: { connectionUrl: string };
  };
  kafka?: {
    broker?: string;
    brokers?: string;
  };
}

function normalizeTestDatabaseUrls(urls: { main: string; events?: string }): {
  main: string;
  events: string;
} {
  const main = urls.main;
  const events = urls.events ?? urls.main;

  // Transactional outbox writes run on the main DB transaction. E2E must keep
  // both schemas on the same physical Postgres database or writes will fail
  // with runtime 500s when handlers insert outbox rows from main-db tx scopes.
  if (events !== main) {
    // eslint-disable-next-line no-console
    console.warn(
      '[E2E] Detected split DATABASE_URL/EVENTS_DATABASE_URL configuration. ' +
        'Normalizing EVENTS_DATABASE_URL to DATABASE_URL because transactional outbox ' +
        'tests require both schemas on the same Postgres database.'
    );
  }

  return {
    main,
    events: main
  };
}

/**
 * Get the test database connection URLs.
 *
 * In CI mode: Uses DATABASE_URL and EVENTS_DATABASE_URL from environment (set by setupE2ETestDatabaseJest).
 * In local mode: Reads from .test-db-connection.json (set by daemon).
 *
 * This ensures the NestJS server connects to the same databases as test fixtures.
 *
 * @returns Object with main and events database URLs
 */
function getTestDatabaseUrls(): { main: string; events: string } {
  // CRITICAL: Check if DATABASE_URL is already set (CI mode)
  // setupE2ETestDatabaseJest() sets this when starting Testcontainers directly
  if (process.env['DATABASE_URL']) {
    return normalizeTestDatabaseUrls({
      main: process.env['DATABASE_URL'],
      events: process.env['EVENTS_DATABASE_URL'] || process.env['DATABASE_URL']
    });
  }

  // LOCAL MODE: Read from connection file (daemon mode)
  const connectionFile = resolve(process.cwd(), '.test-db-connection.json');

  if (!existsSync(connectionFile)) {
    throw new Error(
      'Test database connection file not found. Please start the test database with:\n' +
        '  pnpm test:e2e:setup\n' +
        'Or:\n' +
        '  pnpm exec tsx test/global-test-db.ts start'
    );
  }

  const data = JSON.parse(readFileSync(connectionFile, 'utf-8')) as ConnectionData;

  // New format: separate databases
  if (data.databases?.main?.connectionUrl && data.databases?.events?.connectionUrl) {
    return normalizeTestDatabaseUrls({
      main: data.databases.main.connectionUrl,
      events: data.databases.events.connectionUrl
    });
  }

  // Legacy format: single database
  if (data.connectionUrl) {
    return normalizeTestDatabaseUrls({
      main: data.connectionUrl,
      events: data.connectionUrl
    });
  }

  throw new Error('Invalid connection file format: missing database URLs');
}

// Type alias for HTTP responses from test helpers
type ResponseHeaders = Record<string, string | string[] | undefined>;
type Response = { status: number; body: ResponseBody; headers: ResponseHeaders };
type RequestOptions = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};
type HttpOptions = {
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  tenantId?: string;
};

/**
 * Test server interface
 *
 * Provides methods to make HTTP requests and close the server
 */
export interface TestServer {
  /** The NestJS application instance */
  app: INestApplication;
  /** Make an HTTP request to the test server */
  request: (options: RequestOptions) => Promise<Response>;
  /** Make a GET request (includes x-tenant-id header) */
  httpGet: (url: string, tenantId?: string) => Promise<Response>;
  /** Make a POST request (includes x-tenant-id header) */
  httpPost: (options: HttpOptions) => Promise<Response>;
  /** Make a PATCH request (includes x-tenant-id header) */
  httpPatch: (options: HttpOptions) => Promise<Response>;
  /** Make a DELETE request (includes x-tenant-id header) */
  httpDelete: (options: Omit<HttpOptions, 'body'>) => Promise<Response>;
  /** Close the test server */
  close: () => Promise<void>;
}

/**
 * Type alias for TestServer methods to avoid circular references
 */
export type TestServerRequest = TestServer['request'];
export type TestServerHttpMethod =
  | TestServer['httpGet']
  | TestServer['httpPost']
  | TestServer['httpPatch']
  | TestServer['httpDelete']
  | TestServer['close'];

// Export ResponseBody type for use in tests
export type { ResponseBody };

/**
 * Wait for all services to be initialized and healthy
 *
 * This ensures that background services like the OutboxPollerService are
 * fully started before tests begin running. It polls the health endpoint
 * until all services report as healthy.
 *
 * @param server - The test server instance
 * @param options - Wait options
 * @returns Promise that resolves when services are healthy
 *
 * @example
 * ```ts
 * server = await startTestServer();
 * await waitForServiceInitialization(server);
 * ```
 */
export async function waitForServiceInitialization(
  server: TestServer,
  options: { maxWait?: number; interval?: number } = {}
): Promise<void> {
  const { maxWait = 30000, interval = 500 } = options;

  const startTime = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startTime < maxWait) {
    try {
      const healthResponse = await server.request({
        method: 'GET',
        url: '/v1/ops/health'
      });

      if (healthResponse.status === 200) {
        const healthData = healthResponse.body as
          | {
              data?: {
                details?: {
                  outbox?: { status?: string; message?: string; details?: Record<string, unknown> };
                };
              };
            }
          | undefined;

        // Check if outbox service is healthy
        const outboxHealth = healthData?.data?.details?.outbox;
        const outboxStatus = outboxHealth?.status;

        // If outbox is 'up' or events are disabled (which means outbox won't be 'up' but is expected)
        // Check the details to see if events are enabled
        const eventsEnabled = outboxHealth?.details?.['eventsEnabled'] as boolean | undefined;

        if (outboxStatus === 'up') {
          // eslint-disable-next-line no-console
          console.log('[E2E] All services initialized successfully');
          return;
        }

        // If events are disabled, we don't need to wait for outbox to be up
        if (eventsEnabled === false) {
          // eslint-disable-next-line no-console
          console.log('[E2E] Events are disabled, skipping outbox health check');
          return;
        }

        // Log detailed status for debugging
        // eslint-disable-next-line no-console
        console.log(
          `[E2E] Waiting for outbox service... Current status: ${outboxStatus || 'unknown'}` +
            (outboxHealth?.message ? ` - ${outboxHealth.message}` : '') +
            (outboxHealth?.details ? ` (details: ${JSON.stringify(outboxHealth.details)})` : '')
        );
      } else {
        // Non-200 response should be treated as an error for debugging
        const error = new Error(
          `Health endpoint returned status ${healthResponse.status}` +
            (healthResponse.body ? `: ${JSON.stringify(healthResponse.body)}` : '')
        );
        lastError = error;
        // eslint-disable-next-line no-console
        console.log(`[E2E] Health endpoint returned ${healthResponse.status}, retrying...`);
      }
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-console
      console.log('[E2E] Waiting for health endpoint to be ready...');
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const errorMessage =
    lastError instanceof Error
      ? lastError.message
      : lastError !== null && lastError !== undefined
        ? JSON.stringify(lastError)
        : 'null';
  throw new Error(`Service initialization timeout after ${maxWait}ms. Last error: ${errorMessage}`);
}

/**
 * Start a real NestJS server for E2E testing
 *
 * CRITICAL: Uses NestFactory.create() instead of Test.createTestingModule()
 * to ensure proper DI initialization for guards and their dependencies.
 * This guarantees that EnhancedPermissionsGuard can resolve Reflector and
 * CachedPermissionService correctly when specified via @UseGuards() decorator.
 *
 * @returns TestServer instance with request helper and close method
 *
 * @example
 * ```ts
 * import { startTestServer } from './helpers/bootstrap';
 *
 * describe('My E2E Tests', () => {
 *   let server: TestServer;
 *
 *   before(async () => {
 *     server = await startTestServer();
 *   });
 *
 *   after(async () => {
 *     await server.close();
 *   });
 *
 *   it('should work', async () => {
 *     const response = await server.request({
 *       method: 'GET',
 *       url: '/health',
 *     });
 *     expect(response.status).toBe(200);
 *   });
 * });
 * ```
 */
export async function startTestServer(): Promise<TestServer> {
  // Set DATABASE_URL and EVENTS_DATABASE_URL before creating the testing module
  const { main: mainDbUrl, events: eventsDbUrl } = getTestDatabaseUrls();
  process.env['DATABASE_URL'] = mainDbUrl;
  process.env['EVENTS_DATABASE_URL'] = eventsDbUrl;

  // If available, use Kafka broker(s) from Testcontainers connection file.
  // This prevents fallback to localhost:9092 in E2E runs.
  const connectionFile = resolve(process.cwd(), '.test-db-connection.json');
  if (existsSync(connectionFile)) {
    try {
      const data = JSON.parse(readFileSync(connectionFile, 'utf-8')) as ConnectionData;
      const brokersFromFile = data.kafka?.brokers?.trim();
      const brokerFromFile = data.kafka?.broker?.trim();
      const resolvedBrokers = brokersFromFile || brokerFromFile;

      if (resolvedBrokers) {
        process.env['KAFKA_BROKERS'] = resolvedBrokers;
      }
      if (brokerFromFile) {
        process.env['KAFKA_BROKER'] = brokerFromFile;
      }
    } catch {
      // Ignore parse errors and keep existing env values/fallbacks.
    }
  }

  // Set JWT_SECRET for tests (required by AuthModule)
  // Using a secure 32-character test secret
  process.env['JWT_SECRET'] = 'test-jwt-secret-key-with-32-chars-min';

  // CRITICAL: Configure auth providers for E2E tests
  // After P0-1, auth provider factory is injectable and requires explicit provider configuration
  // The googleIdentityPlatformAuthConfig requires specific env vars, so set them all
  process.env['TEST_MODE'] = 'true'; // Enable test mode to skip GCP credential validation

  // Set all required GCP/Firebase Identity Platform env vars
  // The googleIdentityPlatformAuthConfig function checks for these specific variables
  process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project';
  process.env['FIREBASE_PROJECT_ID'] = 'test-project';
  process.env['FIREBASE_PRIVATE_KEY'] = JSON.stringify({
    project_id: 'test-project',
    private_key: 'mock-private-key',
    client_email: 'test@test-project.iam.gserviceaccount.com'
  });
  process.env['FIREBASE_CLIENT_EMAIL'] = 'test@test-project.iam.gserviceaccount.com';
  process.env['FIREBASE_API_KEY'] = 'test-api-key';
  process.env['FIREBASE_TENANT_ID'] = 'test-tenant';

  // CRITICAL: Set REDIS_URL from individual Redis environment variables
  // InfrastructureModule checks for REDIS_URL at import time to decide whether to import RedisModule
  // This must be set before creating the testing module
  if (process.env['REDIS_HOST'] && process.env['REDIS_PORT']) {
    const password = process.env['REDIS_PASSWORD'] ? `:${process.env['REDIS_PASSWORD']}@` : '';
    const db = process.env['REDIS_DB'] || '0';
    process.env['REDIS_URL'] =
      `redis://${password}${process.env['REDIS_HOST']}:${process.env['REDIS_PORT']}/${db}`;
  }

  // CRITICAL: Disable features that require external services in tests
  // Don't override EVENTS_ENABLED if already set (e.g., by Kafka E2E tests)
  if (process.env['EVENTS_ENABLED'] === undefined) {
    process.env['EVENTS_ENABLED'] = 'false'; // Disable Kafka/Events module by default
  }
  // CRITICAL: Don't override KAFKA_BROKERS if already set by test containers
  // This allows Kafka E2E tests to use setupKafkaE2E() from @package/test-utils
  if (!process.env['KAFKA_BROKERS']) {
    process.env['KAFKA_BROKERS'] = ''; // Empty brokers when events disabled in tests
  }
  process.env['REDIS_ENABLED'] = 'false'; // Disable Redis throttling in tests
  process.env['THROTTLE_ENABLED'] = 'false'; // Disable rate limiting in tests
  process.env['SCHEDULER_ENABLED'] = 'false'; // Disable @nestjs/schedule in tests
  process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = ''; // Disable OpenTelemetry in tests

  // Set service metadata for tests
  process.env['SERVICE_NAME'] = 'api-test';
  process.env['SERVICE_VERSION'] = '1.0.0-test';
  process.env['NODE_ENV'] = 'test';

  // CRITICAL: Use NestFactory.create() instead of Test.createTestingModule()
  // This ensures proper DI initialization for guards and their dependencies.
  // Test.createTestingModule() creates an isolated DI context that doesn't properly
  // resolve guard dependencies (like Reflector, CachedPermissionService) when guards
  // are specified via @UseGuards() decorator. NestFactory.create() creates a full
  // application context with all providers properly registered and resolved.

  // Wrap in try-catch to capture initialization errors
  let app: INestApplication;
  try {
    // CRITICAL: Set abortOnError to false to get actual error details instead of process.abort()
    // This helps debug initialization failures by showing the actual error instead of core dump
    // Also disable logger to avoid secondary errors when logging
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
      rawBody: true
    });
  } catch (error) {
    // Log the error with more details
    // eslint-disable-next-line no-console
    console.error('[E2E] NestJS initialization failed:');
    // eslint-disable-next-line no-console
    console.error('Error name:', (error as Error | undefined)?.constructor?.name);
    // eslint-disable-next-line no-console
    console.error('Error message:', (error as Error | undefined)?.message);
    // eslint-disable-next-line no-console
    console.error('Error stack:', (error as Error | undefined)?.stack);
    // Try to log the full error without formatting
    try {
      // eslint-disable-next-line no-console
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    } catch {
      // eslint-disable-next-line no-console
      console.error('Could not stringify error');
    }
    throw error;
  }

  // Apply ValidationPipe (same as main.ts)
  // IMPORTANT: enableImplicitConversion is set to false to ensure strict type validation.
  // When enabled, class-transformer automatically converts strings like 'true' or 'false'
  // to boolean values before validation runs, which bypasses type checking.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false
      }
    })
  );

  // Don't set global prefix in tests - URLs should not include 'api' prefix
  // This keeps test URLs simpler: /v1/health instead of /api/v1/health
  // app.setGlobalPrefix('api');

  // Setup Swagger documentation (same as main.ts)
  // This ensures /api/docs route is available in test environment
  const configService = app.get(ConfigService);
  setupSwagger(app, configService);

  // Initialize the application
  await app.init();

  // Get the underlying HTTP server for supertest
  const httpServer = app.getHttpServer();

  const server: TestServer = {
    app,
    request: async (options) => {
      // Use the URL as provided by the caller; test URLs must include any required prefixes (e.g. "/api")
      const url = options.url;

      // Build supertest request
      const method = options.method.toLowerCase();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let req: any;

      switch (method) {
        case 'get':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          req = supertest(httpServer).get(url);
          break;
        case 'post':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          req = supertest(httpServer).post(url);
          break;
        case 'put':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          req = supertest(httpServer).put(url);
          break;
        case 'patch':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          req = supertest(httpServer).patch(url);
          break;
        case 'delete':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          req = supertest(httpServer).delete(url);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      // Set headers
      if (options.headers) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        req = req.set(options.headers);
      }

      // Add body if present
      if (options.body !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        req = req.send(options.body);
      }

      const response = await req;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      return {
        status: response.status,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        body: response.body,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        headers: response.headers as ResponseHeaders
      };
    },
    httpGet: async (url: string, tenantId?: string): Promise<Response> => {
      const headers: Record<string, string> = tenantId ? { 'x-tenant-id': tenantId } : {};
      return (await server.request({ method: 'GET', url, headers })) as Response;
    },
    httpPost: async (options: {
      path: string;
      body?: unknown;
      headers?: Record<string, string>;
      tenantId?: string;
    }): Promise<Response> => {
      const headers = { ...options.headers };
      if (options.tenantId) {
        headers['x-tenant-id'] = options.tenantId;
      }
      return (await server.request({
        method: 'POST',
        url: options.path,
        headers,
        body: options.body
      })) as Response;
    },
    httpPatch: async (options: {
      path: string;
      body?: unknown;
      headers?: Record<string, string>;
      tenantId?: string;
    }): Promise<Response> => {
      const headers = { ...options.headers };
      if (options.tenantId) {
        headers['x-tenant-id'] = options.tenantId;
      }
      return (await server.request({
        method: 'PATCH',
        url: options.path,
        headers,
        body: options.body
      })) as Response;
    },
    httpDelete: async (options: {
      path: string;
      headers?: Record<string, string>;
      tenantId?: string;
    }): Promise<Response> => {
      const headers = { ...options.headers };
      if (options.tenantId) {
        headers['x-tenant-id'] = options.tenantId;
      }
      return (await server.request({ method: 'DELETE', url: options.path, headers })) as Response;
    },
    close: async () => {
      await app.close();
    }
  };

  return server;
}
