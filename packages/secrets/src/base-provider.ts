/**
 * Base secret provider class
 *
 * Provides common functionality for all secret provider implementations.
 *
 * @module @package/secrets/base-provider
 */

import { INFRASTRUCTURE_ATTRS, withSpan } from '@package/core';

import { SecretProviderConfigError } from './errors';
import type { SecretProvider } from './secret-provider.interface';

/**
 * Base provider options
 *
 * @example Configuration options
 * ```typescript
 * const options: BaseProviderOptions = {
 *   name: 'CustomProvider',
 *   enableTracing: true,
 * };
 * ```
 */
export interface BaseProviderOptions {
  /** Provider name for telemetry */
  name?: string;
  /** Enable OpenTelemetry tracing */
  enableTracing?: boolean;
}

/**
 * Abstract base class for secret providers
 *
 * Provides common functionality including:
 * - Automatic tracing with OpenTelemetry
 * - Standardized error handling
 * - Retry logic (to be implemented by subclasses)
 * - Health checks
 *
 * @example Creating a custom provider
 * ```typescript
 * import { BaseSecretProvider } from '@package/secrets';
 *
 * class CustomSecretProvider extends BaseSecretProvider {
 *   constructor() {
 *     super({ name: 'CustomProvider', enableTracing: true });
 *   }
 *
 *   protected async getSecretImpl(key: string): Promise<string> {
 *     // Custom implementation
 *     return customStore.get(key);
 *   }
 *
 *   protected async setSecretImpl(key: string, value: string): Promise<void> {
 *     // Custom implementation
 *     await customStore.set(key, value);
 *   }
 *
 *   // Implement other abstract methods...
 * }
 * ```
 */
export abstract class BaseSecretProvider implements SecretProvider {
  protected readonly name: string;
  protected readonly enableTracing: boolean;

  constructor(options: BaseProviderOptions = {}) {
    this.name = options.name ?? this.constructor.name;
    this.enableTracing = options.enableTracing ?? true;
  }

  /**
   * Get a secret value with automatic tracing
   *
   * @param key - Secret identifier
   * @returns Secret value
   * @throws SecretNotFoundError if secret doesn't exist
   *
   * @example Retrieving a secret
   * ```typescript
   * const dbPassword = await provider.getSecret('database/password');
   * ```
   */
  async getSecret(key: string): Promise<string> {
    this.validateSecretName(key);
    const operation = 'getSecret';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key': this.sanitizeKey(key)
        });
        return await this.getSecretImpl(key);
      });
    }
    return this.getSecretImpl(key);
  }

  /**
   * Set a secret value with automatic tracing
   *
   * @param key - Secret identifier
   * @param value - Secret value to store
   *
   * @example Setting a secret
   * ```typescript
   * await provider.setSecret('database/password', 'new-password');
   * ```
   */
  async setSecret(key: string, value: string): Promise<void> {
    this.validateSecretName(key);
    const operation = 'setSecret';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key': this.sanitizeKey(key)
        });
        return await this.setSecretImpl(key, value);
      });
    }
    return this.setSecretImpl(key, value);
  }

  /**
   * Delete a secret with automatic tracing
   *
   * @param key - Secret identifier
   *
   * @example Deleting a secret
   * ```typescript
   * await provider.deleteSecret('deprecated/api-key');
   * ```
   */
  async deleteSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    const operation = 'deleteSecret';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key': this.sanitizeKey(key)
        });
        return await this.deleteSecretImpl(key);
      });
    }
    return this.deleteSecretImpl(key);
  }

  /**
   * Generate a data key with automatic tracing
   *
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Object with plaintext and ciphertext buffers
   *
   * @example Generating a data key for envelope encryption
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   * // Use plaintext to encrypt data locally
   * // Store ciphertext alongside encrypted data
   * ```
   */
  async generateDataKey(keyId?: string): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    const operation = 'generateDataKey';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key_id': keyId ?? 'default'
        });
        return await this.generateDataKeyImpl(keyId);
      });
    }
    return this.generateDataKeyImpl(keyId);
  }

  /**
   * Encrypt data with automatic tracing
   *
   * @param plaintext - Data to encrypt
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Encrypted ciphertext
   *
   * @example Encrypting sensitive data
   * ```typescript
   * const ciphertext = await provider.encrypt('sensitive-data');
   * ```
   */
  async encrypt(plaintext: string, keyId?: string): Promise<string> {
    const operation = 'encrypt';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key_id': keyId ?? 'default',
          'data.length': plaintext.length
        });
        return await this.encryptImpl(plaintext, keyId);
      });
    }
    return this.encryptImpl(plaintext, keyId);
  }

  /**
   * Decrypt data with automatic tracing
   *
   * @param ciphertext - Encrypted data
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Decrypted plaintext
   *
   * @example Decrypting data
   * ```typescript
   * const plaintext = await provider.decrypt(storedCiphertext);
   * ```
   */
  async decrypt(ciphertext: string, keyId?: string): Promise<string> {
    const operation = 'decrypt';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key_id': keyId ?? 'default',
          'data.length': ciphertext.length
        });
        return await this.decryptImpl(ciphertext, keyId);
      });
    }
    return this.decryptImpl(ciphertext, keyId);
  }

  /**
   * Rotate a secret with automatic tracing
   *
   * @param key - Secret identifier
   *
   * @example Rotating a secret
   * ```typescript
   * await provider.rotateSecret('database/password');
   * ```
   */
  async rotateSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    const operation = 'rotateSecret';
    if (this.enableTracing) {
      return withSpan(`${this.name}.${operation}`, async (span) => {
        span.setAttributes({
          [INFRASTRUCTURE_ATTRS.PROVIDER]: this.name,
          [INFRASTRUCTURE_ATTRS.OPERATION]: operation,
          'secret.key': this.sanitizeKey(key)
        });
        return await this.rotateSecretImpl(key);
      });
    }
    return this.rotateSecretImpl(key);
  }

  /**
   * Health check (to be implemented by subclasses)
   *
   * @returns true if provider is healthy
   *
   * @example Implementing health check in a subclass
   * ```typescript
   * async healthCheck(): Promise<boolean> {
   *   try {
   *     await this.client.ping();
   *     return true;
   *   } catch {
   *     return false;
   *   }
   * }
   * ```
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Implementation of getSecret (to be implemented by subclasses)
   */
  protected abstract getSecretImpl(key: string): Promise<string>;

  /**
   * Implementation of setSecret (to be implemented by subclasses)
   */
  protected abstract setSecretImpl(key: string, value: string): Promise<void>;

  /**
   * Implementation of deleteSecret (to be implemented by subclasses)
   */
  protected abstract deleteSecretImpl(key: string): Promise<void>;

  /**
   * Implementation of generateDataKey (to be implemented by subclasses)
   */
  protected abstract generateDataKeyImpl(
    keyId?: string
  ): Promise<{ plaintext: Buffer; ciphertext: Buffer }>;

  /**
   * Implementation of encrypt (to be implemented by subclasses)
   */
  protected abstract encryptImpl(plaintext: string, keyId?: string): Promise<string>;

  /**
   * Implementation of decrypt (to be implemented by subclasses)
   */
  protected abstract decryptImpl(ciphertext: string, keyId?: string): Promise<string>;

  /**
   * Implementation of rotateSecret (to be implemented by subclasses)
   */
  protected abstract rotateSecretImpl(key: string): Promise<void>;

  /**
   * Sanitize secret key for logging/tracing
   *
   * For keys longer than 12 characters, shows first 4 and last 4 chars.
   * For shorter keys, returns fully masked value to prevent information leakage.
   */
  protected sanitizeKey(key: string): string {
    // For short keys, completely mask to prevent information leakage
    if (key.length <= 12) {
      return '****';
    }
    // For longer keys, show first 4 and last 4 chars, mask the middle
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  }

  /**
   * Validate secret name to prevent injection attacks
   *
   * Secret names must:
   * - Be 1-256 characters long
   * - Contain only alphanumeric characters, hyphens, underscores, and forward slashes
   * - Not start or end with a slash
   * - Not contain consecutive slashes
   *
   * @param key - Secret name to validate
   * @throws SecretProviderConfigError if validation fails
   *
   * @example Valid secret names
   * ```typescript
   * validateSecretName('database-password');    // OK
   * validateSecretName('api/keys/stripe');      // OK
   * validateSecretName('my_secret_123');        // OK
   * ```
   *
   * @example Invalid secret names (will throw)
   * ```typescript
   * validateSecretName('/leading-slash');       // Error
   * validateSecretName('trailing-slash/');      // Error
   * validateSecretName('double//slash');        // Error
   * validateSecretName('special@chars!');       // Error
   * ```
   */
  protected validateSecretName(key: string): void {
    // Check length
    if (key.length === 0 || key.length > 256) {
      throw new SecretProviderConfigError(
        `Secret name must be between 1 and 256 characters, got ${key.length}`,
        'secretName'
      );
    }

    // Check for valid characters (alphanumeric, hyphen, underscore, forward slash)
    const validPattern = /^[a-zA-Z0-9/_-]+$/;
    if (!validPattern.test(key)) {
      throw new SecretProviderConfigError(
        `Secret name contains invalid characters. Only alphanumeric, hyphen (-), underscore (_), and forward slash (/) are allowed`,
        'secretName'
      );
    }

    // Check for consecutive slashes
    if (key.includes('//')) {
      throw new SecretProviderConfigError(
        `Secret name cannot contain consecutive slashes (//)`,
        'secretName'
      );
    }

    // Check if starts or ends with slash
    if (key.startsWith('/') || key.endsWith('/')) {
      throw new SecretProviderConfigError(
        `Secret name cannot start or end with a forward slash (/)`,
        'secretName'
      );
    }
  }
}
