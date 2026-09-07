/**
 * Mock KMS Provider for Testing
 *
 * Simulates a KMS provider without external dependencies.
 * Uses actual AES-256-GCM for realistic testing behavior.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import type { CipherGCM, DecipherGCM } from 'crypto';

import { DataKeyGenerationError, KeyNotFoundError } from '../errors';
import { IDataKeyResult, BaseKmsProvider, IKeyInfo } from '../providers/kms-provider.interface';

/**
 * Mock KMS provider options
 */
export interface MockKmsProviderOptions {
  /** Simulate latency in ms */
  latency?: number;
  /** Simulate failure rate (0-1) */
  failureRate?: number;
  /** Provider name */
  name?: string;
}

/**
 * Mock KMS provider for testing
 *
 * Uses AES-256-GCM encryption to simulate real KMS behavior
 */
export class MockKmsProvider extends BaseKmsProvider {
  private readonly latency: number;
  private readonly failureRate: number;
  private readonly keys = new Map<string, Buffer>();

  constructor(options: MockKmsProviderOptions = {}) {
    super(options.name ?? 'mock-kms');
    this.latency = options.latency ?? 0;
    this.failureRate = options.failureRate ?? 0;
  }

  private async delay(): Promise<void> {
    if (this.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
    }
  }

  private shouldFail(): boolean {
    return Math.random() < this.failureRate;
  }

  // generateKeyId is now inline in getKeyInfo

  private getOrCreateKey(keyId: string): Buffer {
    if (!this.keys.has(keyId)) {
      this.keys.set(keyId, randomBytes(32));
    }
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Key '${keyId}' not found`);
    }
    return key;
  }

  async encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      await this.delay();

      if (this.shouldFail()) {
        throw new Error('Mock encryption failure');
      }

      const actualKeyId = keyId ?? 'default';
      const key = this.getOrCreateKey(actualKeyId);

      // Use AES-256-GCM for realistic mock behavior
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv) as CipherGCM;

      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // Return IV + authTag + ciphertext (KMS typically returns just ciphertext, but we need IV and tag for decrypt)
      const result = Buffer.concat([iv, authTag, encrypted]);

      this.recordEncrypt(attributes, Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordEncrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  async decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      await this.delay();

      if (this.shouldFail()) {
        throw new Error('Mock decryption failure');
      }

      const actualKeyId = keyId ?? 'default';
      const key = this.getOrCreateKey(actualKeyId);

      // Extract IV, authTag, and encrypted data
      const iv = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(12, 28);
      const encrypted = ciphertext.subarray(28);

      const decipher = createDecipheriv('aes-256-gcm', key, iv) as DecipherGCM;
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      this.recordDecrypt(attributes, Date.now() - startTime);
      return decrypted;
    } catch (error) {
      this.recordDecrypt({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Generates a new data encryption key (DEK) for envelope encryption.
   *
   * Creates a random 32-byte (256-bit) plaintext key and encrypts it
   * with the specified master key (or default key).
   *
   * @param keyId - Optional master key ID to encrypt the DEK with.
   *                Defaults to 'default' if not specified.
   * @returns Promise resolving to IDataKeyResult containing:
   *          - `plaintext`: 32-byte Buffer for local encryption
   *          - `ciphertext`: Encrypted DEK for storage
   * @throws {DataKeyGenerationError} If key generation fails (simulated by failureRate)
   */
  async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      await this.delay();

      if (this.shouldFail()) {
        throw new DataKeyGenerationError(new Error('Mock data key generation failure'));
      }

      const actualKeyId = keyId ?? 'default';
      const plaintext = randomBytes(32);

      // Encrypt the data key with the master key
      const ciphertext = await this.encrypt(plaintext, actualKeyId);

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return { plaintext, ciphertext };
    } catch (error) {
      this.recordGenerateDataKey({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  override async isAvailable(): Promise<boolean> {
    return true;
  }

  override async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Rewrap an encrypted data key (re-encrypt with a new key)
   *
   * This simulates the KMS rewrap operation which decrypts with the source key
   * and re-encrypts with the new key without exposing the plaintext.
   */
  override async rewrap(
    ciphertext: Buffer,
    keyId?: string,
    sourceKeyId?: string
  ): Promise<{ ciphertext: Buffer }> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      await this.delay();

      if (this.shouldFail()) {
        throw new Error('Mock rewrap failure');
      }

      // Decrypt with the source key (or 'default' if not specified)
      const decrypted = await this.decrypt(ciphertext, sourceKeyId ?? 'default');

      // Encrypt with the new key
      const newKeyId = keyId ?? 'default';
      const reencrypted = await this.encrypt(decrypted, newKeyId);

      this.recordRewrap(attributes, Date.now() - startTime);
      return { ciphertext: reencrypted };
    } catch (error) {
      this.recordRewrap({ ...attributes, error: String(error) }, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Retrieves metadata and status information for a key.
   *
   * Returns information about a key that has been created via
   * `createTestKey()` or auto-created during encrypt/decrypt operations.
   *
   * @param keyId - Optional key identifier. Defaults to 'default' if not specified.
   * @returns Promise resolving to IKeyInfo containing:
   *          - `keyId`: The key identifier
   *          - `version`: Key version ('1' for mock)
   *          - `createdAt`: Creation timestamp
   *          - `enabled`: Always true for mock
   *          - `purpose`: 'encrypt/decrypt'
   *          - `metadata`: Provider info including mock indicator
   * @throws {KeyNotFoundError} If the key has not been created
   */
  override async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    const actualKeyId = keyId ?? 'default';

    if (!this.keys.has(actualKeyId)) {
      throw new KeyNotFoundError(actualKeyId);
    }

    return {
      keyId: actualKeyId,
      version: '1',
      createdAt: new Date(),
      enabled: true,
      purpose: 'encrypt/decrypt',
      metadata: {
        provider: this.name,
        mock: true
      }
    };
  }

  /**
   * Create a test key
   *
   * @param keyId - Key identifier to create
   */
  createTestKey(keyId: string): void {
    this.keys.set(keyId, randomBytes(32));
  }

  /**
   * Clear all keys
   */
  clearKeys(): void {
    this.keys.clear();
  }
}

/**
 * Create a mock KMS provider factory
 *
 * @param options - Optional mock provider configuration
 * @returns New MockKmsProvider instance
 */
export function createMockKmsProvider(options?: MockKmsProviderOptions): MockKmsProvider {
  return new MockKmsProvider(options);
}
