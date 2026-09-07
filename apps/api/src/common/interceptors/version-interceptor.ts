import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { VersionService } from '../services/version.service';
import { DEPRECATION_METADATA_KEY } from '../versioning/version-routing.constants';

interface EndpointDeprecation {
  deprecated: boolean;
  reason?: string;
  sunsetDate?: string;
  migrationGuide?: string;
}

interface DeprecationInfo {
  deprecated: boolean;
  sunsetDate?: string;
  daysUntilSunset?: number;
}

export interface Response<T> {
  data: T;
  meta?: {
    version?: string;
    deprecated?: boolean;
    sunset?: string;
    migrationGuide?: string;
  };
}

/**
 * Type guard to check if data is an already-wrapped response object.
 * This supports both the legacy Response<T> format and the new BaseResponseDto format
 */
function hasMetaOrMetadata(data: unknown): data is Record<string, unknown> & {
  data: unknown;
  meta?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
} {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'data' in data &&
    ('meta' in data || 'metadata' in data)
  );
}

/**
 * VersionInterceptor adds version information and deprecation headers to responses.
 *
 * Features:
 * - Extracts API version from URL path
 * - Adds X-API-Version header to all responses
 * - Adds deprecation headers for deprecated API versions
 * - Logs deprecation warnings for monitoring
 * - Enriches response metadata with version info
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * import { APP_INTERCEPTOR } from '@nestjs/core';
 * import { VersionInterceptor } from './common/interceptors/version-interceptor';
 *
 * @Module({
 *   providers: [
 *     {
 *       provide: APP_INTERCEPTOR,
 *       useClass: VersionInterceptor,
 *     },
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class VersionInterceptor<T> implements NestInterceptor<T, Response<T>> {
  private readonly logger = new Logger(VersionInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly versionService: VersionService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest() as { url: string };

    // Extract version from URL path (e.g., /api/v1/users -> v1)
    const urlVersion = this.extractVersionFromPath(request.url);

    if (!urlVersion) {
      return next.handle() as Observable<Response<T>>;
    }

    const response = context.switchToHttp().getResponse() as {
      setHeader: (name: string, value: string) => void;
    };

    try {
      // Add version header to all responses
      response.setHeader('X-API-Version', urlVersion);

      // Get deprecation info for this version
      let deprecationInfo: DeprecationInfo | null = null;
      try {
        deprecationInfo = this.versionService.getDeprecationInfo(urlVersion);
      } catch (error) {
        this.logger.error(
          `Failed to get deprecation info for version ${urlVersion}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error.stack : undefined
        );
      }

      // Add deprecation headers if version is deprecated
      if (deprecationInfo?.deprecated) {
        this.addDeprecationHeaders(response, urlVersion, deprecationInfo);
        this.logDeprecationWarning(
          request as { url?: string; path?: string } | undefined,
          urlVersion,
          deprecationInfo
        );
      }

      // Check for endpoint-specific deprecation
      let endpointDeprecation: EndpointDeprecation | undefined;
      try {
        endpointDeprecation = this.reflector.get<EndpointDeprecation | undefined>(
          DEPRECATION_METADATA_KEY,
          context.getHandler()
        );
      } catch (error) {
        this.logger.error(
          `Failed to get endpoint deprecation metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error.stack : undefined
        );
      }

      if (endpointDeprecation?.deprecated) {
        this.addEndpointDeprecationHeaders(response, endpointDeprecation);
      }

      // Wrap response with version metadata
      return next
        .handle()
        .pipe(
          map((data) =>
            this.enrichResponseWithVersion(
              data as T,
              urlVersion,
              deprecationInfo,
              endpointDeprecation
            )
          )
        ) as Observable<Response<T>>;
    } catch (error) {
      // Log error but don't fail the request
      this.logger.error(
        `Version interceptor error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined
      );
      return next.handle() as Observable<Response<T>>;
    }
  }

  /**
   * Extract API version from URL path
   * Supports both /api/v1/... and /v1/... formats
   */
  private extractVersionFromPath(url: string): string | null {
    // Match /api/vN/... or /vN/... where N is a number
    const match = url.match(/^\/(?:api\/)?(v\d+)/);
    return match?.[1] ?? null;
  }

  /**
   * Add deprecation headers for deprecated API versions
   */
  private addDeprecationHeaders(
    response: { setHeader: (name: string, value: string) => void },
    version: string,
    deprecationInfo: DeprecationInfo
  ): void {
    response.setHeader('X-API-Deprecated', 'true');

    if (deprecationInfo.sunsetDate) {
      response.setHeader('X-API-Sunset', deprecationInfo.sunsetDate);
    }

    const deprecationMessage =
      `API version ${version} is deprecated and will be removed on ${deprecationInfo.sunsetDate ?? 'a future date'}. ` +
      `Please migrate to the latest version.` +
      (deprecationInfo.daysUntilSunset !== undefined
        ? ` ${deprecationInfo.daysUntilSunset} days remaining.`
        : '');

    response.setHeader('X-API-Deprecation', deprecationMessage);

    // Add Link header to Sunset RFC (https://www.rfc-editor.org/rfc/rfc8594.html)
    if (deprecationInfo.sunsetDate) {
      response.setHeader('Sunset', deprecationInfo.sunsetDate);
    }

    // Add deprecation link if migration guide exists
    response.setHeader(
      'Link',
      `</api/docs>; rel="service-doc", </api/${version}/docs>; rel="version-history"; title="${version} API Documentation"`
    );
  }

  /**
   * Add endpoint-specific deprecation headers
   */
  private addEndpointDeprecationHeaders(
    response: { setHeader: (name: string, value: string) => void },
    deprecation: EndpointDeprecation
  ): void {
    response.setHeader('X-Endpoint-Deprecated', 'true');

    const message = deprecation.migrationGuide
      ? `${deprecation.reason ?? 'This endpoint is deprecated'}. See: ${deprecation.migrationGuide}`
      : (deprecation.reason ?? 'This endpoint is deprecated');

    response.setHeader('X-Endpoint-Deprecation', message);
  }

  /**
   * Log deprecation warning for monitoring and analytics
   */
  private logDeprecationWarning(
    request: { url?: string; path?: string } | undefined,
    version: string,
    deprecationInfo: DeprecationInfo
  ): void {
    const daysRemaining = deprecationInfo.daysUntilSunset ?? 'unknown';
    const path = request?.url ?? request?.path ?? 'unknown';

    this.logger.warn(
      `Deprecated API version ${version} accessed at ${path}. ` +
        `Sunset: ${deprecationInfo.sunsetDate ?? 'TBD'}, Days remaining: ${daysRemaining}`
    );
  }

  /**
   * Enrich response with version metadata
   */
  private enrichResponseWithVersion(
    data: T,
    version: string,
    deprecationInfo: DeprecationInfo | null,
    endpointDeprecation?: EndpointDeprecation
  ): Response<T> {
    // Handle null data explicitly
    if (data === null) {
      const baseResponse = {
        data: null as T
      };

      if (deprecationInfo?.deprecated) {
        return {
          ...baseResponse,
          meta: this.createDeprecationMeta(version, deprecationInfo, endpointDeprecation)
        };
      }

      return baseResponse as Response<T>;
    }

    // Handle arrays explicitly (they are objects but should not be treated as meta-objects)
    if (Array.isArray(data)) {
      const baseResponse = {
        data
      };

      if (deprecationInfo?.deprecated) {
        return {
          ...baseResponse,
          meta: this.createDeprecationMeta(version, deprecationInfo, endpointDeprecation)
        } as Response<T>;
      }

      return baseResponse as Response<T>;
    }

    // If data is already a response object with meta/metadata, merge it using type guard
    if (hasMetaOrMetadata(data)) {
      return this.mergeExistingMeta(data, version, deprecationInfo, endpointDeprecation);
    }

    // Otherwise, wrap data with metadata
    return this.wrapWithMetadata(data, version, deprecationInfo, endpointDeprecation);
  }

  /**
   * Create deprecation metadata object
   */
  private createDeprecationMeta(
    version: string,
    deprecationInfo: DeprecationInfo,
    endpointDeprecation?: EndpointDeprecation
  ): {
    version: string;
    deprecated: boolean;
    sunset?: string;
    migrationGuide?: string;
  } {
    const meta: {
      version: string;
      deprecated: boolean;
      sunset?: string;
      migrationGuide?: string;
    } = {
      version,
      deprecated: true
    };

    if (deprecationInfo.sunsetDate !== undefined) {
      meta.sunset = deprecationInfo.sunsetDate;
    }

    if (endpointDeprecation?.migrationGuide !== undefined) {
      meta.migrationGuide = endpointDeprecation.migrationGuide;
    }

    return meta;
  }

  /**
   * Merge existing metadata with version info
   */
  private mergeExistingMeta(
    data: Record<string, unknown> & {
      meta?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
    version: string,
    deprecationInfo: DeprecationInfo | null,
    endpointDeprecation?: EndpointDeprecation
  ): Response<T> {
    const hasMetadata = 'metadata' in data;
    const existingMeta = (data.meta ?? data.metadata) as Record<string, unknown> | undefined;
    const versionMeta: {
      version: string;
      deprecated?: boolean;
      sunset?: string;
      migrationGuide?: string;
    } = {
      ...(existingMeta ?? {}),
      version
    };

    if (deprecationInfo?.deprecated) {
      versionMeta.deprecated = true;
      if (deprecationInfo.sunsetDate !== undefined) {
        versionMeta.sunset = deprecationInfo.sunsetDate;
      }
      if (endpointDeprecation?.migrationGuide !== undefined) {
        versionMeta.migrationGuide = endpointDeprecation.migrationGuide;
      }
    }

    return {
      data: (data as Record<string, unknown>)['data'] as T,
      [hasMetadata ? 'metadata' : 'meta']: versionMeta
    } as Response<T>;
  }

  /**
   * Wrap data with version metadata
   */
  private wrapWithMetadata(
    data: T,
    version: string,
    deprecationInfo: DeprecationInfo | null,
    endpointDeprecation?: EndpointDeprecation
  ): Response<T> {
    const baseResponse = {
      data
    };

    if (deprecationInfo?.deprecated) {
      return {
        ...baseResponse,
        meta: this.createDeprecationMeta(version, deprecationInfo, endpointDeprecation)
      } as Response<T>;
    }

    return baseResponse as Response<T>;
  }
}
