/**
 * Seed runner with security controls
 *
 * Executes seed datasets with production safety guards.
 */

import { developmentDataset, testingDataset } from './datasets';
import { SeedEnvironment, SeedErrorCode } from './interfaces/seed-config.interface';

import type { SeedConfig, SeedResult } from './interfaces';

/**
 * REDACT database URL for safe logging
 *
 * Removes password from connection string.
 * Handles passwords with special characters including @.
 *
 * Implementation: scan the auth segment (between `://` and the first
 * subsequent `/` or `?`, or end of string) for the LAST `@`. Everything
 * between the first `:` (after the protocol) and that last `@` is the
 * password and is replaced with `****`. This correctly handles passwords
 * that contain `@` characters (whether percent-encoded as `%40` or not).
 *
 * @param url - Database connection URL to redact
 * @returns URL with password replaced by ****
 */
export function redactDatabaseUrl(url: string): string {
  // Split the URL into protocol + rest. The "rest" begins with the userinfo.
  const protocolMatch = url.match(/^([a-z]+:\/\/)(.*)$/i);
  if (!protocolMatch) {
    return url;
  }
  const protocol = protocolMatch[1] as string;
  const rest = protocolMatch[2] as string;
  // The auth segment ends at the first '/' or '?' (or end of string).
  let authEnd = rest.length;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '/' || ch === '?') {
      authEnd = i;
      break;
    }
  }
  const authSegment = rest.slice(0, authEnd);
  // Find the LAST '@' within the auth segment. This is the separator between
  // the password (or username, if no password) and the host.
  const lastAt = authSegment.lastIndexOf('@');
  if (lastAt < 0) {
    return url;
  }
  // Find the ':' that separates user from password. If absent, there is no
  // password to redact (only a username).
  const colonIdx = authSegment.lastIndexOf(':', lastAt);
  if (colonIdx < 0) {
    return url;
  }
  const user = authSegment.slice(0, colonIdx + 1); // includes ':'
  const afterAt = authSegment.slice(lastAt + 1); // portion after the last '@'
  const tail = rest.slice(authEnd); // the path/query portion (or empty)
  return `${protocol}${user}****@${afterAt}${tail}`;
}

/**
 * Validate database URL format
 *
 * @param url - Database URL to validate
 * @throws Error with INVALID_DATABASE_URL code if URL is invalid
 */
export function validateDatabaseUrl(url: string): void {
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    const error: Error & { code?: SeedErrorCode } = new Error(
      'Invalid DATABASE_URL: must start with postgresql:// or postgres://'
    );
    error.code = SeedErrorCode.INVALID_DATABASE_URL;
    throw error;
  }

  // Check for minimal URL structure (more than just protocol://)
  const urlWithoutProtocol = url.replace(/^postgres(?:ql)?:\/\//, '');
  if (urlWithoutProtocol.length === 0) {
    const error: Error & { code?: SeedErrorCode } = new Error(
      'Invalid DATABASE_URL: must include host and database'
    );
    error.code = SeedErrorCode.INVALID_DATABASE_URL;
    throw error;
  }
}

/**
 * Security check: prevent running in production
 *
 * CRITICAL: This function prevents accidental production data modification.
 *
 * @param config - Seed configuration containing database URL and flags
 * @throws Error with PRODUCTION_SAFETY_FAILED code if running in production without force flag
 */
export function checkProductionSafety(config: SeedConfig): void {
  // Check environment variable
  const nodeEnv = process.env['NODE_ENV'] || process.env['ENVIRONMENT'];

  if (nodeEnv === 'production' && !config.force) {
    const error: Error & { code?: SeedErrorCode } = new Error(
      'Cannot run seed in production environment. ' +
        'Set NODE_ENV=development or use --force flag if you are absolutely sure.'
    );
    error.code = SeedErrorCode.PRODUCTION_SAFETY_FAILED;
    throw error;
  }

  // Check database URL for production indicators
  const prodIndicators = [
    'prod.',
    'production.',
    '-prod.',
    '-production.',
    '-prod-', // For hostnames like my-prod-db.example.com
    '-production-', // For hostnames like db-production.example.com
    'aws.com',
    'azure.com',
    'gcp.',
    'rds.amazonaws.com',
    'database.windows.net',
    'postgres.database.azure.com'
  ];

  const hasProdIndicator = prodIndicators.some((indicator) =>
    config.databaseUrl.toLowerCase().includes(indicator)
  );

  if (hasProdIndicator && !config.force) {
    const error: Error & { code?: SeedErrorCode } = new Error(
      'DATABASE_URL appears to be a production database. ' +
        'Use --force flag if you are absolutely sure.'
    );
    error.code = SeedErrorCode.PRODUCTION_SAFETY_FAILED;
    throw error;
  }
}

export class SeedRunner {
  constructor(private readonly config: SeedConfig) {
    // Security: Validate and sanitize configuration
    validateDatabaseUrl(config.databaseUrl);
    checkProductionSafety(config);

    if (config.verbose) {
      // eslint-disable-next-line no-console
      console.log('Seed configuration:');
      // eslint-disable-next-line no-console
      console.log(`  Environment: ${config.environment}`);
      // eslint-disable-next-line no-console
      console.log(`  Database: ${redactDatabaseUrl(config.databaseUrl)}`);
      // eslint-disable-next-line no-console
      console.log(`  Clear first: ${config.clearFirst ? 'YES' : 'no'}`);
      // eslint-disable-next-line no-console
      console.log(`  Force: ${config.force ? 'YES (DANGEROUS)' : 'no'}`);
    }
  }

  async run(): Promise<SeedResult[]> {
    const results: SeedResult[] = [];

    // Select datasets based on environment
    const allDatasets = [testingDataset, developmentDataset];

    // First, select datasets based on environment
    const environmentDatasets =
      this.config.environment === SeedEnvironment.Testing
        ? [testingDataset]
        : this.config.environment === SeedEnvironment.Development
          ? [developmentDataset]
          : allDatasets;

    // Apply dataset filter BEFORE environment selection
    // If specific datasets are requested, use those instead of environment-based selection
    const datasetFilter = this.config.datasets;
    const datasets = datasetFilter
      ? allDatasets.filter((d) => datasetFilter.includes(d.name))
      : environmentDatasets;

    // Sort by priority
    datasets.sort((a, b) => a.priority - b.priority);

    for (const dataset of datasets) {
      const result: SeedResult = {
        dataset: dataset.name,
        recordsCreated: 0,
        durationMs: 0,
        success: false
      };

      const startTime = Date.now();

      try {
        if (this.config.verbose) {
          // eslint-disable-next-line no-console
          console.log(`\nSeeding ${dataset.name}: ${dataset.description}`);
        }

        const seedResult = await dataset.seed(this.config);
        result.recordsCreated = seedResult.recordsCreated;
        result.success = true;

        if (this.config.verbose) {
          // eslint-disable-next-line no-console
          console.log(`  ✓ ${dataset.name}: ${result.recordsCreated} records`);
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);

        console.error(`  ✗ ${dataset.name} failed: ${result.error}`);
      }

      result.durationMs = Date.now() - startTime;
      results.push(result);
    }

    return results;
  }
}
