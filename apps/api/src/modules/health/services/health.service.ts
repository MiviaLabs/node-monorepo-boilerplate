import { Injectable } from '@nestjs/common';

import { HealthResponseDto } from '../dto/health-response.dto';
import { IndicatorStatus } from '../health.constants';
import { DatabaseHealthIndicator } from '../indicators/database-health-indicator';
import { EncryptionHealthIndicator } from '../indicators/encryption-health-indicator';
import { HealthIndicator } from '../indicators/health-indicator.interface';
import { OutboxHealthIndicator } from '../indicators/outbox-health-indicator';
import { RedisHealthIndicator } from '../indicators/redis-health-indicator';

import { TranslationHelperService } from '@/common/i18n/translation-helper.service';
import { VersionService } from '@/common/services/version.service';

/**
 * Health Service
 *
 * Provides health check functionality for the API.
 * Uses VersionService to get the current API version instead of hardcoded values.
 *
 * This service demonstrates the recommended pattern for accessing version information:
 * - Inject VersionService
 * - Use getSemanticVersion() to get the current version
 * - This ensures version is always sourced from configuration, not hardcoded
 *
 * The service also uses TranslationHelperService to provide internationalized
 * health messages based on the Accept-Language header.
 */
@Injectable()
export class HealthService {
  private readonly indicators: HealthIndicator[] = [];

  constructor(
    private readonly versionService: VersionService,
    private readonly translator: TranslationHelperService,
    databaseHealthIndicator: DatabaseHealthIndicator,
    encryptionHealthIndicator: EncryptionHealthIndicator,
    outboxHealthIndicator: OutboxHealthIndicator,
    redisHealthIndicator: RedisHealthIndicator
  ) {
    // Register health indicators
    this.indicators.push(databaseHealthIndicator);
    this.indicators.push(encryptionHealthIndicator);
    this.indicators.push(outboxHealthIndicator);
    this.indicators.push(redisHealthIndicator);
  }

  /**
   * Get overall health status
   *
   * Returns translated health messages based on the Accept-Language header.
   * - Healthy: "API is healthy" / "تعمل APIs بشكل صحيح" (Arabic) / etc.
   * - Degraded: "API is degraded" / "تعمل APIs بشكل مخفض" (Arabic) / etc.
   */
  async getHealth(): Promise<HealthResponseDto> {
    const results = await this.checkIndicators();
    const version = this.getVersion();
    const isHealthy = Object.values(results).every(
      (result) => result.status === IndicatorStatus.Up
    );

    if (isHealthy) {
      return HealthResponseDto.healthy(
        this.translator.translate('api.health.healthy'),
        version,
        results
      );
    }

    return HealthResponseDto.unhealthy(
      this.translator.translate('api.health.degraded'),
      results,
      version
    );
  }

  /**
   * Get readiness status for Kubernetes readiness probe.
   *
   * Returns healthy only if critical dependencies (database, redis) are up.
   * Non-critical dependencies (outbox) don't affect readiness.
   */
  async getReadiness(): Promise<HealthResponseDto> {
    const results = await this.checkCriticalIndicators();
    const version = this.getVersion();
    const isReady = Object.values(results).every((result) => result.status === IndicatorStatus.Up);

    if (isReady) {
      return HealthResponseDto.healthy(
        this.translator.translate('api.health.ready'),
        version,
        results
      );
    }

    return HealthResponseDto.unhealthy(
      this.translator.translate('api.health.notReady'),
      results,
      version
    );
  }

  /**
   * Run all health indicators
   */
  private async checkIndicators(): Promise<
    Record<string, { status: IndicatorStatus; message?: string; details?: Record<string, unknown> }>
  > {
    const results: Record<
      string,
      { status: IndicatorStatus; message?: string; details?: Record<string, unknown> }
    > = {};

    // Map indicator constructor names to friendly names
    const indicatorNameMap: Record<string, string> = {
      DatabaseHealthIndicator: 'database',
      EncryptionHealthIndicator: 'encryption',
      OutboxHealthIndicator: 'outbox',
      RedisHealthIndicator: 'redis'
    };

    for (const indicator of this.indicators) {
      try {
        const result = await indicator.check();
        const constructorName = indicator.constructor.name;
        const friendlyName = indicatorNameMap[constructorName] ?? constructorName;
        results[friendlyName] = {
          status: result.status,
          ...(result.message !== undefined && { message: result.message }),
          ...(result.details && { details: result.details })
        };
      } catch (error) {
        const constructorName = indicator.constructor.name;
        const friendlyName = indicatorNameMap[constructorName] ?? constructorName;
        results[friendlyName] = {
          status: IndicatorStatus.Down,
          message: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return results;
  }

  /**
   * Run only critical health indicators for readiness probe.
   * Critical: database, redis
   * Non-critical: outbox
   */
  private async checkCriticalIndicators(): Promise<
    Record<string, { status: IndicatorStatus; message?: string; details?: Record<string, unknown> }>
  > {
    const results: Record<
      string,
      { status: IndicatorStatus; message?: string; details?: Record<string, unknown> }
    > = {};

    const criticalIndicators = this.indicators.filter(
      (indicator) => indicator.constructor.name !== 'OutboxHealthIndicator'
    );

    const indicatorNameMap: Record<string, string> = {
      DatabaseHealthIndicator: 'database',
      EncryptionHealthIndicator: 'encryption',
      RedisHealthIndicator: 'redis'
    };

    for (const indicator of criticalIndicators) {
      try {
        const result = await indicator.check();
        const constructorName = indicator.constructor.name;
        const friendlyName = indicatorNameMap[constructorName] ?? constructorName;
        results[friendlyName] = {
          status: result.status,
          ...(result.message !== undefined && { message: result.message }),
          ...(result.details && { details: result.details })
        };
      } catch (error) {
        const constructorName = indicator.constructor.name;
        const friendlyName = indicatorNameMap[constructorName] ?? constructorName;
        results[friendlyName] = {
          status: IndicatorStatus.Down,
          message: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    return results;
  }

  /**
   * Get semantic version from VersionService
   *
   * This is the recommended pattern for accessing version information.
   * The version is sourced from the VersionService, which reads from
   * environment configuration (API_VERSIONS), not from package.json.
   *
   * @returns Semantic version string (e.g., '1.0.0')
   */
  private getVersion(): string {
    return this.versionService.getSemanticVersion();
  }
}
