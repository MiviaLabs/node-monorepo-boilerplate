import { registerAs } from '@nestjs/config';

/**
 * API Version Status enumeration
 * Represents the lifecycle state of an API version
 */
export const enum ApiVersionStatus {
  /** Current stable version, recommended for use */
  ACTIVE = 'active',
  /** Scheduled for removal, deprecation warnings enabled */
  DEPRECATED = 'deprecated',
  /** Past sunset date, no longer accessible */
  SUNSET = 'sunset'
}

/**
 * Configuration limits for API versioning
 * Can be overridden via environment variables
 */
const MAX_VERSIONS = parseInt(process.env['API_MAX_VERSIONS'] ?? '100', 10);
const MAX_VERSION_SPEC_LENGTH = parseInt(process.env['API_MAX_VERSION_SPEC_LENGTH'] ?? '500', 10);

/**
 * Default version configuration for development environment
 * Used when API_VERSIONS is not set in development
 */
const DEFAULT_DEV_VERSIONS: ApiVersionInfo[] = [
  {
    prefix: 'v1',
    version: '1.0.0',
    status: ApiVersionStatus.ACTIVE
  }
];

export interface ApiVersionConfig {
  enabled: boolean;
  versions: ApiVersionInfo[];
  defaultVersion: string;
  deprecationWarningDays: number;
}

export interface ApiVersionInfo {
  prefix: string; // 'v1', 'v2'
  version: string; // '1.0.0', '2.0.0'
  status: ApiVersionStatus;
  sunsetDate?: string; // ISO date string when deprecated version will be removed
}

export default registerAs('version', (): ApiVersionConfig => {
  const isDevelopment = process.env['NODE_ENV'] === 'development';

  // Parse versions from environment variable
  // Format: API_VERSIONS=v1:1.0.0:active,v2:2.0.0:deprecated:2026-06-30
  let versionsEnv = process.env['API_VERSIONS'];

  // In development, provide default configuration if not set
  if (!versionsEnv) {
    if (isDevelopment) {
      return {
        enabled: process.env['API_VERSIONING_ENABLED'] !== 'false',
        versions: DEFAULT_DEV_VERSIONS,
        defaultVersion: process.env['API_DEFAULT_VERSION'] ?? 'v1',
        deprecationWarningDays: parseInt(process.env['API_DEPRECATION_WARNING_DAYS'] ?? '365', 10)
      };
    }

    throw new Error(
      'API_VERSIONS environment variable is required.\n' +
        'Format: API_VERSIONS=v1:1.0.0:active,v2:2.0.0:active\n' +
        'Format: prefix:version:status[:sunsetDate]\n' +
        '  - prefix: Version URL prefix (e.g., v1, v2)\n' +
        '  - version: Semantic version (e.g., 1.0.0)\n' +
        '  - status: active, deprecated, or sunset\n' +
        '  - sunsetDate: (optional) ISO date when deprecated version will be removed'
    );
  }

  // Trim whitespace from the entire string
  versionsEnv = versionsEnv.trim();

  // Validate input length
  if (versionsEnv.length > MAX_VERSION_SPEC_LENGTH) {
    throw new Error(
      `API_VERSIONS exceeds maximum length of ${MAX_VERSION_SPEC_LENGTH} characters. ` +
        `Current length: ${versionsEnv.length}`
    );
  }

  // Split by comma, trim whitespace from each spec, and filter empty strings
  // This handles trailing commas and extra whitespace gracefully
  const versionSpecs = versionsEnv
    .split(',')
    .map((spec) => spec.trim())
    .filter((spec) => spec.length > 0);

  // Validate number of versions
  if (versionSpecs.length === 0) {
    throw new Error(
      'API_VERSIONS must contain at least one version specification.\n' +
        'Example: API_VERSIONS=v1:1.0.0:active'
    );
  }

  if (versionSpecs.length > MAX_VERSIONS) {
    throw new Error(
      `API_VERSIONS exceeds maximum number of versions (${MAX_VERSIONS}). ` +
        `Current count: ${versionSpecs.length}`
    );
  }

  const versions = versionSpecs.map((spec, index) => parseVersionSpec(spec, index));

  // Validate that default version exists in configured versions
  const defaultVersion = process.env['API_DEFAULT_VERSION'] ?? versions[0]?.prefix ?? 'v1';
  if (!versions.some((v) => v.prefix === defaultVersion)) {
    throw new Error(
      `API_DEFAULT_VERSION "${defaultVersion}" not found in API_VERSIONS. ` +
        `Available versions: ${versions.map((v) => v.prefix).join(', ')}`
    );
  }

  return {
    enabled: process.env['API_VERSIONING_ENABLED'] !== 'false',
    versions,
    defaultVersion,
    deprecationWarningDays: parseInt(process.env['API_DEPRECATION_WARNING_DAYS'] ?? '365', 10)
  };
});

/**
 * Parse a single version specification.
 *
 * @param spec - Version specification string (format: prefix:version:status[:sunsetDate])
 * @param index - Index in the versions array for error messages
 * @returns Parsed version info object
 * @throws Error if specification format is invalid
 */
function parseVersionSpec(spec: string, index: number): ApiVersionInfo {
  // Trim the entire spec first to handle leading/trailing whitespace
  const trimmedSpec = spec.trim();

  const parts = trimmedSpec.split(':').map((part) => part.trim());

  if (parts.length < 3) {
    throw new Error(
      `Invalid API_VERSIONS spec at index ${index}: "${trimmedSpec}".\n` +
        `Expected format: prefix:version:status[:sunsetDate]\n` +
        `Example: v1:1.0.0:active or v1:1.0.0:deprecated:2026-06-30`
    );
  }

  const prefix = parts[0] ?? '';
  const version = parts[1] ?? '1.0.0';
  const statusStr = parts[2] ?? '';
  const sunsetDate = parts[3] ?? '';

  // Validate prefix format (v followed by number)
  if (!prefix || !/^v\d+$/.test(prefix)) {
    throw new Error(
      `Invalid version prefix "${prefix ?? '(empty)'}" at index ${index}.\n` +
        `Prefix must match format: v<number> (e.g., v1, v2, v3)`
    );
  }

  // Validate semantic version format
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid semantic version "${version}" at index ${index}.\n` +
        `Version must match format: MAJOR.MINOR.PATCH (e.g., 1.0.0, 2.1.3)`
    );
  }

  // Parse and validate status
  const status = parseVersionStatus(statusStr);

  // Validate sunset date is valid ISO date if provided
  if (sunsetDate && isNaN(Date.parse(sunsetDate))) {
    throw new Error(
      `Invalid sunset date "${sunsetDate}" at index ${index}.\n` +
        `Date must be in ISO 8601 format (e.g., 2026-06-30 or 2026-06-30T23:59:59Z)`
    );
  }

  return {
    prefix,
    version,
    status,
    ...(sunsetDate && { sunsetDate })
  };
}

/**
 * Parse version status from string, throwing error for invalid values.
 *
 * @param value - Status string to parse (active, deprecated, sunset)
 * @returns Parsed ApiVersionStatus enum value
 * @throws Error if status value is invalid
 */
function parseVersionStatus(value: string | undefined): ApiVersionStatus {
  if (!value) {
    return ApiVersionStatus.ACTIVE;
  }

  const validStatuses: ApiVersionStatus[] = [
    ApiVersionStatus.ACTIVE,
    ApiVersionStatus.DEPRECATED,
    ApiVersionStatus.SUNSET
  ];

  if (validStatuses.includes(value as ApiVersionStatus)) {
    return value as ApiVersionStatus;
  }

  throw new Error(
    `Invalid API version status "${value}".\n` + `Valid values are: ${validStatuses.join(', ')}`
  );
}
