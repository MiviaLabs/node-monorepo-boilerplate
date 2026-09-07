import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiVersionConfig, ApiVersionInfo, ApiVersionStatus } from '../../config/version.config';

/**
 * VersionService provides centralized API version management.
 *
 * @description
 * This service caches version configuration at application startup. Any changes
 * to version configuration require an application restart to take effect.
 *
 * If version configuration is missing, a default configuration with a single
 * active version (v1) will be used to ensure the application remains functional.
 *
 * @example
 * ```typescript
 * // Get current version info
 * const versionInfo = versionService.getVersion('v1');
 *
 * // Check if version is deprecated
 * const isDeprecated = versionService.isVersionDeprecated('v1');
 *
 * // Get deprecation info
 * const deprecationInfo = versionService.getDeprecationInfo('v1');
 * ```
 */
@Injectable()
export class VersionService {
  private readonly config: ApiVersionConfig;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    // Cache version config at startup for performance.
    // Note: Config changes require application restart to take effect.
    // If config is missing, use default configuration to ensure application stability.
    this.config = this.configService.get<ApiVersionConfig>('version') ?? {
      enabled: true,
      versions: [{ prefix: 'v1', version: '1.0.0', status: ApiVersionStatus.ACTIVE }],
      defaultVersion: 'v1',
      deprecationWarningDays: 90
    };
  }

  /**
   * Get information about a specific version by prefix
   * @param prefix - Version prefix (e.g., 'v1', 'v2')
   * @returns Version info object or undefined if version not found
   */
  getVersion(prefix: string): ApiVersionInfo | undefined {
    return this.config.versions.find((v) => v.prefix === prefix);
  }

  /**
   * Get all configured versions
   * @returns Array of all version info objects
   */
  getAllVersions(): ApiVersionInfo[] {
    return [...this.config.versions];
  }

  /**
   * Get only active (non-sunset) versions
   * @returns Array of active version info objects
   */
  getActiveVersions(): ApiVersionInfo[] {
    return this.config.versions.filter((v) => v.status !== ApiVersionStatus.SUNSET);
  }

  /**
   * Get only active and not deprecated versions
   * @returns Array of version info objects with status 'active'
   */
  getCurrentVersions(): ApiVersionInfo[] {
    return this.config.versions.filter((v) => v.status === ApiVersionStatus.ACTIVE);
  }

  /**
   * Get only deprecated versions
   * @returns Array of deprecated version info objects
   */
  getDeprecatedVersions(): ApiVersionInfo[] {
    return this.config.versions.filter((v) => v.status === ApiVersionStatus.DEPRECATED);
  }

  /**
   * Check if a version is supported (not sunset)
   * @param prefix - Version prefix to check
   * @returns true if version exists and is not sunset
   */
  isVersionSupported(prefix: string): boolean {
    return this.config.versions.some(
      (v) => v.prefix === prefix && v.status !== ApiVersionStatus.SUNSET
    );
  }

  /**
   * Check if a version is deprecated
   * @param prefix - Version prefix to check
   * @returns true if version is deprecated
   */
  isVersionDeprecated(prefix: string): boolean {
    const version = this.getVersion(prefix);
    return version?.status === ApiVersionStatus.DEPRECATED;
  }

  /**
   * Get the default version prefix
   * @returns Default version prefix (e.g., 'v1')
   */
  getDefaultVersion(): string {
    return this.config.defaultVersion;
  }

  /**
   * Get deprecation information for a version
   * @param prefix - Version prefix to check
   * @returns Deprecation info object or null if not deprecated
   */
  getDeprecationInfo(prefix: string): {
    deprecated: boolean;
    sunsetDate?: string;
    daysUntilSunset?: number;
  } | null {
    const version = this.getVersion(prefix);

    if (version?.status !== ApiVersionStatus.DEPRECATED) {
      return null;
    }

    const result: {
      deprecated: boolean;
      sunsetDate?: string;
      daysUntilSunset?: number;
    } = {
      deprecated: true
    };

    if (version.sunsetDate !== undefined) {
      result.sunsetDate = version.sunsetDate;
      const daysUntilSunset = Math.max(
        0,
        Math.ceil((new Date(version.sunsetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );
      result.daysUntilSunset = daysUntilSunset;
    }

    return result;
  }

  /**
   * Get the number of days until a version is sunset
   * @param prefix - Version prefix to check
   * @returns Number of days until sunset, or null if version is not deprecated
   */
  getDaysUntilSunset(prefix: string): number | null {
    const deprecationInfo = this.getDeprecationInfo(prefix);
    return deprecationInfo?.daysUntilSunset ?? null;
  }

  /**
   * Check if a version should be sunset (removed)
   * @param prefix - Version prefix to check
   * @returns true if version sunset date has passed
   */
  isVersionSunset(prefix: string): boolean {
    const version = this.getVersion(prefix);

    if (version?.status === ApiVersionStatus.SUNSET) {
      return true;
    }

    if (version?.sunsetDate) {
      // Use Date.now() for consistent UTC comparison
      return Date.now() > new Date(version.sunsetDate).getTime();
    }

    return false;
  }

  /**
   * Get version configuration for Swagger/OpenAPI documentation
   * @returns Array of version info for documentation
   */
  getVersionsForDocs(): Array<{
    prefix: string;
    version: string;
    status: string;
    url: string;
    deprecated?: boolean;
    sunsetDate?: string;
  }> {
    return this.config.versions.map((v) => ({
      prefix: v.prefix,
      version: v.version,
      status: v.status,
      url: `/api/${v.prefix}`,
      ...(v.status === ApiVersionStatus.DEPRECATED && {
        deprecated: true,
        sunsetDate: v.sunsetDate
      })
    }));
  }

  /**
   * Get the version number string (semantic version)
   * @returns Version string (e.g., '1.0.0')
   */
  getSemanticVersion(): string {
    const defaultVersion = this.getVersion(this.config.defaultVersion);
    return defaultVersion?.version ?? '1.0.0';
  }

  /**
   * Get full version information including git metadata
   * @returns Version info object
   */
  getFullVersionInfo(): {
    version: string;
    gitCommit: string;
    gitShortCommit: string;
    buildDate: string;
  } {
    const defaultVersion = this.getVersion(this.config.defaultVersion);
    return {
      version: defaultVersion?.version ?? '1.0.0',
      gitCommit: process.env['GIT_COMMIT'] ?? 'unknown',
      gitShortCommit: process.env['GIT_SHORT_COMMIT'] ?? 'unknown',
      buildDate: new Date().toISOString()
    };
  }
}
