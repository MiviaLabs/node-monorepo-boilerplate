/**
 * Seed configuration options
 *
 * Controls database seeding behavior with security controls.
 */

/**
 * Seed error codes for programmatic error handling
 */
const enum SeedErrorCode {
  /** Database connection failed */
  DATABASE_CONNECTION_FAILED = 'SEED_DB_001',
  /** Production safety check failed */
  PRODUCTION_SAFETY_FAILED = 'SEED_SAFETY_001',
  /** Invalid database URL format */
  INVALID_DATABASE_URL = 'SEED_CONFIG_001',
  /** Dataset execution failed */
  DATASET_FAILED = 'SEED_EXEC_001',
  /** Tenant creation failed */
  TENANT_CREATION_FAILED = 'SEED_DATA_001',
  /** Organization creation failed */
  ORGANIZATION_CREATION_FAILED = 'SEED_DATA_002',
  /** User creation failed */
  USER_CREATION_FAILED = 'SEED_DATA_003'
}

const enum SeedEnvironment {
  Development = 'development',
  Testing = 'testing',
  Staging = 'staging'
}

export interface SeedConfig {
  /** Database connection string (will be redacted in logs) */
  databaseUrl: string;
  /** Environment (development, testing, staging) - NEVER production */
  environment: SeedEnvironment;
  /** Number of tenants to create */
  tenantCount?: number;
  /** Number of users per tenant */
  usersPerTenant?: number;
  /** Clear existing data before seeding (requires confirmation) */
  clearFirst?: boolean;
  /** Force seed even in production (DANGEROUS) */
  force?: boolean;
  /** Log progress */
  verbose?: boolean;
  /** Specific datasets to run (default: all) */
  datasets?: string[];
}

export interface SeedResult {
  /** Dataset name */
  dataset: string;
  /** Number of records created */
  recordsCreated: number;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: SeedErrorCode;
}

export { SeedEnvironment, SeedErrorCode };
