/**
 * Azure Key Vault Provider
 *
 * Production-grade KMS provider implementing envelope encryption using
 * Microsoft Azure Key Vault.
 *
 * ## Features
 *
 * - **Multiple Credential Types**: Supports DefaultAzureCredential, ClientSecret,
 *   and ManagedIdentity authentication
 * - **Key Versioning**: Supports specific key versions for compliance
 * - **HSM-Backed Keys**: Premium tier supports HSM-protected keys
 * - **Soft Delete**: Key Vault provides soft delete and purge protection
 *
 * ## Authentication
 *
 * Supports three credential types via `credentialType` option:
 *
 * 1. **DefaultAzureCredential** (default): Automatic credential chain that tries
 *    environment variables, managed identity, Azure CLI, etc.
 *
 * 2. **ManagedIdentity**: For Azure VMs, App Service, Functions, AKS.
 *    Optionally specify `clientId` for user-assigned identities.
 *
 * 3. **ClientSecret**: Service principal authentication with
 *    `tenantId`, `clientId`, and `clientSecret`.
 *
 * ## Key URL Format
 *
 * Azure Key Vault keys use the following URL structure:
 * ```
 * https://{vault-name}.vault.azure.net/keys/{key-name}/{version}
 * ```
 *
 * ## Security Considerations
 *
 * - **RBAC**: Use Azure RBAC for fine-grained access control
 * - **Network Rules**: Configure firewall and VNet rules
 * - **Audit Logging**: Enable diagnostic logs for key operations
 * - **Key Rotation**: Use Key Vault's key rotation policy
 *
 * @module encryption/providers/azure-keyvault
 *
 * @example Basic usage with DefaultAzureCredential
 * ```typescript
 * const provider = new AzureKeyVaultProvider({
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   keyName: 'my-encryption-key'
 * });
 *
 * const dataKey = await provider.generateDataKey();
 * ```
 *
 * @example With managed identity (Azure VM, AKS, etc.)
 * ```typescript
 * const provider = new AzureKeyVaultProvider({
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   keyName: 'my-key',
 *   credentialType: AzureCredentialType.MANAGED_IDENTITY,
 *   clientId: 'user-assigned-identity-client-id' // Optional
 * });
 * ```
 *
 * @example With service principal
 * ```typescript
 * const provider = new AzureKeyVaultProvider({
 *   vaultUrl: 'https://my-vault.vault.azure.net',
 *   keyName: 'my-key',
 *   credentialType: AzureCredentialType.CLIENT_SECRET,
 *   tenantId: process.env.AZURE_TENANT_ID,
 *   clientId: process.env.AZURE_CLIENT_ID,
 *   clientSecret: process.env.AZURE_CLIENT_SECRET
 * });
 * ```
 */

import { randomBytes } from 'crypto';

import { RestError } from '@azure/core-rest-pipeline';
import {
  DefaultAzureCredential,
  ClientSecretCredential,
  ManagedIdentityCredential
} from '@azure/identity';
import {
  CryptographyClient,
  KeyClient,
  KnownEncryptionAlgorithms,
  type KeyVaultKey
} from '@azure/keyvault-keys';

import { AzureCredentialType } from '../constants';
import {
  DecryptionOperationError,
  EncryptionOperationError,
  InvalidKmsConfigError,
  KeyNotFoundError
} from '../errors';
import { BaseKmsProvider, IDataKeyResult, IKeyInfo } from './kms-provider.interface';

import type { IAzureKeyVaultProviderOptions } from './factory.types';

/**
 * Microsoft Azure Key Vault provider for envelope encryption.
 *
 * Implements the `IKmsProvider` interface using Azure Key Vault for
 * key encryption key (KEK) operations. Data encryption keys (DEKs) are
 * generated locally using Node.js CSPRNG and wrapped by Key Vault.
 *
 * ## Key Operations
 *
 * | Operation | Implementation |
 * |-----------|----------------|
 * | `encrypt()` | Key Vault CryptographyClient encrypt |
 * | `decrypt()` | Key Vault CryptographyClient decrypt |
 * | `generateDataKey()` | Local CSPRNG + Key Vault wrap |
 * | `rewrap()` | Not implemented (use decrypt + encrypt) |
 * | `getKeyInfo()` | Key Vault getKey API |
 *
 * ## Performance Considerations
 *
 * - Key Vault has rate limits; consider caching encrypted DEKs
 * - Use regional deployments for latency optimization
 * - Premium tier provides higher throughput limits
 *
 * @extends BaseKmsProvider
 *
 * @throws {InvalidKmsConfigError} When vaultUrl is missing
 * @throws {KeyNotFoundError} When the specified key doesn't exist
 */
export class AzureKeyVaultProvider extends BaseKmsProvider {
  /** @internal Key Vault KeyClient for key management operations */
  private keyClient: KeyClient;

  /** @internal CryptographyClient for encrypt/decrypt operations */
  private cryptoClient: CryptographyClient | null = null;

  /**
   * Bug B5b: per-key CryptographyClient cache. ensureCryptoClient() previously
   * allocated a fresh client on every call when an explicit keyId was passed;
   * the default-provider happy path cached only this.cryptoClient. We now
   * maintain an LRU-style map keyed by keyName so tenant-key overrides reuse
   * the same client. Bounded by MAX_CRYPTO_CLIENT_CACHE_SIZE.
   */
  private cryptoClients = new Map<string, CryptographyClient>();
  private static readonly MAX_CRYPTO_CLIENT_CACHE_SIZE = 64;

  /** @internal Cached credential for creating per-call clients */
  private credential: DefaultAzureCredential | ClientSecretCredential | ManagedIdentityCredential;

  /** @internal Provider configuration */
  private config: IAzureKeyVaultProviderOptions;

  /**
   * Creates a new Azure Key Vault provider instance.
   *
   * @param config - Provider configuration options
   * @param config.vaultUrl - Key Vault URL (e.g., 'https://my-vault.vault.azure.net')
   * @param config.keyName - Optional default key name
   * @param config.keyVersion - Optional specific key version
   * @param config.credentialType - Authentication method (default: DefaultAzureCredential)
   * @param config.tenantId - Azure AD tenant ID (for ClientSecret auth)
   * @param config.clientId - Application/managed identity client ID
   * @param config.clientSecret - Application secret (for ClientSecret auth)
   *
   * @throws {InvalidKmsConfigError} When vaultUrl is missing
   *
   * @example
   * ```typescript
   * const provider = new AzureKeyVaultProvider({
   *   vaultUrl: 'https://my-vault.vault.azure.net',
   *   keyName: 'my-key'
   * });
   * ```
   */
  constructor(config: IAzureKeyVaultProviderOptions) {
    super('azure');

    if (!config.vaultUrl) {
      throw new InvalidKmsConfigError('Azure Key Vault requires vaultUrl');
    }

    this.config = config;

    // Initialize credential based on type and store for reuse
    if (config.credentialType === AzureCredentialType.MANAGED_IDENTITY) {
      this.credential = new ManagedIdentityCredential(
        config.clientId !== undefined ? { clientId: config.clientId } : undefined
      );
    } else if (config.credentialType === AzureCredentialType.CLIENT_SECRET) {
      // Validate all required fields for CLIENT_SECRET authentication
      if (!config.tenantId || !config.clientId || !config.clientSecret) {
        const missing = [
          !config.tenantId && 'tenantId',
          !config.clientId && 'clientId',
          !config.clientSecret && 'clientSecret'
        ].filter(Boolean);
        throw new InvalidKmsConfigError(
          `Azure Key Vault CLIENT_SECRET credential type requires: ${missing.join(', ')}`
        );
      }
      this.credential = new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret
      );
    } else {
      this.credential = new DefaultAzureCredential();
    }

    // Initialize KeyClient
    this.keyClient = new KeyClient(config.vaultUrl, this.credential);

    // Initialize CryptoClient if keyName is provided
    if (config.keyName) {
      const keyUrl = this.buildKeyUrl(config.keyName, config.keyVersion);
      this.cryptoClient = new CryptographyClient(keyUrl, this.credential);
    }
  }

  /**
   * Build full key URL from key name and version.
   *
   * Normalizes the vault URL to ensure proper path construction:
   * `https://my-vault.vault.azure.net/keys/{keyName}/{keyVersion?}`
   *
   * @param keyName - The key name
   * @param keyVersion - Optional key version
   * @returns Full key URL for Azure Key Vault operations
   */
  private buildKeyUrl(keyName: string, keyVersion?: string): string {
    // Ensure vaultUrl ends with exactly one '/' before appending 'keys/'
    const baseUrl = this.config.vaultUrl.endsWith('/')
      ? this.config.vaultUrl
      : `${this.config.vaultUrl}/`;
    const version = keyVersion ? `/${keyVersion}` : '';
    return `${baseUrl}keys/${keyName}${version}`;
  }

  /**
   * Ensure crypto client is initialized.
   *
   * Creates a per-call CryptographyClient for the specified key, or returns
   * the default client if no key is specified. Uses the cached credential
   * to honor configured authentication (ClientSecret, ManagedIdentity, etc.).
   *
   * The configured keyVersion is only applied when the keyName matches the
   * default configured key. This prevents incorrectly pinning a version to
   * arbitrary key overrides.
   *
   * @param keyName - Optional key name override; uses default if not specified
   * @returns CryptographyClient for the specified or default key
   * @throws {InvalidKmsConfigError} If no default key configured and keyName not provided
   */
  private ensureCryptoClient(keyName?: string): CryptographyClient {
    if (keyName) {
      // Bug B5b: cache per-keyName so repeated tenant-key overrides reuse
      // the same CryptographyClient (and its internal pipeline) instead
      // of allocating a fresh one on every call.
      const cached = this.cryptoClients.get(keyName);
      if (cached) {
        return cached;
      }
      // Only apply configured keyVersion if the keyName matches the default key.
      // This prevents incorrectly pinning version for arbitrary key overrides.
      const keyVersion = keyName === this.config.keyName ? this.config.keyVersion : undefined;
      const keyUrl = this.buildKeyUrl(keyName, keyVersion);
      const client = new CryptographyClient(keyUrl, this.credential);

      // LRU-style eviction: if the cache is full, drop the oldest entry.
      if (this.cryptoClients.size >= AzureKeyVaultProvider.MAX_CRYPTO_CLIENT_CACHE_SIZE) {
        const oldestKey = this.cryptoClients.keys().next().value;
        if (oldestKey !== undefined) {
          this.cryptoClients.delete(oldestKey);
        }
      }
      this.cryptoClients.set(keyName, client);
      return client;
    }
    if (!this.cryptoClient) {
      throw new InvalidKmsConfigError(
        'No default key configured. Specify keyName in constructor or in each call.'
      );
    }
    return this.cryptoClient;
  }

  /**
   * Bug B5b: release cached CryptographyClient instances. CryptographyClient
   * holds an internal HTTP pipeline; without this lifecycle hook the cache
   * leaks on module reload / config rotation.
   */
  async dispose(): Promise<void> {
    for (const client of this.cryptoClients.values()) {
      // CryptographyClient exposes a `pipeline` (HttpPipeline) with optional
      // dispose; close the underlying pipeline if available.
      const pipeline = (client as unknown as { pipeline?: { dispose?: () => void } }).pipeline;
      if (pipeline && typeof pipeline.dispose === 'function') {
        try {
          pipeline.dispose();
        } catch {
          // best-effort cleanup
        }
      }
    }
    this.cryptoClients.clear();
  }

  /**
   * Sanitizes error for metrics recording.
   *
   * Extracts only the error type/name to avoid leaking sensitive data
   * (tokens, headers, request payloads) in metrics.
   *
   * @param error - The error to sanitize
   * @returns A safe error identifier (error name only)
   */
  private sanitizeErrorForMetrics(error: unknown): string {
    if (error instanceof Error) {
      return error.name;
    }
    return 'UnknownError';
  }

  /**
   * Encrypts plaintext data using Azure Key Vault.
   *
   * Uses RSA-OAEP-256 encryption algorithm via the Key Vault
   * CryptographyClient. This algorithm is compatible with standard
   * Key Vault (Premium tier) and uses RSA keys with OAEP padding
   * and SHA-256 hash.
   *
   * **Note**: RSA encryption has a plaintext size limit based on
   * key size. For a 2048-bit key, max plaintext is ~214 bytes.
   * For larger data, use envelope encryption via `generateDataKey()`.
   *
   * @param plaintext - Data to encrypt (size limited by RSA key size)
   * @param keyId - Key name to use; uses default if not specified
   * @returns Encrypted ciphertext as Buffer
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {EncryptionOperationError} When Key Vault API call fails
   */
  async encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const client = this.ensureCryptoClient(keyId);
      const resolvedKeyName = keyId ?? this.config.keyName;
      attributes['key_id'] = resolvedKeyName ?? 'unknown';

      const result = await client.encrypt({
        algorithm: KnownEncryptionAlgorithms.RSAOaep256,
        plaintext
      });

      if (!result.result) {
        throw new EncryptionOperationError(
          `azure-keyvault:encrypt:${resolvedKeyName ?? 'unknown'}`,
          new Error(
            `Key Vault returned no result (vault: ${this.config.vaultUrl}, key: ${resolvedKeyName})`
          )
        );
      }

      this.recordEncrypt(attributes, Date.now() - startTime);
      return Buffer.from(result.result);
    } catch (error) {
      this.recordEncrypt(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      // Avoid double-wrapping if already an EncryptionOperationError
      if (error instanceof EncryptionOperationError) {
        throw error;
      }
      const resolvedKeyName = keyId ?? this.config.keyName ?? 'unknown';
      throw new EncryptionOperationError(`azure-keyvault:encrypt:${resolvedKeyName}`, error);
    }
  }

  /**
   * Decrypts ciphertext using Azure Key Vault.
   *
   * Uses RSA-OAEP-256 decryption algorithm via the Key Vault
   * CryptographyClient. The ciphertext must have been encrypted
   * with the same algorithm and key.
   *
   * @param ciphertext - Data to decrypt (from a previous encrypt call)
   * @param keyId - Key name to use; uses default if not specified
   * @returns Decrypted plaintext as Buffer
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {DecryptionOperationError} When decryption fails
   */
  async decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const client = this.ensureCryptoClient(keyId);
      const resolvedKeyName = keyId ?? this.config.keyName;
      attributes['key_id'] = resolvedKeyName ?? 'unknown';

      const result = await client.decrypt({
        algorithm: KnownEncryptionAlgorithms.RSAOaep256,
        ciphertext
      });

      if (!result.result) {
        throw new DecryptionOperationError(
          `azure-keyvault:decrypt:${resolvedKeyName ?? 'unknown'}`,
          new Error(
            `Key Vault returned no result (vault: ${this.config.vaultUrl}, key: ${resolvedKeyName})`
          )
        );
      }

      this.recordDecrypt(attributes, Date.now() - startTime);
      return Buffer.from(result.result);
    } catch (error) {
      this.recordDecrypt(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      // Avoid double-wrapping if already a DecryptionOperationError
      if (error instanceof DecryptionOperationError) {
        throw error;
      }
      const resolvedKeyName = keyId ?? this.config.keyName ?? 'unknown';
      throw new DecryptionOperationError(`azure-keyvault:decrypt:${resolvedKeyName}`, error);
    }
  }

  /**
   * Generates a data encryption key (DEK) for envelope encryption.
   *
   * Creates a 256-bit random key using Node.js CSPRNG, then wraps it
   * with the specified Key Vault key. Returns both the plaintext DEK
   * (for immediate use) and the wrapped DEK (for storage).
   *
   * **Security Note**: The plaintext DEK should be zeroed after use:
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   * // ... use plaintext for encryption ...
   * plaintext.fill(0); // Zero after use
   * ```
   *
   * @param keyId - Key name to wrap the DEK; uses default if not specified
   * @returns IDataKeyResult with plaintext (32 bytes) and ciphertext
   *
   * @throws {InvalidKmsConfigError} When no key is configured
   * @throws {EncryptionOperationError} When Key Vault wrap or crypto operation fails
   */
  async generateDataKey(keyId?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    // Declare plaintext outside try block so catch can securely zero it
    let plaintext: Buffer | null = null;

    try {
      // Generate 256-bit random data key using CSPRNG
      plaintext = randomBytes(32);

      // Encrypt the data key with Key Vault
      const ciphertext = await this.encrypt(plaintext, keyId);

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return { plaintext, ciphertext };
    } catch (error) {
      // Securely zero plaintext before rethrowing to prevent key leakage
      if (plaintext) {
        plaintext.fill(0);
      }

      this.recordGenerateDataKey(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      throw error;
    }
  }

  /**
   * Retrieves metadata about an Azure Key Vault key.
   *
   * Calls the getKey API to fetch key properties including
   * version, creation date, enabled state, and expiration.
   *
   * The configured keyVersion is only applied when querying the default
   * configured key. This prevents incorrectly pinning a version when
   * querying arbitrary key overrides.
   *
   * @param keyId - Key name to query; uses default if not specified
   * @returns IKeyInfo with key metadata
   *
   * @throws {InvalidKmsConfigError} When no key ID is configured
   * @throws {KeyNotFoundError} When the key doesn't exist
   */
  override async getKeyInfo(keyId?: string): Promise<IKeyInfo> {
    const resolvedKeyName = keyId ?? this.config.keyName;
    if (!resolvedKeyName) {
      throw new InvalidKmsConfigError('No key ID provided');
    }

    // Only apply configured keyVersion if querying the default key.
    // This prevents incorrectly pinning version for arbitrary key overrides.
    const shouldApplyVersion = resolvedKeyName === this.config.keyName && this.config.keyVersion;

    try {
      const key: KeyVaultKey = await this.keyClient.getKey(
        resolvedKeyName,
        shouldApplyVersion ? { version: this.config.keyVersion } : undefined
      );

      return {
        keyId: resolvedKeyName,
        ...(key.properties.version !== undefined && { version: key.properties.version }),
        ...(key.properties.createdOn !== undefined && { createdAt: key.properties.createdOn }),
        ...(key.properties.enabled !== undefined && { enabled: key.properties.enabled }),
        purpose: key.key?.kty ?? 'RSA',
        metadata: {
          provider: 'azure',
          ...(key.properties.managed !== undefined && { managed: key.properties.managed }),
          ...(key.properties.expiresOn !== undefined && { expiresOn: key.properties.expiresOn })
        }
      };
    } catch (err) {
      // Only throw KeyNotFoundError for actual 404 (key not found) errors
      // Use proper RestError instanceof check instead of untyped assertion
      if (err instanceof RestError && err.statusCode === 404) {
        throw new KeyNotFoundError(resolvedKeyName, { cause: err });
      }
      // For other errors (auth, network, permissions), rethrow to avoid masking
      throw err;
    }
  }

  /**
   * Checks if the provider is available and properly configured.
   *
   * Uses least-privilege verification by attempting to get the configured
   * key (requires only Keys/Get permission) rather than listing keys
   * (which requires Keys/List). Falls back to a no-op crypto call if
   * no key is configured.
   *
   * @returns true if the vault is accessible, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    return (await this.isAvailableDetailed()).available;
  }

  /**
   * Diagnostic variant of isAvailable() returning a structured result.
   * Bug B5a: the broad-catch in isAvailable() hid status codes from
   * operators, causing false-negatives on deployments with envelope-only
   * permissions (wrapKey/unwrapKey only — insufficient for Keys/Get).
   */
  async isAvailableDetailed(): Promise<{
    available: boolean;
    reason: string;
    statusCode?: number;
  }> {
    try {
      // Use least-privilege operation: getKey only requires Keys/Get permission
      // (unlike listPropertiesOfKeys which requires Keys/List)
      if (this.config.keyName) {
        await this.keyClient.getKey(this.config.keyName);
        return { available: true, reason: 'ok' };
      }

      // If no key configured, fall back to listing (less ideal but necessary)
      for await (const _ of this.keyClient.listPropertiesOfKeys()) {
        return { available: true, reason: 'ok' };
      }
      return { available: true, reason: 'empty_vault' }; // Empty list is still success
    } catch (error) {
      const statusCode = this.extractStatusCode(error);
      return {
        available: false,
        reason: this.classifyAzureError(statusCode),
        statusCode
      };
    }
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      const e = error as {
        statusCode?: unknown;
        response?: { status?: unknown; statusCode?: unknown };
      };
      if (typeof e.statusCode === 'number') return e.statusCode;
      if (e.response) {
        if (typeof e.response.statusCode === 'number') return e.response.statusCode;
        if (typeof e.response.status === 'number') return e.response.status;
      }
    }
    return undefined;
  }

  private classifyAzureError(statusCode: number | undefined): string {
    if (statusCode === 401) return 'unauthorized';
    if (statusCode === 403) return 'forbidden';
    if (statusCode === 404) return 'not_found';
    if (statusCode === 429) return 'throttled';
    if (statusCode !== undefined) return `http_${statusCode}`;
    return 'network_or_unknown';
  }

  /**
   * Performs a health check on the provider.
   *
   * Delegates to `isAvailable()` to verify Key Vault connectivity.
   *
   * @returns true if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    return this.isAvailable();
  }
}
