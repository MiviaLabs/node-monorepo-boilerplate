/**
 * Generate OpenAPI specifications at build time.
 *
 * This script creates NestJS app WITHOUT starting the server or connecting
 * to external services (database, Redis, RabbitMQ, etc.) to generate
 * OpenAPI/Swagger specifications for all API versions.
 *
 * @example
 * ```bash
 * pnpm docs:openapi
 * ```
 *
 * @module apps/api/scripts/generate-openapi
 */

/* eslint-disable no-console */

import * as crypto from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ============================================
// ENVIRONMENT SETUP (MUST BE FIRST)
// ============================================

/**
 * Configure environment for build-time execution.
 * These MUST be set BEFORE importing the AppModule to prevent
 * external service connections.
 */
function setupBuildEnvironment(): void {
  // Build mode
  process.env['NODE_ENV'] = 'production';

  // Disable external services
  process.env['EVENTS_ENABLED'] = 'false';
  process.env['REDIS_ENABLED'] = 'false';
  process.env['THROTTLE_ENABLED'] = 'false';
  process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = '';

  // Auth configuration (required by AuthModule)
  // Regenerate if missing or too short (32 bytes = 64 hex chars minimum)
  process.env['JWT_SECRET'] =
    (process.env['JWT_SECRET']?.length ?? 0) < 64
      ? crypto.randomBytes(32).toString('hex')
      : process.env['JWT_SECRET'];
  process.env['JWT_EXPIRES_IN'] = process.env['JWT_EXPIRES_IN'] ?? '1h';
  process.env['JWT_REFRESH_EXPIRES_IN'] = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d';

  // Google Cloud Identity Platform configuration (required by AuthModule)
  // Set dummy values for build-time execution
  process.env['GOOGLE_CLOUD_PROJECT_ID'] =
    process.env['GOOGLE_CLOUD_PROJECT_ID'] ?? 'dummy-project-id';
  process.env['FIREBASE_CLIENT_EMAIL'] =
    process.env['FIREBASE_CLIENT_EMAIL'] ?? 'dummy@dummy-project-id.iam.gserviceaccount.com';
  process.env['FIREBASE_PRIVATE_KEY'] = process.env['FIREBASE_PRIVATE_KEY'] ?? 'dummy-private-key';

  // Enable TEST_MODE to skip Firebase Admin SDK initialization
  // This allows OpenAPI generation without valid Firebase credentials
  process.env['TEST_MODE'] = 'true';

  // Use simple encryption provider (no cloud KMS)
  process.env['ENCRYPTION_PROVIDER'] = 'env-var';
  // Generate a valid 64-character hex key if not set
  process.env['ENCRYPTION_KEY'] =
    process.env['ENCRYPTION_KEY'] ?? crypto.randomBytes(32).toString('hex');

  // Dummy database connection (modules check for build mode)
  process.env['DATABASE_URL'] =
    process.env['DATABASE_URL'] ?? 'postgresql://dummy:dummy@localhost:5432/dummy';
  process.env['EVENTS_DATABASE_URL'] =
    process.env['EVENTS_DATABASE_URL'] ?? 'postgresql://dummy:dummy@localhost:5432/dummy_events';

  // Enable Swagger for generation
  process.env['SWAGGER_ENABLED'] = 'true';

  // Set default API version if not configured
  process.env['API_VERSIONS'] ??= 'v2:1.0.0:active';

  // Default API prefix
  process.env['API_PREFIX'] ??= 'api';

  // Redis configuration (needed even when REDIS_ENABLED=false for module init)
  process.env['REDIS_HOST'] ??= 'localhost';
  process.env['REDIS_PORT'] ??= '6379';
  process.env['REDIS_DB'] ??= '0';

  // Cache configuration
  process.env['CACHE_ENABLED'] ??= 'false';

  // i18n configuration
  process.env['API_DEFAULT_LANGUAGE'] ??= 'en';
  process.env['API_AVAILABLE_LANGUAGES'] ??= 'en,ar-SA';

  // CORS configuration (disable for build)
  process.env['CORS_ENABLED'] ??= 'false';
  process.env['CORS_ORIGIN'] ??= '*';

  // Security headers (disable for build)
  process.env['SECURITY_HEADERS_ENABLED'] ??= 'false';

  // Server configuration
  process.env['HOST'] ??= '0.0.0.0';
  process.env['PORT'] ??= '3000';

  // Observability (disabled for build)
  process.env['OTEL_ENABLED'] = 'false';

  // Queue provider selection (default to bullmq when not configured)
  process.env['QUEUE_PROVIDER'] ??= 'bullmq';
}

// Setup environment BEFORE any imports
setupBuildEnvironment();

// ============================================
// IMPORTS (AFTER ENVIRONMENT SETUP)
// ============================================

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

// ============================================
// CONSTANTS
// ============================================

/** Project root directory (monorepo root) */
const PROJECT_ROOT = resolve(__dirname, '../../..');

/** Output directory for OpenAPI specs (relative to project root) */
const OUTPUT_DIR = join(PROJECT_ROOT, '.agents/docs/reference/api');

/** API version status (mirrors version.config.ts) */
const ApiVersionStatus = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  SUNSET: 'sunset'
} as const;

/** Version status type */
type ApiVersionStatusType = (typeof ApiVersionStatus)[keyof typeof ApiVersionStatus];

/** Valid status values for validation */
const VALID_STATUSES: readonly ApiVersionStatusType[] = [
  ApiVersionStatus.ACTIVE,
  ApiVersionStatus.DEPRECATED,
  ApiVersionStatus.SUNSET
];

/**
 * Validate if a string is a valid API version status.
 *
 * @param status - The status string to validate
 * @returns True if the status is a valid ApiVersionStatusType
 */
function isValidStatus(status: string): status is ApiVersionStatusType {
  return VALID_STATUSES.includes(status as ApiVersionStatusType);
}

/** Version info interface */
interface ApiVersionInfo {
  prefix: string;
  version: string;
  status: ApiVersionStatusType;
  sunsetDate?: string;
}

// ============================================
// OPENAPI GENERATION
// ============================================

/**
 * Generate OpenAPI document for a specific API version.
 *
 * @param app - NestJS application instance
 * @param versionInfo - Version configuration
 * @param title - API title
 * @returns OpenAPI document object
 */
function generateVersionDocument(
  app: INestApplication,
  versionInfo: ApiVersionInfo,
  title: string
): OpenAPIObject {
  const statusEmoji =
    versionInfo.status === ApiVersionStatus.ACTIVE
      ? '[ACTIVE]'
      : versionInfo.status === ApiVersionStatus.DEPRECATED
        ? '[DEPRECATED]'
        : '[SUNSET]';

  let description = `# ${statusEmoji} API ${versionInfo.prefix.toUpperCase()}\n\n`;
  description += `**Semantic Version:** ${versionInfo.version}\n`;
  description += `**Status:** ${versionInfo.status.toUpperCase()}\n\n`;

  if (versionInfo.status === ApiVersionStatus.DEPRECATED) {
    description += `## Deprecation Warning\n\n`;
    description += `This API version is **deprecated** and will be removed on **${versionInfo.sunsetDate ?? 'a future date'}**.\n\n`;
  }

  const options = new DocumentBuilder()
    .setTitle(`${title} - ${versionInfo.prefix.toUpperCase()}`)
    .setDescription(description)
    .setVersion(versionInfo.version)
    .addTag('API')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter JWT token'
    })
    .addServer('/', 'Base URL')
    .build();

  // Type assertion needed due to reflect-metadata version mismatch in dependency tree
  return SwaggerModule.createDocument(
    app as Parameters<typeof SwaggerModule.createDocument>[0],
    options
  );
}

/**
 * Generate combined OpenAPI document for all versions.
 *
 * @param app - NestJS application instance
 * @param title - API title
 * @param description - API description
 * @returns OpenAPI document object
 */
function generateCombinedDocument(
  app: INestApplication,
  title: string,
  description: string
): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion('1.0.0')
    .addTag('API')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter JWT token'
    })
    .addServer('/', 'Base URL')
    .build();

  // Type assertion needed due to reflect-metadata version mismatch in dependency tree
  return SwaggerModule.createDocument(
    app as Parameters<typeof SwaggerModule.createDocument>[0],
    options
  );
}

/**
 * Write OpenAPI document to file.
 *
 * @param filePath - Output file path
 * @param document - OpenAPI document object
 */
function writeOpenApiFile(filePath: string, document: OpenAPIObject): void {
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(document, null, 2);
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Parse API versions from environment configuration.
 *
 * @returns Array of version info objects
 */
function parseVersions(): ApiVersionInfo[] {
  const versionsEnv = process.env['API_VERSIONS'] ?? 'v2:1.0.0:active';

  return versionsEnv
    .split(',')
    .map((spec) => spec.trim())
    .filter((spec) => spec.length > 0)
    .map((spec) => {
      const parts = spec.split(':').map((p) => p.trim());
      const statusValue = parts[2] ?? 'active';
      return {
        prefix: parts[0] ?? 'v1',
        version: parts[1] ?? '1.0.0',
        status: isValidStatus(statusValue) ? statusValue : ApiVersionStatus.ACTIVE,
        sunsetDate: parts[3]
      };
    });
}

// ============================================
// MAIN EXECUTION
// ============================================

/**
 * Main execution function.
 *
 * Creates NestJS app without starting server, generates OpenAPI specs
 * for all configured versions, writes to output files, and closes cleanly.
 */
async function main(): Promise<void> {
  console.log('Generating OpenAPI specifications...\n');

  let app: INestApplication | null = null;

  try {
    // Dynamically import AppModule after environment setup
    console.log('  Loading application modules...');
    const { AppModule } = await import('../src/app.module');

    // Create NestJS app WITHOUT starting HTTP server
    console.log('  Creating NestJS application (no server)...');
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false
    });

    // Set global prefix for proper path generation
    const apiPrefix = process.env['API_PREFIX'] ?? 'api';
    app.setGlobalPrefix(apiPrefix);

    // Initialize application (triggers lifecycle hooks, registers routes)
    console.log('  Initializing application...');
    await app.init();

    // Get configuration
    const configService = app.get(ConfigService);
    const title = (configService.get('swagger.title') as string | undefined) ?? 'API Documentation';
    const description =
      (configService.get('swagger.description') as string | undefined) ??
      'Enterprise API Documentation';

    // Parse configured versions
    const versions = parseVersions();
    console.log(`\n  Found ${versions.length} API version(s):\n`);

    // Generate spec for each version
    for (const versionInfo of versions) {
      const statusIcon =
        versionInfo.status === ApiVersionStatus.ACTIVE
          ? '[OK]'
          : versionInfo.status === ApiVersionStatus.DEPRECATED
            ? '[DEPRECATED]'
            : '[SUNSET]';

      console.log(`    ${statusIcon} ${versionInfo.prefix} (${versionInfo.version})`);

      const document = generateVersionDocument(app, versionInfo, title);
      const outputPath = join(OUTPUT_DIR, `openapi-${versionInfo.prefix}.json`);

      writeOpenApiFile(outputPath, document);
      console.log(`       -> ${outputPath}`);
    }

    // Generate combined/latest spec
    console.log('\n  Generating combined specification...');
    const combinedDoc = generateCombinedDocument(app, title, description);
    const combinedPath = join(OUTPUT_DIR, 'openapi.json');
    writeOpenApiFile(combinedPath, combinedDoc);
    console.log(`    -> ${combinedPath}`);

    // Summary
    console.log('\n--- Summary ---');
    console.log(`  Versions generated: ${versions.length}`);
    console.log(`  Output directory:   ${OUTPUT_DIR}`);
    console.log(`  Files created:      ${versions.length + 1}`);

    console.log('\nOpenAPI generation completed successfully.');
  } catch (error) {
    console.error('\nERROR: Failed to generate OpenAPI specifications\n');

    if (error instanceof Error) {
      console.error(`  Message: ${error.message}`);

      if (error.stack) {
        console.error(`\n  Stack trace:\n${error.stack}`);
      }
    } else {
      console.error(`  Error: ${String(error)}`);
    }

    // Set exit code instead of calling process.exit() so finally block runs
    process.exitCode = 1;
  } finally {
    // Clean up: close app to prevent hanging processes
    if (app) {
      console.log('\n  Closing application...');

      try {
        // Set a timeout for cleanup to avoid hanging on Kafka/Redis connections
        const closePromise = app.close();
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Close timeout')), 5000)
        );

        await Promise.race([closePromise, timeoutPromise]);
        console.log('  Application closed cleanly.');
      } catch (closeError) {
        if ((closeError as Error).message === 'Close timeout') {
          console.log('  Application close timed out, forcing exit.');
        } else {
          console.warn('  Warning: Error during app close:', closeError);
        }
      }
    }

    // Force exit to ensure the process terminates even with hanging connections
    console.log('  Done.');
    process.exit(process.exitCode ?? 0);
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
