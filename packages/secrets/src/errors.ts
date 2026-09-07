/**
 * Custom error types for secrets
 *
 * @module @package/secrets/errors
 *
 * This module provides specialized error classes for secret management operations.
 * All errors extend from base classes in @package/core for consistent error handling.
 *
 * @example Handling secret errors in a service
 * ```typescript
 * import {
 *   SecretNotFoundError,
 *   SecretProviderConfigError,
 *   SecretOperationError,
 * } from '@package/secrets';
 *
 * @Injectable()
 * export class ConfigService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
 *   ) {}
 *
 *   async getApiKey(): Promise<string> {
 *     try {
 *       return await this.secrets.getSecret('API_KEY');
 *     } catch (error) {
 *       if (error instanceof SecretNotFoundError) {
 *         throw new NotFoundException('API key not configured');
 *       }
 *       if (error instanceof SecretOperationError) {
 *         throw new ServiceUnavailableException('Secret service unavailable');
 *       }
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */

import {
  InfrastructureError,
  ConfigurationError,
  NotFoundError,
  OperationError
} from '@package/core';

/**
 * Error thrown when a secret is not found
 *
 * @example Handling SecretNotFoundError
 * ```typescript
 * try {
 *   const apiKey = await provider.getSecret('non-existent-key');
 * } catch (error) {
 *   if (error instanceof SecretNotFoundError) {
 *     console.error(`Secret not found: ${error.message}`);
 *     // Use a default value or throw a user-friendly error
 *   }
 * }
 * ```
 *
 * @example Using in NestJS exception filter
 * ```typescript
 * @Catch(SecretNotFoundError)
 * export class SecretNotFoundFilter implements ExceptionFilter {
 *   catch(exception: SecretNotFoundError, host: ArgumentsHost) {
 *     const ctx = host.switchToHttp();
 *     const response = ctx.getResponse<Response>();
 *
 *     response.status(500).json({
 *       statusCode: 500,
 *       message: 'Configuration error: required secret not found',
 *     });
 *   }
 * }
 * ```
 */
export class SecretNotFoundError extends NotFoundError {
  constructor(key: string) {
    super('Secret', key);
    this.name = 'SecretNotFoundError';
  }
}

/**
 * Error thrown when secret provider configuration is invalid
 *
 * @example Catching configuration errors during initialization
 * ```typescript
 * try {
 *   const provider = new GcpSecretManagerProvider({
 *     projectId: '', // Invalid: empty project ID
 *   });
 * } catch (error) {
 *   if (error instanceof SecretProviderConfigError) {
 *     console.error(`Configuration error: ${error.message}`);
 *     console.error(`Invalid field: ${error.field}`);
 *     process.exit(1);
 *   }
 * }
 * ```
 *
 * @example Validating configuration before startup
 * ```typescript
 * function validateSecretConfig(config: SecretsModuleConfig): void {
 *   if (!config.gcp?.projectId) {
 *     throw new SecretProviderConfigError(
 *       'GCP project ID is required',
 *       'gcp.projectId'
 *     );
 *   }
 * }
 * ```
 */
export class SecretProviderConfigError extends ConfigurationError {
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'SecretProviderConfigError';
  }
}

/**
 * Error thrown when secret operation fails
 *
 * @example Handling operation errors with retry logic
 * ```typescript
 * async function getSecretWithRetry(
 *   provider: SecretProvider,
 *   key: string,
 *   retries = 3
 * ): Promise<string> {
 *   for (let i = 0; i < retries; i++) {
 *     try {
 *       return await provider.getSecret(key);
 *     } catch (error) {
 *       if (error instanceof SecretOperationError && i < retries - 1) {
 *         await new Promise(r => setTimeout(r, 1000 * (i + 1)));
 *         continue;
 *       }
 *       throw error;
 *     }
 *   }
 *   throw new Error('Unreachable');
 * }
 * ```
 *
 * @example Logging operation errors
 * ```typescript
 * try {
 *   await provider.setSecret('key', 'value');
 * } catch (error) {
 *   if (error instanceof SecretOperationError) {
 *     logger.error({
 *       operation: error.operation,
 *       message: error.message,
 *       cause: error.cause,
 *     }, 'Secret operation failed');
 *   }
 * }
 * ```
 */
export class SecretOperationError extends OperationError {
  constructor(operation: string, message: string, cause?: Error | unknown) {
    super(operation, message, cause);
    this.name = 'SecretOperationError';
  }
}

/**
 * Error thrown when secret provider is not available
 *
 * @example Handling provider unavailability in health checks
 * ```typescript
 * @Injectable()
 * export class SecretsHealthIndicator extends HealthIndicator {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
 *   ) {
 *     super();
 *   }
 *
 *   async isHealthy(key: string): Promise<HealthIndicatorResult> {
 *     try {
 *       const isHealthy = await this.secrets.healthCheck?.() ?? true;
 *       return this.getStatus(key, isHealthy);
 *     } catch (error) {
 *       if (error instanceof SecretProviderUnavailableError) {
 *         return this.getStatus(key, false, { message: error.message });
 *       }
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
export class SecretProviderUnavailableError extends InfrastructureError {
  constructor(providerName: string, cause?: Error | unknown) {
    super(`Secret provider '${providerName}' is unavailable`, 'SECRET_PROVIDER_UNAVAILABLE', cause);
    this.name = 'SecretProviderUnavailableError';
  }
}

/**
 * Error thrown when encryption/decryption operations fail
 *
 * @example Handling crypto errors during encryption
 * ```typescript
 * try {
 *   const encrypted = await provider.encrypt(sensitiveData);
 * } catch (error) {
 *   if (error instanceof SecretCryptoError) {
 *     logger.error({
 *       operation: error.operation,
 *       message: 'Encryption failed',
 *       cause: error.cause,
 *     });
 *     throw new InternalServerErrorException('Unable to secure data');
 *   }
 * }
 * ```
 *
 * @example Graceful degradation on decryption failure
 * ```typescript
 * async function decryptOrNull(
 *   provider: SecretProvider,
 *   ciphertext: string
 * ): Promise<string | null> {
 *   try {
 *     return await provider.decrypt(ciphertext);
 *   } catch (error) {
 *     if (error instanceof SecretCryptoError) {
 *       logger.warn('Decryption failed, returning null');
 *       return null;
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export class SecretCryptoError extends OperationError {
  constructor(operation: string, message: string, cause?: Error | unknown) {
    super(operation, message, cause);
    this.name = 'SecretCryptoError';
  }
}

/**
 * Error thrown when secret rotation fails
 *
 * @example Handling rotation errors with alerting
 * ```typescript
 * async function rotateSecrets(
 *   provider: SecretProvider,
 *   keys: string[]
 * ): Promise<void> {
 *   for (const key of keys) {
 *     try {
 *       await provider.rotateSecret(key);
 *       logger.info(`Successfully rotated secret: ${key}`);
 *     } catch (error) {
 *       if (error instanceof SecretRotationError) {
 *         // Alert on-call team for rotation failures
 *         await alerting.send({
 *           severity: 'high',
 *           message: `Failed to rotate secret: ${key}`,
 *           cause: error.cause,
 *         });
 *       }
 *       throw error;
 *     }
 *   }
 * }
 * ```
 *
 * @example Rotation with fallback strategy
 * ```typescript
 * try {
 *   await provider.rotateSecret('database/password');
 * } catch (error) {
 *   if (error instanceof SecretRotationError) {
 *     // Log the failure and continue with existing secret
 *     logger.warn({
 *       key: 'database/password',
 *       error: error.message,
 *     }, 'Secret rotation failed, continuing with existing secret');
 *   }
 * }
 * ```
 */
export class SecretRotationError extends OperationError {
  constructor(key: string, cause?: Error | unknown) {
    super('rotate', `Failed to rotate secret '${key}'`, cause);
    this.name = 'SecretRotationError';
  }
}
