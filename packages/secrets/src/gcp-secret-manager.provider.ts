import { randomBytes } from 'crypto';

import { KeyManagementServiceClient } from '@google-cloud/kms';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { INFRASTRUCTURE_ATTRS, withSpan } from '@package/core';

import { BaseSecretProvider } from './base-provider';
import type { GcpSecretManagerConfig } from './config/interfaces';
import {
  SecretNotFoundError,
  SecretProviderConfigError,
  SecretOperationError,
  SecretCryptoError,
  SecretRotationError
} from './errors';
import { Cache, createCacheKey } from './utils/cache';
import { retry, isTransientError } from './utils/retry';

/**
 * GCP error codes
 * See: https://cloud.google.com/apis/design/errors
 */
export const GcpErrorCode = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  UNAUTHENTICATED: 16,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15
} as const;

/**
 * GCP Secret Manager Provider
 *
 * Provides secret management using Google Cloud Secret Manager and KMS.
 * Features:
 * - Secret storage and retrieval with versioning support
 * - Encryption/decryption using Cloud KMS
 * - Automatic retry with exponential backoff
 * - Optional in-memory caching
 * - Comprehensive error handling with custom error types
 *
 * @example Basic initialization
 * ```typescript
 * import { GcpSecretManagerProvider } from '@package/secrets';
 *
 * const provider = new GcpSecretManagerProvider({
 *   projectId: 'my-gcp-project',
 *   credentialsPath: '/path/to/service-account.json',
 *   enableCache: true,
 *   cacheTtl: 300000, // 5 minutes
 * });
 *
 * // Retrieve a secret
 * const dbPassword = await provider.getSecret('database/password');
 * ```
 *
 * @example Using with NestJS dependency injection
 * ```typescript
 * import { Injectable, Inject } from '@nestjs/common';
 * import { SECRET_PROVIDER_TOKEN, ISecretProvider } from '@package/secrets';
 *
 * @Injectable()
 * export class DatabaseService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: ISecretProvider,
 *   ) {}
 *
 *   async getConnectionString(): Promise<string> {
 *     const password = await this.secrets.getSecret('database/password');
 *     return `postgresql://user:${password}@localhost:5432/mydb`;
 *   }
 * }
 * ```
 *
 * @example Retrieving a specific secret version
 * ```typescript
 * // Get version 2 of a secret
 * const secretV2 = await provider.getSecret('api-key:2');
 *
 * // Get the latest version (default)
 * const latestSecret = await provider.getSecret('api-key');
 * ```
 *
 * @example Encryption with KMS
 * ```typescript
 * const provider = new GcpSecretManagerProvider({
 *   projectId: 'my-gcp-project',
 *   kmsKeyLocation: 'global',
 *   kmsKeyRingId: 'my-keyring',
 *   kmsKeyId: 'my-key',
 * });
 *
 * // Encrypt sensitive data
 * const ciphertext = await provider.encrypt('sensitive-data');
 *
 * // Decrypt when needed
 * const plaintext = await provider.decrypt(ciphertext);
 * ```
 */
export class GcpSecretManagerProvider extends BaseSecretProvider {
  private client!: SecretManagerServiceClient;
  private readonly config: GcpSecretManagerConfig;
  private kmsClient: KeyManagementServiceClient | null = null;
  private cache?: Cache<string>;
  private readonly enableCache: boolean;
  private readonly enableRetry: boolean;

  private static readonly GCP_SECRET_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private static readonly GCP_SECRET_ID_MAX_LENGTH = 255;

  constructor(config: GcpSecretManagerConfig = {}) {
    super({
      name: 'GcpSecretManager',
      enableTracing: config.enableTracing ?? true
    });

    if (!config.projectId) {
      throw new SecretProviderConfigError('GCP projectId is required', 'projectId');
    }

    this.config = this.resolveConfig(config);
    this.enableCache = this.config.enableCache ?? false;
    this.enableRetry = this.config.enableRetry ?? true;

    this.initializeClients();
  }

  /**
   * Get a secret value with GCP-specific version syntax support.
   * Supports: "secret-id" and "secret-id:<version|latest>"
   */
  override async getSecret(key: string): Promise<string> {
    this.validateGcpSecretReference(key);
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

  private validateGcpSecretReference(reference: string): void {
    const [secretId, version, ...rest] = reference.split(':');

    if (!secretId || rest.length > 0) {
      throw new SecretProviderConfigError(
        `Invalid GCP secret reference format: '${reference}'. Expected 'secret-id' or 'secret-id:version'`,
        'secretName'
      );
    }

    this.validateGcpSecretId(secretId);

    if (version !== undefined) {
      this.validateGcpVersion(version);
    }
  }

  private validateGcpSecretId(secretId: string): void {
    if (
      secretId.length === 0 ||
      secretId.length > GcpSecretManagerProvider.GCP_SECRET_ID_MAX_LENGTH
    ) {
      throw new SecretProviderConfigError(
        `GCP secret ID must be between 1 and ${GcpSecretManagerProvider.GCP_SECRET_ID_MAX_LENGTH} characters, got ${secretId.length}`,
        'secretName'
      );
    }

    if (!GcpSecretManagerProvider.GCP_SECRET_ID_PATTERN.test(secretId)) {
      throw new SecretProviderConfigError(
        'GCP secret ID contains invalid characters. Only alphanumeric, hyphen (-), and underscore (_) are allowed',
        'secretName'
      );
    }
  }

  private validateGcpVersion(version: string): void {
    const isLatest = version === 'latest';
    const isNumericVersion = /^\d+$/.test(version);

    if (!isLatest && !isNumericVersion) {
      throw new SecretProviderConfigError(
        `Invalid GCP secret version '${version}'. Use 'latest' or a numeric version`,
        'secretVersion'
      );
    }
  }

  /**
   * Resolve configuration with defaults
   */
  private resolveConfig(config: GcpSecretManagerConfig): GcpSecretManagerConfig {
    return {
      projectId: config.projectId,
      credentialsPath: config.credentialsPath ?? '',
      kmsKeyLocation: config.kmsKeyLocation ?? 'global',
      kmsKeyRingId: config.kmsKeyRingId ?? 'vault-keys',
      kmsKeyId: config.kmsKeyId ?? 'vault-key',
      enableTracing: config.enableTracing ?? true,
      enableCache: config.enableCache ?? false,
      cacheTtl: config.cacheTtl ?? 300000, // 5 minutes
      enableRetry: config.enableRetry ?? true,
      maxRetries: config.maxRetries ?? 5,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 100,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 10000
    };
  }

  /**
   * Initialize Secret Manager client and cache
   */
  private initializeClients(): void {
    // Set credentials path if provided
    if (this.config.credentialsPath) {
      process.env['GOOGLE_APPLICATION_CREDENTIALS'] = this.config.credentialsPath;
    }

    // Initialize Secret Manager client
    this.client = new SecretManagerServiceClient();

    // Initialize cache if enabled
    if (this.enableCache) {
      this.cache = new Cache<string>({
        ttl: this.config.cacheTtl!,
        maxSize: 1000
      });
    }

    // Lazy-load KMS client (only create when needed)
    // This allows the provider to work without KMS credentials if only using Secret Manager
  }

  /**
   * Get the KMS client (lazy-loaded and cached)
   */
  private getKmsClient(): KeyManagementServiceClient {
    if (!this.kmsClient) {
      this.kmsClient = new KeyManagementServiceClient();
    }
    return this.kmsClient;
  }

  /**
   * Get the full KMS key name
   */
  private getKmsKeyName(): string {
    const kmsClient = this.getKmsClient();
    return kmsClient.cryptoKeyPath(
      this.config.projectId!,
      this.config.kmsKeyLocation!,
      this.config.kmsKeyRingId!,
      this.config.kmsKeyId!
    );
  }

  /**
   * Execute with retry if enabled
   */
  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enableRetry) {
      return fn();
    }

    return retry(fn, {
      maxAttempts: this.config.maxRetries,
      baseDelayMs: this.config.retryBaseDelayMs,
      maxDelayMs: this.config.retryMaxDelayMs,
      isRetryable: isTransientError,
      onRetry: (attempt, error, delay) => {
        // Log retry attempt
        if (this.enableTracing) {
          console.warn(
            `[GcpSecretManager] Retry attempt ${attempt} for ${operation} after ${delay}ms`,
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
      }
    });
  }

  /**
   * Invalidate cache for a specific secret
   */
  private invalidateCache(secretName: string): void {
    if (this.cache) {
      this.cache.delete(createCacheKey('secret', secretName));
    }
  }

  /**
   * Get a secret value (with optional version support)
   *
   * @param name - Secret name (can include version suffix like "my-secret:2")
   * @returns Secret value
   * @throws SecretNotFoundError if secret doesn't exist
   *
   * @example Retrieving a database password
   * ```typescript
   * const dbPassword = await provider.getSecret('database/password');
   * ```
   *
   * @example Retrieving a specific version
   * ```typescript
   * const secretV2 = await provider.getSecret('api-key:2');
   * ```
   */
  protected async getSecretImpl(name: string): Promise<string> {
    // Parse secret name and version
    let secretName = name;
    let version = 'latest';

    if (name.includes(':')) {
      const parts = name.split(':');
      secretName = parts[0]!;
      version = parts[1]!;
    }

    this.validateGcpSecretId(secretName);
    this.validateGcpVersion(version);

    // Check cache first
    if (this.cache && version === 'latest') {
      const cachedValue = this.cache.get(createCacheKey('secret', secretName));
      if (cachedValue !== undefined) {
        return cachedValue;
      }
    }

    try {
      const result = await this.withRetry('getSecret', async () => {
        const [versionResponse] = await this.client.accessSecretVersion({
          name: `projects/${this.config.projectId!}/secrets/${secretName}/versions/${version}`
        });

        if (!versionResponse.payload?.data) {
          throw new SecretNotFoundError(secretName);
        }

        return versionResponse.payload.data.toString();
      });

      // Cache the result
      if (this.cache && version === 'latest') {
        this.cache.set(createCacheKey('secret', secretName), result);
      }

      return result;
    } catch (error) {
      if (error instanceof SecretNotFoundError) {
        throw error;
      }

      // Check for GCP NOT_FOUND error
      if (typeof error === 'object' && error !== null) {
        const gcpError = error as { code?: number };
        if (gcpError.code === GcpErrorCode.NOT_FOUND) {
          throw new SecretNotFoundError(secretName);
        }
      }

      throw new SecretOperationError('getSecret', `Failed to get secret '${secretName}'`, error);
    }
  }

  /**
   * Set a secret value
   *
   * Creates a new secret if it doesn't exist, or adds a new version if it does.
   *
   * @param name - Secret name
   * @param value - Secret value
   *
   * @example Creating or updating a secret
   * ```typescript
   * // This creates the secret if it doesn't exist,
   * // or adds a new version if it does
   * await provider.setSecret('database/password', 'new-secure-password');
   * ```
   */
  protected async setSecretImpl(name: string, value: string): Promise<void> {
    this.validateGcpSecretId(name);
    try {
      await this.withRetry('setSecret', async () => {
        try {
          // Try to create the secret
          await this.client.createSecret({
            parent: `projects/${this.config.projectId!}`,
            secretId: name,
            secret: {
              replication: { automatic: {} }
            }
          });
        } catch (error) {
          // If secret already exists, that's fine - proceed to add version
          if (typeof error === 'object' && error !== null) {
            const gcpError = error as { code?: number };
            if (gcpError.code !== GcpErrorCode.ALREADY_EXISTS) {
              throw error;
            }
          } else {
            throw error;
          }
        }

        // Add a new version with the secret value
        await this.client.addSecretVersion({
          parent: `projects/${this.config.projectId!}/secrets/${name}`,
          payload: { data: Buffer.from(value) }
        });
      });

      // Invalidate cache for this secret
      this.invalidateCache(name);
    } catch (error) {
      if (error instanceof SecretOperationError) {
        throw error;
      }

      throw new SecretOperationError('setSecret', `Failed to set secret '${name}'`, error);
    }
  }

  /**
   * Delete a secret
   *
   * @param name - Secret name
   *
   * @example Deleting a secret
   * ```typescript
   * await provider.deleteSecret('deprecated/api-key');
   * ```
   */
  protected async deleteSecretImpl(name: string): Promise<void> {
    this.validateGcpSecretId(name);
    try {
      await this.withRetry('deleteSecret', async () => {
        await this.client.deleteSecret({
          name: `projects/${this.config.projectId!}/secrets/${name}`
        });
      });

      // Invalidate cache for this secret
      this.invalidateCache(name);
    } catch (error) {
      throw new SecretOperationError('deleteSecret', `Failed to delete secret '${name}'`, error);
    }
  }

  /**
   * Generate a data key using KMS
   *
   * Generates a random 32-byte data key and encrypts it with KMS.
   *
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Object with plaintext and ciphertext buffers
   *
   * @example Generating a data key for envelope encryption
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   *
   * // Use plaintext key to encrypt local data
   * const encryptedData = encryptWithAES(data, plaintext);
   *
   * // Store ciphertext (encrypted key) alongside the encrypted data
   * await storeEncryptedData({ encryptedData, encryptedKey: ciphertext });
   *
   * // Later, decrypt the data key with KMS to decrypt the data
   * ```
   */
  protected async generateDataKeyImpl(
    _keyId?: string
  ): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    try {
      const result = await this.withRetry('generateDataKey', async () => {
        const kmsClient = this.getKmsClient();
        const keyName = this.getKmsKeyName();

        // Generate a random data key
        const plaintext = randomBytes(32);

        // Encrypt the data key with KMS
        const [response] = await kmsClient.encrypt({
          name: keyName,
          plaintext: plaintext
        });

        if (!response.ciphertext) {
          throw new SecretCryptoError(
            'generateDataKey',
            'Data key encryption failed: no ciphertext returned'
          );
        }

        return {
          plaintext,
          ciphertext: response.ciphertext as Buffer
        };
      });

      return result;
    } catch (error) {
      if (error instanceof SecretCryptoError) {
        throw error;
      }

      throw new SecretCryptoError('generateDataKey', 'Failed to generate data key', error);
    }
  }

  /**
   * Encrypt plaintext using KMS
   *
   * @param plaintext - Data to encrypt
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Base64-encoded ciphertext
   *
   * @example Encrypting sensitive data
   * ```typescript
   * const ciphertext = await provider.encrypt('my-sensitive-data');
   * // Store ciphertext safely - can only be decrypted with KMS access
   * ```
   */
  protected async encryptImpl(plaintext: string, _keyId?: string): Promise<string> {
    try {
      const result = await this.withRetry('encrypt', async () => {
        const kmsClient = this.getKmsClient();
        const keyName = this.getKmsKeyName();

        const [response] = await kmsClient.encrypt({
          name: keyName,
          plaintext: Buffer.from(plaintext)
        });

        if (!response.ciphertext) {
          throw new SecretCryptoError('encrypt', 'Encryption failed: no ciphertext returned');
        }

        return (response.ciphertext as Buffer).toString('base64');
      });

      return result;
    } catch (error) {
      if (error instanceof SecretCryptoError) {
        throw error;
      }

      throw new SecretCryptoError('encrypt', 'Failed to encrypt data', error);
    }
  }

  /**
   * Decrypt ciphertext using KMS
   *
   * @param ciphertext - Base64-encoded ciphertext
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Decrypted plaintext
   *
   * @example Decrypting previously encrypted data
   * ```typescript
   * const plaintext = await provider.decrypt(storedCiphertext);
   * // plaintext contains the original data
   * ```
   */
  protected async decryptImpl(ciphertext: string, _keyId?: string): Promise<string> {
    try {
      const result = await this.withRetry('decrypt', async () => {
        const kmsClient = this.getKmsClient();
        const keyName = this.getKmsKeyName();

        const [response] = await kmsClient.decrypt({
          name: keyName,
          ciphertext: Buffer.from(ciphertext, 'base64')
        });

        if (!response.plaintext) {
          throw new SecretCryptoError('decrypt', 'Decryption failed: no plaintext returned');
        }

        return (response.plaintext as Buffer).toString();
      });

      return result;
    } catch (error) {
      if (error instanceof SecretCryptoError) {
        throw error;
      }

      throw new SecretCryptoError('decrypt', 'Failed to decrypt data', error);
    }
  }

  /**
   * Rotate a secret by creating a new version
   *
   * Note: This implementation adds a timestamp to the existing value.
   * In production, you would implement proper rotation logic here.
   *
   * @param key - Secret name
   *
   * @example Rotating a secret
   * ```typescript
   * // Rotate a database password (creates a new version)
   * await provider.rotateSecret('database/password');
   *
   * // After rotation, getSecret will return the new value
   * const newPassword = await provider.getSecret('database/password');
   * ```
   */
  protected async rotateSecretImpl(key: string): Promise<void> {
    this.validateGcpSecretId(key);
    try {
      await this.withRetry('rotateSecret', async () => {
        // Get the current secret value
        let currentValue: string;
        try {
          currentValue = await this.getSecretImpl(key);
        } catch (error) {
          if (error instanceof SecretNotFoundError) {
            throw new SecretRotationError(
              key,
              new Error(`Cannot rotate non-existent secret: ${key}`)
            );
          }
          throw error;
        }

        // Add a new version with updated value
        // Note: In production, you'd want to generate a new value here
        const rotatedValue = `${currentValue}\nRotated at: ${new Date().toISOString()}`;

        await this.client.addSecretVersion({
          parent: `projects/${this.config.projectId!}/secrets/${key}`,
          payload: { data: Buffer.from(rotatedValue) }
        });
      });

      // Invalidate cache for this secret
      this.invalidateCache(key);
    } catch (error) {
      if (error instanceof SecretRotationError) {
        throw error;
      }

      throw new SecretRotationError(key, error);
    }
  }

  /**
   * List all versions of a secret
   *
   * @param secretName - Secret name
   * @returns Array of version information
   *
   * @example Listing secret versions
   * ```typescript
   * const versions = await provider.listVersions('database/password');
   * // versions: [{ name: '.../versions/1', state: 'ENABLED' }, ...]
   *
   * for (const version of versions) {
   *   console.log(`Version: ${version.name}, State: ${version.state}`);
   * }
   * ```
   */
  async listVersions(
    secretName: string
  ): Promise<Array<{ name: string | undefined; state: string }>> {
    this.validateGcpSecretId(secretName);
    try {
      const [versions] = await this.withRetry('listVersions', async () => {
        return await this.client.listSecretVersions({
          parent: `projects/${this.config.projectId!}/secrets/${secretName}`
        });
      });

      return (
        versions?.map((version) => ({
          name: version.name ?? undefined,
          state: String(version.state ?? 'UNKNOWN')
        })) ?? []
      );
    } catch (error) {
      throw new SecretOperationError(
        'listVersions',
        `Failed to list versions for secret '${secretName}'`,
        error
      );
    }
  }

  /**
   * Health check for Secret Manager and KMS
   *
   * Checks Secret Manager accessibility and KMS if configured.
   * Initializes KMS client during health check if KMS config exists.
   *
   * @returns True if services are accessible
   *
   * @example Using health check in a NestJS health controller
   * ```typescript
   * @Controller('health')
   * export class HealthController {
   *   constructor(
   *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: ISecretProvider,
   *   ) {}
   *
   *   @Get()
   *   async check() {
   *     const secretsHealthy = await this.secrets.healthCheck?.() ?? true;
   *     return { secrets: secretsHealthy ? 'healthy' : 'unhealthy' };
   *   }
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if we can access Secret Manager
      await this.client.listSecrets({
        parent: `projects/${this.config.projectId!}`
      });

      // If KMS config exists, initialize KMS client and check KMS health
      // This ensures KMS credentials are valid even if the client wasn't used yet
      if (this.config.kmsKeyId && this.config.kmsKeyRingId && this.config.kmsKeyLocation) {
        const kmsClient = this.getKmsClient();
        const keyRingPath = kmsClient.keyRingPath(
          this.config.projectId!,
          this.config.kmsKeyLocation,
          this.config.kmsKeyRingId
        );

        await kmsClient.getKeyRing({ name: keyRingPath });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the secret cache
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.cache) {
      this.cache.destroy();
    }

    // Close KMS client if initialized
    if (this.kmsClient) {
      await this.kmsClient.close();
    }

    // Close Secret Manager client
    await this.client.close();
  }
}
