/**
 * Mock secret provider for testing
 */

import { MockProvider, type MockProviderOptions } from '@package/core';

import { SecretProviderConfigError } from './errors';
import type { SecretProvider } from './secret-provider.interface';

/**
 * Mock secret provider options
 */
export interface MockSecretProviderOptions extends MockProviderOptions {
  /** Initial secrets to populate the mock with */
  initialSecrets?: Record<string, string>;
  /** Whether to throw on access to non-existent secrets */
  strictMode?: boolean;
}

/**
 * Mock secret provider for testing
 *
 * Simulates a secret provider without external dependencies.
 * Supports latency simulation, failure rates, and health management.
 *
 * @example
 * ```typescript
 * const mock = new MockSecretProvider({
 *   latency: 100,
 *   failureRate: 0.1,
 *   initialSecrets: { 'api-key': 'secret-value' },
 * });
 *
 * await mock.setSecret('test-key', 'test-value');
 * const value = await mock.getSecret('test-key');
 * ```
 */
export class MockSecretProvider extends MockProvider implements SecretProvider {
  private readonly secrets: Map<string, string>;

  constructor(options: MockSecretProviderOptions = {}) {
    super(options);
    this.secrets = new Map(Object.entries(options.initialSecrets ?? {}));
  }

  /**
   * Get provider name
   */
  protected getProviderName(): string {
    return 'MockSecretProvider';
  }

  /**
   * Validate configuration
   */
  protected validateConfig(): void {
    // No specific validation needed for mock
  }

  /**
   * Get a secret value
   */
  async getSecret(key: string): Promise<string> {
    this.validateSecretName(key);
    return this.executeOperation('getSecret', async () => {
      const value = this.secrets.get(key);
      if (value === undefined) {
        throw new Error(`Secret '${key}' not found`);
      }
      return value;
    });
  }

  /**
   * Set a secret value
   */
  async setSecret(key: string, value: string): Promise<void> {
    this.validateSecretName(key);
    return this.executeOperation('setSecret', async () => {
      this.secrets.set(key, value);
    });
  }

  /**
   * Delete a secret
   */
  async deleteSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    return this.executeOperation('deleteSecret', async () => {
      if (!this.secrets.has(key)) {
        throw new Error(`Secret '${key}' not found`);
      }
      this.secrets.delete(key);
    });
  }

  /**
   * Generate a data key (mock implementation)
   */
  async generateDataKey(keyId?: string): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    return this.executeOperation('generateDataKey', async () => {
      const plaintext = Buffer.from(`mock-data-key-${keyId ?? 'default'}-${Date.now()}`);
      const ciphertext = Buffer.from(`encrypted-${plaintext.toString()}`);
      return { plaintext, ciphertext };
    });
  }

  /**
   * Encrypt data (mock implementation)
   */
  async encrypt(plaintext: string, keyId?: string): Promise<string> {
    return this.executeOperation('encrypt', async () => {
      return `encrypted:${plaintext}:${keyId ?? 'default'}`;
    });
  }

  /**
   * Decrypt data (mock implementation)
   */
  async decrypt(ciphertext: string, keyId?: string): Promise<string> {
    return this.executeOperation('decrypt', async () => {
      if (!ciphertext.startsWith('encrypted:')) {
        throw new Error('Invalid ciphertext format');
      }
      const parts = ciphertext.split(':');
      if (parts.length < 3) {
        throw new Error('Invalid ciphertext format');
      }
      const providedKeyId = keyId ?? 'default';
      const encryptedKeyId = parts[2];
      if (providedKeyId !== encryptedKeyId) {
        throw new Error('Key ID mismatch');
      }
      const plaintext = parts[1];
      if (!plaintext) {
        throw new Error('Invalid ciphertext format: missing plaintext');
      }
      return plaintext;
    });
  }

  /**
   * Rotate a secret (mock implementation)
   */
  async rotateSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    return this.executeOperation('rotateSecret', async () => {
      if (!this.secrets.has(key)) {
        throw new Error(`Secret '${key}' not found`);
      }
      const currentValue = this.secrets.get(key);
      if (!currentValue) {
        throw new Error(`Secret '${key}' has no value`);
      }
      const rotatedValue = `${currentValue}-rotated-${Date.now()}`;
      this.secrets.set(key, rotatedValue);
    });
  }

  /**
   * Get all secrets (for testing)
   */
  getAllSecrets(): Record<string, string> {
    return Object.fromEntries(this.secrets);
  }

  /**
   * Clear all secrets (for testing)
   */
  clearSecrets(): void {
    this.secrets.clear();
  }

  /**
   * Check if a secret exists
   */
  hasSecret(key: string): boolean {
    return this.secrets.has(key);
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
