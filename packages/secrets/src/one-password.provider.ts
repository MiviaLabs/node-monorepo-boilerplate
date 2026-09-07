import { exec } from 'child_process';
import { promisify } from 'util';

import type { OnePasswordConfig } from './config/interfaces';
import { SecretOperationError, SecretProviderConfigError } from './errors';
import { SecretProvider } from './secret-provider.interface';

const execAsync = promisify(exec);

/**
 * 1Password Secret Provider
 *
 * Provides secret management using 1Password CLI (op) with service account authentication.
 * Uses the 1Password CLI to retrieve secrets from vaults.
 *
 * Features:
 * - Service account authentication
 * - In-memory caching with configurable TTL
 * - Multiple secret retrieval formats (field-based and notes-based)
 * - Automatic cache cleanup
 *
 * Prerequisites:
 * - 1Password CLI (op) must be installed
 * - Service account token with appropriate vault access
 *
 * @example Basic initialization
 * ```typescript
 * import { OnePasswordProvider } from '@package/secrets';
 *
 * const provider = new OnePasswordProvider({
 *   token: process.env['OP_SERVICE_ACCOUNT_TOKEN'],
 *   vaultId: 'Production',
 *   itemName: 'API Keys',
 * });
 *
 * // Retrieve a secret
 * const apiKey = await provider.getSecret('STRIPE_API_KEY');
 * ```
 *
 * @example Using with NestJS dependency injection
 * ```typescript
 * import { Injectable, Inject } from '@nestjs/common';
 * import { SECRET_PROVIDER_TOKEN, SecretProvider } from '@package/secrets';
 *
 * @Injectable()
 * export class PaymentService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
 *   ) {}
 *
 *   async getStripeKey(): Promise<string> {
 *     return this.secrets.getSecret('STRIPE_API_KEY');
 *   }
 * }
 * ```
 *
 * @example Configuring with custom cache TTL
 * ```typescript
 * const provider = new OnePasswordProvider({
 *   token: process.env['OP_SERVICE_ACCOUNT_TOKEN'],
 *   vaultId: 'Production',
 *   itemName: 'Runtime Secrets',
 *   cacheTtl: 600000, // 10 minutes
 * });
 * ```
 */
export class OnePasswordProvider implements SecretProvider {
  private readonly token: string;
  private readonly vaultId: string;
  private readonly itemName: string;
  private readonly fieldName: string;
  private readonly config: Required<
    Pick<OnePasswordConfig, 'token' | 'vaultId' | 'itemName' | 'fieldName' | 'cacheTtl'>
  > &
    OnePasswordConfig;
  private cache = new Map<string, { value: string; expiry: number }>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: OnePasswordConfig = {}) {
    // Get raw values first (before defaults)
    const rawToken = config.token ?? process.env['OP_SERVICE_ACCOUNT_TOKEN'];
    const rawVaultId = config.vaultId ?? process.env['OP_VAULT_ID'];
    const rawItemName = config.itemName ?? process.env['OP_ITEM_NAME'];
    const rawFieldName = config.fieldName ?? process.env['OP_FIELD_NAME'];

    // Validate required token
    if (!rawToken || rawToken.trim() === '') {
      throw new Error('OP_SERVICE_ACCOUNT_TOKEN is required for 1Password provider');
    }

    // Set values with defaults
    this.token = rawToken.trim();
    // Apply defaults before shell-safe validation so the fixed defaults
    // ('runtime-secrets', 'Runtime Secrets', 'notes') are also checked.
    const resolvedVaultId = rawVaultId && rawVaultId.trim() !== '' ? rawVaultId : 'runtime-secrets';
    const resolvedItemName =
      rawItemName && rawItemName.trim() !== '' ? rawItemName : 'Runtime Secrets';
    const resolvedFieldName = rawFieldName && rawFieldName.trim() !== '' ? rawFieldName : 'notes';

    // These values are interpolated unescaped into shell commands via
    // child_process.exec, so reject anything that could break out of the
    // surrounding quoting and execute arbitrary commands.
    this.validateShellSafeIdentifier('vaultId', resolvedVaultId);
    this.validateShellSafeIdentifier('itemName', resolvedItemName);
    this.validateShellSafeIdentifier('fieldName', resolvedFieldName);

    this.vaultId = resolvedVaultId;
    this.itemName = resolvedItemName;
    this.fieldName = resolvedFieldName;

    this.config = {
      token: this.token,
      vaultId: this.vaultId,
      itemName: this.itemName,
      fieldName: this.fieldName,
      cacheTtl: config.cacheTtl ?? 300_000, // 5 minutes
      connectHost: config.connectHost ?? 'http://localhost:8080'
    };

    // Optional: Validate token format
    if (!this.config.token.startsWith('op_')) {
      console.warn(
        'Warning: OP_SERVICE_ACCOUNT_TOKEN does not appear to be a valid 1Password service account token'
      );
    }

    // Schedule periodic cleanup of expired cache entries (every 5 minutes)
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000
    );

    this.cleanupTimer.unref?.();
  }

  /**
   * Get a secret value from 1Password
   *
   * @param key - Secret key/field name in 1Password
   * @returns Secret value
   * @throws Error if secret doesn't exist or access is denied
   *
   * @example Retrieving a secret
   * ```typescript
   * const stripeKey = await provider.getSecret('STRIPE_API_KEY');
   * ```
   *
   * @example Using in a service
   * ```typescript
   * @Injectable()
   * export class ConfigService {
   *   constructor(
   *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
   *   ) {}
   *
   *   async getDatabaseUrl(): Promise<string> {
   *     const password = await this.secrets.getSecret('DATABASE_PASSWORD');
   *     return `postgresql://user:${password}@localhost:5432/db`;
   *   }
   * }
   * ```
   */
  async getSecret(key: string): Promise<string> {
    this.validateSecretName(key);
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.value;
    }

    const env = { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: this.config.token };

    // Try field-based first (correct CLI syntax)
    try {
      const command = `op item get "${this.config.itemName}" --vault "${this.config.vaultId}" --fields label="${key}"`;
      const { stdout } = await execAsync(command, { env });
      const value = stdout.trim();

      // Cache the result
      this.cache.set(key, { value, expiry: Date.now() + this.config.cacheTtl });
      return value;
    } catch {
      // Fall back to text-based format (KEY=VALUE pairs in a specific field)
      try {
        const command = `op item get "${this.config.itemName}" --vault "${this.config.vaultId}" --format json`;
        const { stdout } = await execAsync(command, { env });
        const item = JSON.parse(stdout);

        // First try: Look for the specified field name (default: 'notes')
        const targetField = item.fields?.find(
          (f: { label?: string; value?: string }) => f.label === this.config.fieldName
        );
        if (targetField?.value) {
          const lines = targetField.value.split('\n');
          for (const line of lines) {
            if (line.startsWith(`${key}=`)) {
              const value = line.substring(key.length + 1);
              // Cache the result
              this.cache.set(key, { value, expiry: Date.now() + this.config.cacheTtl });
              return value;
            }
          }
        }

        // Second try: Search all fields for KEY=VALUE pairs (fallback)
        for (const field of item.fields || []) {
          if (field.value && field.value.includes('\n')) {
            const lines = field.value.split('\n');
            for (const line of lines) {
              if (line.startsWith(`${key}=`)) {
                const value = line.substring(key.length + 1);
                // Cache the result
                this.cache.set(key, { value, expiry: Date.now() + this.config.cacheTtl });
                return value;
              }
            }
          }
        }

        throw new Error(`Secret ${key} not found in 1Password`);
      } catch (error: unknown) {
        // Sanitize error message to avoid exposing secret references
        if (error instanceof Error) {
          throw new Error(
            `Failed to fetch secret from 1Password: ${error.message.replace(key, '[REDACTED]')}`
          );
        }
        throw new Error(`Failed to fetch secret from 1Password`);
      }
    }
  }

  /**
   * Set a secret value in 1Password
   *
   * @param key - Secret key/field name in 1Password
   * @param value - Secret value to store
   *
   * @example Updating a secret
   * ```typescript
   * await provider.setSecret('API_KEY', 'new-api-key-value');
   * ```
   */
  async setSecret(key: string, value: string): Promise<void> {
    this.validateSecretName(key);
    const env = {
      ...process.env,
      OP_SERVICE_ACCOUNT_TOKEN: this.config.token,
      OP_SECRET_VALUE: value // Pass value via environment variable to avoid CLI exposure
    };
    // Use environment variable in command to avoid exposing secret value in process list
    const command = `op item edit "${this.config.itemName}" --vault "${this.config.vaultId}" ${key}="$OP_SECRET_VALUE"`;
    await execAsync(command, { env });

    // Invalidate cache for this key
    this.cache.delete(key);
  }

  /**
   * Delete a secret from 1Password
   *
   * Note: This operation is not supported via the 1Password CLI.
   * Use the 1Password app or API directly for deletion.
   *
   * @param key - Secret key/field name in 1Password
   * @throws Error always - operation not supported via CLI
   */
  async deleteSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    throw new SecretOperationError(
      'deleteSecret',
      'Secret deletion not supported via 1Password CLI. Use 1Password app or API.'
    );
  }

  /**
   * Generate a data key
   *
   * Note: 1Password does not support key generation.
   * Use a dedicated KMS provider (GCP, HashiCorp) for this operation.
   *
   * @throws Error always - operation not supported by 1Password
   */
  async generateDataKey(_keyId?: string): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    // keyId parameter accepted for interface compatibility but unused
    throw new SecretOperationError(
      'generateDataKey',
      'Data key generation not supported. Use Dev provider or external KMS.'
    );
  }

  /**
   * Encrypt plaintext
   *
   * Note: 1Password does not support encryption.
   * Use a dedicated KMS provider (GCP, HashiCorp) for this operation.
   *
   * @param _plaintext - Data to encrypt (unused)
   * @param _keyId - Key ID (unused)
   * @throws Error always - operation not supported by 1Password
   */
  async encrypt(_plaintext: string, _keyId?: string): Promise<string> {
    // keyId parameter accepted for interface compatibility but unused
    throw new SecretOperationError(
      'encrypt',
      'Encryption not supported. Use Dev provider or external KMS.'
    );
  }

  /**
   * Decrypt ciphertext
   *
   * Note: 1Password does not support decryption.
   * Use a dedicated KMS provider (GCP, HashiCorp) for this operation.
   *
   * @param _ciphertext - Data to decrypt (unused)
   * @param _keyId - Key ID (unused)
   * @throws Error always - operation not supported by 1Password
   */
  async decrypt(_ciphertext: string, _keyId?: string): Promise<string> {
    // keyId parameter accepted for interface compatibility but unused
    throw new SecretOperationError(
      'decrypt',
      'Decryption not supported. Use Dev provider or external KMS.'
    );
  }

  /**
   * Rotate a secret
   *
   * Note: Secret rotation is not supported via the 1Password CLI.
   * Use the 1Password app or API directly for rotation.
   *
   * @param key - Secret key/field name in 1Password
   * @throws Error always - operation not supported via CLI
   */
  async rotateSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    throw new SecretOperationError(
      'rotateSecret',
      'Secret rotation not supported via 1Password CLI. Use 1Password app or API.'
    );
  }

  /**
   * Remove expired entries from the cache
   *
   * This method is called periodically by the cleanup timer to prevent memory leaks.
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();

    const keysToDelete: string[] = [];
    this.cache.forEach((value, key) => {
      if (now >= value.expiry) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
    });
  }

  /**
   * Clear the in-memory secret cache
   *
   * @example Clearing cache after a rotation
   * ```typescript
   * // After rotating secrets externally
   * provider.clearCache();
   *
   * // Next getSecret call will fetch fresh value from 1Password
   * const newValue = await provider.getSecret('API_KEY');
   * ```
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Health check for 1Password provider
   *
   * Verifies that the 1Password CLI is accessible and authenticated.
   *
   * @returns true if 1Password CLI is accessible, false otherwise
   *
   * @example Using health check in a NestJS health controller
   * ```typescript
   * @Controller('health')
   * export class HealthController {
   *   constructor(
   *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: SecretProvider,
   *   ) {}
   *
   *   @Get()
   *   async check() {
   *     const opHealthy = await this.secrets.healthCheck?.() ?? true;
   *     return { onePassword: opHealthy ? 'healthy' : 'unhealthy' };
   *   }
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    try {
      const env = { ...process.env, OP_SERVICE_ACCOUNT_TOKEN: this.config.token };
      // Try to list vaults to verify connectivity
      await execAsync('op vault list --format json', { env });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // Clear the cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Clear the cache
    this.cache.clear();
  }

  /**
   * Validate an identifier that is interpolated unescaped into a shell
   * command via child_process.exec. Rejects characters that have special
   * meaning to /bin/sh (or cmd.exe on Windows) so that an attacker cannot
   * break out of the surrounding `"..."` quoting and execute arbitrary
   * commands.
   */
  private validateShellSafeIdentifier(field: string, value: string): void {
    if (value.length === 0 || value.length > 256) {
      throw new SecretProviderConfigError(
        `${field} must be between 1 and 256 characters, got ${value.length}`,
        field
      );
    }
    // Disallow shell metacharacters and quoting characters that would let
    // the value break out of the surrounding `"..."` argument.
    // Allow letters, digits, hyphen, underscore, dot, slash, and space.
    // Forbidden: " ' ` $ \ ; & | > < ( ) { } * ? ~ ! # \n \r \t
    const forbidden = /["'`$\\;&|><()>{}*?~!#\n\r\t\v\f\0]/;
    if (forbidden.test(value)) {
      throw new SecretProviderConfigError(
        `${field} contains shell metacharacters. Only letters, digits, hyphen (-), underscore (_), period (.), forward slash (/), and space are allowed`,
        field
      );
    }
  }

  /**
   * Validate secret name to prevent injection attacks
   */
  private validateSecretName(key: string): void {
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
