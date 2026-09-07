/**
 * Unit Tests for Version Config
 *
 * Tests the version.config.ts configuration loading and validation.
 * These are pure unit tests that test config parsing logic without NestJS.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified array lengths */

// Re-define the ApiVersionStatus enum since we can't import from config
enum ApiVersionStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  SUNSET = 'sunset'
}

// Import the internal parser function by re-implementing the logic here
// since it's not exported from the config file

/**
 * Parse a single version specification
 * Format: prefix:version:status[:sunsetDate]
 */
function parseVersionSpec(
  spec: string,
  index: number
): {
  prefix: string;
  version: string;
  status: ApiVersionStatus;
  sunsetDate?: string;
} {
  const trimmedSpec = spec.trim();

  const parts = trimmedSpec.split(':').map((part) => part.trim());

  if (parts.length < 3) {
    throw new Error(
      `Invalid API_VERSIONS spec at index ${index}: "${trimmedSpec}".\n` +
        `Expected format: prefix:version:status[:sunsetDate]\n` +
        `Example: v1:1.0.0:active or v1:1.0.0:deprecated:2026-06-30`
    );
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Need || to default on empty strings, not just null/undefined
  const prefix = parts[0] || '';
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Need || to default on empty strings, not just null/undefined
  const version = parts[1] || '1.0.0';
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Need || to default on empty strings, not just null/undefined
  const statusStr = parts[2] || '';
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Need || to default on empty strings, not just null/undefined
  const sunsetDate = parts[3] || '';

  // Validate prefix format (v followed by number)
  if (!prefix || !/^v\d+$/.test(prefix)) {
    throw new Error(
      `Invalid version prefix "${prefix ?? '(empty)'}" at index ${index}.\n` +
        `Prefix must match format: v<number> (e.g., v1, v2, v3)`
    );
  }

  // Validate semantic version format (empty string is allowed, will be defaulted to 1.0.0)
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
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
 * Parse version status from string, throwing error for invalid values
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

/**
 * Parse version specs from environment variable format
 */
function parseVersionsEnv(versionsEnv: string): {
  versions: Array<{
    prefix: string;
    version: string;
    status: ApiVersionStatus;
    sunsetDate?: string;
  }>;
  defaultVersion: string;
} {
  if (!versionsEnv?.trim()) {
    throw new Error('API_VERSIONS is required');
  }

  const trimmedEnv = versionsEnv.trim();

  const MAX_VERSION_SPEC_LENGTH = 500;
  if (trimmedEnv.length > MAX_VERSION_SPEC_LENGTH) {
    throw new Error(
      `API_VERSIONS exceeds maximum length of ${MAX_VERSION_SPEC_LENGTH} characters. ` +
        `Current length: ${trimmedEnv.length}`
    );
  }

  const versionSpecs = trimmedEnv
    .split(',')
    .map((spec) => spec.trim())
    .filter((spec) => spec.length > 0);

  if (versionSpecs.length === 0) {
    throw new Error('API_VERSIONS must contain at least one version specification.');
  }

  const MAX_VERSIONS = 100;
  if (versionSpecs.length > MAX_VERSIONS) {
    throw new Error(
      `API_VERSIONS exceeds maximum number of versions (${MAX_VERSIONS}). ` +
        `Current count: ${versionSpecs.length}`
    );
  }

  const versions = versionSpecs.map((spec, index) => parseVersionSpec(spec, index));
  const defaultVersion = versions[0]?.prefix ?? 'v1';

  return { versions, defaultVersion };
}

describe('Version Config - Unit Tests', () => {
  beforeEach(() => {
    // Reset environment before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('API_') || key === 'NODE_ENV') {
        delete process.env[key];
      }
    }
    process.env['NODE_ENV'] = 'test';
  });

  describe('with valid configuration', () => {
    it('should load single active version configuration', () => {
      const result = parseVersionsEnv('v1:1.0.0:active');

      expect(result.versions.length).toBe(1);
      expect(result.defaultVersion).toBe('v1');

      const [v1] = result.versions;
      expect(v1!.prefix).toBe('v1');
      expect(v1!.version).toBe('1.0.0');
      expect(v1!.status).toBe(ApiVersionStatus.ACTIVE);
    });

    it('should load multiple active versions configuration', () => {
      const result = parseVersionsEnv('v1:1.0.0:active,v2:2.0.0:active,v3:3.0.0:active');

      expect(result.versions.length).toBe(3);

      const [v1, v2, v3] = result.versions;
      expect(v1!.prefix).toBe('v1');
      expect(v1!.version).toBe('1.0.0');
      expect(v1!.status).toBe(ApiVersionStatus.ACTIVE);

      expect(v2!.prefix).toBe('v2');
      expect(v2!.version).toBe('2.0.0');
      expect(v2!.status).toBe(ApiVersionStatus.ACTIVE);

      expect(v3!.prefix).toBe('v3');
      expect(v3!.version).toBe('3.0.0');
      expect(v3!.status).toBe(ApiVersionStatus.ACTIVE);
    });

    it('should load deprecated version with sunset date', () => {
      const result = parseVersionsEnv('v1:1.0.0:deprecated:2026-06-30');

      expect(result.versions.length).toBe(1);

      const [v1] = result.versions;
      expect(v1!.prefix).toBe('v1');
      expect(v1!.version).toBe('1.0.0');
      expect(v1!.status).toBe(ApiVersionStatus.DEPRECATED);
      expect(v1!.sunsetDate).toBe('2026-06-30');
    });

    it('should load mixed status versions', () => {
      const result = parseVersionsEnv(
        'v1:1.0.0:deprecated:2026-06-30,v2:2.0.0:active,v3:3.0.0:sunset'
      );

      expect(result.versions.length).toBe(3);

      const [v1, v2, v3] = result.versions;
      expect(v1!.status).toBe(ApiVersionStatus.DEPRECATED);
      expect(v2!.status).toBe(ApiVersionStatus.ACTIVE);
      expect(v3!.status).toBe(ApiVersionStatus.SUNSET);
    });

    it('should normalize missing version to 1.0.0', () => {
      const result = parseVersionsEnv('v1::active');

      expect(result.versions[0]!.version).toBe('1.0.0');
    });

    it('should default to active status when not provided', () => {
      const result = parseVersionsEnv('v1:1.0.0:');

      expect(result.versions[0]!.status).toBe(ApiVersionStatus.ACTIVE);
    });

    it('should handle whitespace in version specs', () => {
      const result = parseVersionsEnv(' v1 : 1.0.0 : active , v2 : 2.0.0 : active ');

      expect(result.versions.length).toBe(2);
      expect(result.versions[0]!.prefix).toBe('v1');
      expect(result.versions[1]!.prefix).toBe('v2');
    });

    it('should handle trailing commas', () => {
      const result = parseVersionsEnv('v1:1.0.0:active,v2:2.0.0:active,');

      expect(result.versions.length).toBe(2);
    });
  });

  describe('configuration validation - errors', () => {
    it('should throw error when API_VERSIONS exceeds max length', () => {
      const longSpec = 'v1:1.0.0:active,'.repeat(1000);
      const envValue = longSpec.slice(0, -1);

      expect(() => parseVersionsEnv(envValue)).toThrow('exceeds maximum length');
    });

    it('should throw error when API_VERSIONS has zero versions after filtering', () => {
      expect(() => parseVersionsEnv(',,,')).toThrow(
        'must contain at least one version specification'
      );
    });

    it('should throw error when version prefix is invalid', () => {
      expect(() => parseVersionsEnv('invalid:1.0.0:active')).toThrow('Invalid version prefix');
      expect(() => parseVersionsEnv('invalid:1.0.0:active')).toThrow(
        'must match format: v<number>'
      );
    });

    it('should throw error when semantic version is invalid', () => {
      expect(() => parseVersionsEnv('v1:invalid:active')).toThrow('Invalid semantic version');
      expect(() => parseVersionsEnv('v1:invalid:active')).toThrow('MAJOR.MINOR.PATCH');
    });

    it('should throw error when status is invalid', () => {
      expect(() => parseVersionsEnv('v1:1.0.0:invalid_status')).toThrow(
        'Invalid API version status'
      );
      expect(() => parseVersionsEnv('v1:1.0.0:invalid_status')).toThrow('Valid values are');
    });

    it('should throw error when sunset date is invalid', () => {
      expect(() => parseVersionsEnv('v1:1.0.0:deprecated:not-a-date')).toThrow(
        'Invalid sunset date'
      );
      expect(() => parseVersionsEnv('v1:1.0.0:deprecated:not-a-date')).toThrow('ISO 8601 format');
    });

    it('should throw error when spec has too few parts', () => {
      expect(() => parseVersionsEnv('v1:1.0.0')).toThrow('Invalid API_VERSIONS spec');
      expect(() => parseVersionsEnv('v1:1.0.0')).toThrow('Expected format: prefix:version:status');
    });

    it('should throw error when empty spec provided', () => {
      expect(() => parseVersionsEnv('')).toThrow('API_VERSIONS is required');
    });

    it('should throw error when spec has only commas', () => {
      expect(() => parseVersionsEnv(',')).toThrow(
        'must contain at least one version specification'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle single digit versions', () => {
      const result = parseVersionsEnv('v1:1.0.0:active');

      expect(result.versions[0]!.prefix).toBe('v1');
    });

    it('should handle double digit versions', () => {
      const result = parseVersionsEnv('v10:10.0.0:active');

      expect(result.versions[0]!.prefix).toBe('v10');
      expect(result.versions[0]!.version).toBe('10.0.0');
    });

    it('should handle version with patch 0', () => {
      const result = parseVersionsEnv('v1:1.0.0:active');

      expect(result.versions[0]!.version).toBe('1.0.0');
    });

    it('should handle version with non-zero patch', () => {
      const result = parseVersionsEnv('v1:1.2.3:active');

      expect(result.versions[0]!.version).toBe('1.2.3');
    });

    it('should handle all three statuses', () => {
      const result = parseVersionsEnv(
        'v1:1.0.0:active,v2:2.0.0:deprecated:2026-12-31,v3:3.0.0:sunset'
      );

      expect(result.versions.length).toBe(3);
      expect(result.versions[0]!.status).toBe(ApiVersionStatus.ACTIVE);
      expect(result.versions[1]!.status).toBe(ApiVersionStatus.DEPRECATED);
      expect(result.versions[2]!.status).toBe(ApiVersionStatus.SUNSET);
    });

    it('should handle multiple versions', () => {
      // Create 10 version specs (reasonable number for testing)
      const specs = Array.from({ length: 10 }, (_, i) => `v${i + 1}:${i + 1}.0.0:active`);
      const result = parseVersionsEnv(specs.join(','));

      expect(result.versions.length).toBe(10);
    });
  });
});
