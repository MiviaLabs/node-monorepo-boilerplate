import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { ApiException } from '../errors';
import { normalizeSemanticVersion, InvalidVersionError } from '../utils/version.util';

/**
 * Metadata key for storing allowed versions on controllers/handlers
 */
export const API_VERSION_KEY = 'api_version';

/**
 * Guard to validate API version from request headers
 *
 * @description
 * This guard validates that the requested API version is compatible with
 * the versions allowed by the endpoint. If no @ApiVersion() decorator is
 * present, the behavior depends on VERSION_GUARD_STRICT_MODE:
 * - Strict mode (enabled): Throws an error requiring explicit version declaration
 * - Non-strict mode (default): Logs a warning but allows access
 *
 * @example
 * ```typescript
 * @UseGuards(ApiVersionGuard)
 * @ApiVersion('1.0')
 * @Get()
 * findAll() {
 *   return 'This endpoint requires API version 1.0';
 * }
 * ```
 */
@Injectable()
export class ApiVersionGuard implements CanActivate {
  private readonly logger = new Logger(ApiVersionGuard.name);
  private readonly strictMode: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {
    // Strict mode: throw error instead of warning for endpoints without @ApiVersion()
    this.strictMode = this.configService.get<boolean>('VERSION_GUARD_STRICT_MODE', false) ?? false;
  }

  canActivate(context: ExecutionContext): boolean {
    // Get allowed versions from decorator metadata
    const allowedVersions = this.reflector.getAllAndOverride<string[]>(API_VERSION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    // If no versions specified, behavior depends on strict mode
    if (!allowedVersions || allowedVersions.length === 0) {
      const request = context.switchToHttp().getRequest() as { url?: string; path?: string };
      const path = request.url ?? request.path ?? 'unknown';

      if (this.strictMode) {
        // Strict mode: throw error
        throw ApiException.requestValidationFailed('@ApiVersion()', 'required in strict mode');
      }

      // Non-strict mode: allow with warning
      this.logger.warn(
        `Endpoint "${path}" has no @ApiVersion() decorator. ` +
          'This endpoint is accessible without version restrictions. ' +
          'Consider adding @ApiVersion() decorator for proper versioning. ' +
          'Enable VERSION_GUARD_STRICT_MODE to enforce version declaration.'
      );
      return true;
    }

    const request = context.switchToHttp().getRequest() as Record<string, unknown>;
    const requestVersion = this.extractVersionFromRequest(request);

    // Check if requested version is in allowed versions
    if (!requestVersion) {
      throw ApiException.missingRequiredHeader('X-API-Version');
    }

    const isAllowed = allowedVersions.some((version) =>
      this.isVersionCompatible(requestVersion, version)
    );

    if (!isAllowed) {
      throw ApiException.apiVersionNotFound(requestVersion);
    }

    return true;
  }

  /**
   * Extract API version from request headers
   * Checks X-API-Version header first, then falls back to Accept header
   */
  private extractVersionFromRequest(request: Record<string, unknown>): string | null {
    // Headers are typically stored as an object with lowercase keys
    const headers = request['headers'] as Record<string, string | string[] | undefined>;

    // Check X-API-Version header
    const versionHeader = headers['x-api-version'];
    if (versionHeader) {
      const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;
      if (version !== undefined) {
        try {
          return normalizeSemanticVersion(version);
        } catch (error) {
          if (error instanceof InvalidVersionError) {
            throw ApiException.invalidQueryParameter('X-API-Version', version);
          }
          throw error;
        }
      }
    }

    // Check Accept header for version in vendor MIME type
    // e.g., application/vnd.api.v1+json
    const acceptHeader = headers['accept'];
    if (acceptHeader) {
      const accept = Array.isArray(acceptHeader) ? acceptHeader[0] : acceptHeader;
      if (accept !== undefined) {
        const match = accept.match(/vnd\.api\.v(\d+\.\d+)\+json/);
        if (match?.[1]) {
          try {
            return normalizeSemanticVersion(match[1]);
          } catch (error) {
            if (error instanceof InvalidVersionError) {
              throw ApiException.invalidQueryParameter('Accept', accept);
            }
            throw error;
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if requested version is compatible with allowed version
   * Uses semantic versioning compatibility rules:
   * - Exact match is always compatible
   * - Same major version is compatible (e.g., 1.2.0 compatible with 1.0.0)
   * - Requested version must NOT be newer than allowed version
   */
  private isVersionCompatible(requested: string, allowed: string): boolean {
    // Exact match is always compatible
    if (requested === allowed) {
      return true;
    }

    const reqParts = requested.split('.').map(Number);
    const allowedParts = allowed.split('.').map(Number);

    // Compare each part of semver (major.minor.patch)
    for (let i = 0; i < 3; i++) {
      const reqPart = reqParts[i] ?? 0;
      const allowedPart = allowedParts[i] ?? 0;

      if (reqPart < allowedPart) {
        // Requested version is older - compatible within same major
        return i === 0 ? false : true; // Different major = incompatible
      }

      if (reqPart > allowedPart) {
        // Requested version is newer - incompatible
        return false;
      }
    }

    // Versions are identical (already handled above, but for completeness)
    return true;
  }
}
