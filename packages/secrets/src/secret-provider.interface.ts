import { SecretProviderType } from './config/interfaces';

/**
 * Secret Provider Interface
 *
 * Defines the contract for secret management operations across all providers.
 * Implementations include GCP Secret Manager, HashiCorp Vault, and 1Password.
 *
 * @example Basic secret retrieval
 * ```typescript
 * const dbPassword = await provider.getSecret('database/password');
 * ```
 *
 * @example Using with NestJS dependency injection
 * ```typescript
 * import { Injectable, Inject } from '@nestjs/common';
 * import { SECRET_PROVIDER_TOKEN, ISecretProvider } from '@package/secrets';
 *
 * @Injectable()
 * export class ConfigService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: ISecretProvider,
 *   ) {}
 *
 *   async getConfig(): Promise<AppConfig> {
 *     return {
 *       dbPassword: await this.secrets.getSecret('DB_PASSWORD'),
 *       apiKey: await this.secrets.getSecret('API_KEY'),
 *     };
 *   }
 * }
 * ```
 *
 * @example Encryption and decryption
 * ```typescript
 * // Encrypt sensitive data
 * const ciphertext = await provider.encrypt('sensitive-data');
 *
 * // Store ciphertext in database
 * await db.save({ encryptedValue: ciphertext });
 *
 * // Later, decrypt the data
 * const plaintext = await provider.decrypt(ciphertext);
 * ```
 */
export interface ISecretProvider {
  /**
   * Get a secret value by key
   * @param key - Secret identifier
   * @returns Secret value
   */
  getSecret(key: string): Promise<string>;

  /**
   * Set a secret value
   * @param key - Secret identifier
   * @param value - Secret value to store
   */
  setSecret(key: string, value: string): Promise<void>;

  /**
   * Delete a secret
   * @param key - Secret identifier
   */
  deleteSecret(key: string): Promise<void>;

  /**
   * Generate a data key for envelope encryption
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Object with plaintext and ciphertext buffers
   */
  generateDataKey(keyId?: string): Promise<{ plaintext: Buffer; ciphertext: Buffer }>;

  /**
   * Encrypt plaintext data
   * @param plaintext - Data to encrypt
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Encrypted ciphertext
   */
  encrypt(plaintext: string, keyId?: string): Promise<string>;

  /**
   * Decrypt ciphertext data
   * @param ciphertext - Encrypted data
   * @param keyId - Optional key ID (uses default if not provided)
   * @returns Decrypted plaintext
   */
  decrypt(ciphertext: string, keyId?: string): Promise<string>;

  /**
   * Rotate a secret to a new version
   * @param key - Secret identifier
   */
  rotateSecret(key: string): Promise<void>;

  /**
   * Health check for provider connectivity
   * @returns true if provider is healthy
   */
  healthCheck?(): Promise<boolean>;
}

/**
 * @deprecated Use {@link ISecretProvider} instead. This alias will be removed in a future version.
 */
export type SecretProvider = ISecretProvider;

/**
 * Re-export SecretProviderType from config for backwards compatibility
 *
 * @see {@link SecretProviderType} in config/interfaces.ts for the authoritative enum
 */
export { SecretProviderType };

/**
 * Secret provider configuration options
 *
 * @deprecated Use InfrastructureSecretsConfig from ./config instead
 *
 * **Security Warning:** This interface contains sensitive credential fields.
 * Never log, print, or include these values in error messages, telemetry,
 * or stack traces. Use secure storage and implement regular rotation.
 *
 * @example Legacy configuration
 * ```typescript
 * const options: SecretProviderOptions = {
 *   provider: SecretProviderType.GCP,
 *   projectId: 'my-project',
 * };
 * ```
 */
export interface SecretProviderOptions {
  /** Provider type to use */
  provider?: SecretProviderType;
  /** GCP project ID */
  projectId?: string;
  /** HashiCorp Vault address */
  vaultAddr?: string;
  /**
   * HashiCorp Vault token
   * @security SENSITIVE - Never log or include in error messages
   */
  vaultToken?: string;
  /** HashiCorp Vault AppRole role ID */
  vaultRoleId?: string;
  /**
   * HashiCorp Vault AppRole secret ID
   * @security SENSITIVE - Never log or include in error messages
   */
  vaultSecretId?: string;
  /**
   * 1Password service account token
   * @security SENSITIVE - Never log or include in error messages
   */
  onePasswordToken?: string;
  /** 1Password vault ID */
  onePasswordVaultId?: string;
  /** 1Password item name */
  onePasswordItemName?: string;
  /** 1Password field name */
  onePasswordFieldName?: string;
}
