import { HealthStatus } from '../health.constants';

import { BaseResponseDto } from '@/common/dtos';

/**
 * Health data interface - contains the actual health status information
 */
export interface HealthData {
  status: HealthStatus;
  message: string;
  version: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Health Response DTO
 *
 * Extends BaseResponseDto to provide consistent response structure.
 * The health data contains the actual health status information.
 *
 * Note: Health endpoints return this structure directly through the
 * VersionInterceptor which wraps it in { data, meta } format.
 *
 * The version is passed from the HealthService, which retrieves it from
 * VersionService. This ensures the version is always sourced from
 * configuration (API_VERSIONS env var), not hardcoded.
 *
 * @example
 * ```json
 * {
 *   "data": {
 *     "status": "ok",
 *     "message": "API is healthy",
 *     "version": "1.0.0",
 *     "timestamp": "2024-12-31T12:00:00.000Z",
 *     "details": { "database": { "status": "up" } }
 *   },
 *   "meta": {
 *     "version": "v1"
 *   }
 * }
 * ```
 */
export class HealthResponseDto extends BaseResponseDto<HealthData> {
  /**
   * Create a healthy response
   *
   * @param message - Translated health message (e.g., "API is healthy", "تعمل APIs بشكل صحيح")
   * @param version - Semantic version from VersionService (e.g., '1.0.0')
   * @param details - Optional health indicator results
   */
  static healthy(
    message: string,
    version: string,
    details?: Record<string, unknown>
  ): HealthResponseDto {
    const timestamp = new Date().toISOString();
    return new HealthResponseDto(
      {
        status: HealthStatus.Ok,
        message,
        version,
        timestamp,
        ...(details !== undefined && { details })
      },
      { timestamp }
    );
  }

  /**
   * Create an error response
   *
   * @param message - Translated error message describing the health issue
   * @param details - Optional health indicator results
   * @param version - Optional version (defaults to 'unknown' if not provided)
   */
  static unhealthy(
    message: string,
    details?: Record<string, unknown>,
    version = 'unknown'
  ): HealthResponseDto {
    const timestamp = new Date().toISOString();
    return new HealthResponseDto(
      {
        status: HealthStatus.Error,
        message,
        version,
        timestamp,
        ...(details !== undefined && { details })
      },
      { timestamp }
    );
  }

  /**
   * Create from health data
   */
  static fromData(data: HealthData): HealthResponseDto {
    return new HealthResponseDto(data, {
      timestamp: data.timestamp
    });
  }
}
