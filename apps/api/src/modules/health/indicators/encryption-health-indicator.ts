import { Injectable } from '@nestjs/common';
import { KmsProviderFactory, type IKmsProvider, type IKeyInfo } from '@package/encryption';

import { IndicatorStatus } from '../health.constants';
import { HealthIndicator, HealthIndicatorResult } from './health-indicator.interface';

/**
 * Type guard to check if provider has getKeyInfo method.
 */
function hasGetKeyInfo(
  provider: IKmsProvider | undefined
): provider is IKmsProvider & { getKeyInfo(keyId?: string): Promise<IKeyInfo> } {
  return (
    provider !== undefined && 'getKeyInfo' in provider && typeof provider.getKeyInfo === 'function'
  );
}

/**
 * Encryption health indicator.
 *
 * Checks if the KMS provider is available and can perform encryption operations.
 * Verifies connectivity to GCP KMS, AWS KMS, Azure Key encrypted-store, HashiCorp encrypted-store,
 * GCP Secret Manager, environment variable provider, or other configured provider.
 *
 * The health check automatically detects the currently configured provider and
 * reports its status accordingly.
 *
 * @example GCP KMS provider response
 * ```json
 * {
 *   "status": "up",
 *   "message": "KMS provider (gcp) is healthy",
 *   "details": {
 *     "provider": "gcp",
 *     "keyId": "primary-encryption-key"
 *   }
 * }
 * ```
 *
 * @example AWS KMS provider response
 * ```json
 * {
 *   "status": "up",
 *   "message": "KMS provider (aws) is healthy",
 *   "details": {
 *     "provider": "aws"
 *   }
 * }
 * ```
 *
 * @example Environment variable provider (dev only)
 * ```json
 * {
 *   "status": "up",
 *   "message": "KMS provider (env-var) is healthy",
 *   "details": {
 *     "provider": "env-var",
 *     "keyId": "default"
 *   }
 * }
 * ```
 *
 * @example No provider configured
 * ```json
 * {
 *   "status": "down",
 *   "message": "No KMS provider configured"
 * }
 * ```
 */
@Injectable()
export class EncryptionHealthIndicator implements HealthIndicator {
  constructor(private readonly kmsFactory: KmsProviderFactory) {}

  /**
   * Check encryption health status.
   *
   * Verifies that:
   * - A KMS provider is configured
   * - The provider is available (can connect to the service)
   * - The provider can perform basic operations
   *
   * @returns Promise resolving to health indicator result
   */
  async check(): Promise<HealthIndicatorResult> {
    const provider = this.kmsFactory.getDefaultProvider();

    if (!provider) {
      return {
        status: IndicatorStatus.Down,
        message: 'No KMS provider configured'
      };
    }

    try {
      // Check provider availability
      const isAvailable = await provider.isAvailable();

      if (!isAvailable) {
        return {
          status: IndicatorStatus.Down,
          message: `KMS provider (${provider.name}) is not available`
        };
      }

      // Get provider info for additional context
      const keyInfo = await this.getKeyInfo(provider);

      return {
        status: IndicatorStatus.Up,
        message: `KMS provider (${provider.name}) is healthy`,
        details: {
          provider: provider.name,
          ...keyInfo
        }
      };
    } catch (error) {
      return {
        status: IndicatorStatus.Down,
        message: `KMS health check failed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          provider: provider.name
        }
      };
    }
  }

  /**
   * Get key information from provider if available.
   *
   * @param provider - KMS provider instance
   * @returns Key info object or undefined
   */
  private async getKeyInfo(
    provider: ReturnType<KmsProviderFactory['getDefaultProvider']>
  ): Promise<{ keyId: string } | { keyId: string; enabled: boolean } | undefined> {
    try {
      // Only GCP provider has getKeyInfo method
      if (hasGetKeyInfo(provider)) {
        return await provider.getKeyInfo();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
