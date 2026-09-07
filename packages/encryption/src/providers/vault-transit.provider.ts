/**
 * HashiCorp Vault Transit Provider
 *
 * Production-grade KMS provider implementing envelope encryption using
 * HashiCorp Vault's Transit secrets engine. Ideal for on-premises or
 * hybrid cloud deployments requiring encryption-as-a-service.
 *
 * ## Features
 *
 * - **Native Rewrap**: Atomic key rotation without exposing plaintext DEKs
 * - **Key Versioning**: Automatic key versioning with min decryption version
 * - **Multiple Algorithms**: Supports AES-GCM, ChaCha20, RSA, and more
 * - **Namespace Support**: Multi-tenant isolation with Vault namespaces
 *
 * ## Native Rewrap Advantage
 *
 * Unlike cloud KMS providers, Vault Transit supports **atomic rewrap**:
 * the plaintext DEK never leaves the Vault boundary during key rotation.
 *
 * ```
 * Cloud KMS Rewrap:        Vault Transit Rewrap:
 * ┌────────────────────┐   ┌────────────────────┐
 * │ Ciphertext (old)   │   │ Ciphertext (old)   │
 * │        ↓           │   │        ↓           │
 * │ [Decrypt to App]   │   │ [Rewrap in Vault]  │ ← Plaintext never leaves
 * │   Plaintext ← ⚠️   │   │        ↓           │
 * │        ↓           │   │ Ciphertext (new)   │
 * │ [Encrypt with new] │   └────────────────────┘
 * │        ↓           │
 * │ Ciphertext (new)   │
 * └────────────────────┘
 * ```
 *
 * ## Authentication
 *
 * Currently supports token-based authentication. The token should have
 * policies granting access to the Transit engine operations.
 *
 * ## Transit Engine Path
 *
 * Default engine path is `transit`. For custom paths (e.g., `secret/transit`),
 * use the `enginePath` configuration option.
 *
 * ## Security Considerations
 *
 * - **Token Security**: Store Vault tokens securely (use AppRole for production)
 * - **Audit Logging**: Vault provides comprehensive audit logging
 * - **Seal/Unseal**: Consider auto-unseal for high availability
 * - **Enterprise Features**: Namespaces, HSM support, replication
 *
 * @module encryption/providers/vault-transit
 *
 * @example Basic usage
 * ```typescript
 * const provider = new VaultTransitProvider({
 *   address: 'https://vault.example.com:8200',
 *   token: process.env.VAULT_TOKEN,
 *   keyName: 'my-encryption-key'
 * });
 *
 * const dataKey = await provider.generateDataKey();
 * ```
 *
 * @example With namespace (Vault Enterprise)
 * ```typescript
 * const provider = new VaultTransitProvider({
 *   address: 'https://vault.example.com:8200',
 *   token: process.env.VAULT_TOKEN,
 *   namespace: 'my-team',
 *   enginePath: 'transit',
 *   keyName: 'team-key'
 * });
 * ```
 *
 * @example Native rewrap for key rotation
 * ```typescript
 * // Rotate the key in Vault (creates new version)
 * // Then rewrap existing DEKs without exposing plaintext
 * const newCiphertext = await provider.rewrap(oldCiphertext);
 * // Plaintext DEK never left Vault!
 * ```
 */

import Vault from 'node-vault';

import {
  DataKeyGenerationError,
  DataKeyReencryptionError,
  DecryptionOperationError,
  EncryptionOperationError,
  InvalidKmsConfigError,
  KeyNotFoundError
} from '../errors';
import { BaseKmsProvider, IDataKeyResult, IKeyInfo } from './kms-provider.interface';

import type { IVaultTransitProviderOptions } from './factory.types';

/** @internal Vault client type */
type VaultClient = ReturnType<typeof Vault>;

/**
 * HashiCorp Vault Transit secrets engine provider for envelope encryption.
 *
 * Implements the `IKmsProvider` interface using Vault's Transit engine for
 * key encryption key (KEK) operations. Provides the most secure rewrap
 * implementation where plaintext DEKs never leave the Vault boundary.
 *
 * ## Key Operations
 *
 * | Operation | Implementation |
 * |-----------|----------------|
 * | `encrypt()` | Transit encrypt endpoint |
 * | `decrypt()` | Transit decrypt endpoint |
 * | `generateDataKey()` | Transit datakey/plaintext endpoint (native) |
 * | `rewrap()` | Transit rewrap endpoint (native, atomic) |
 * | `getKeyInfo()` | Transit keys/{name} endpoint |
 *
 * ## Performance Considerations
 *
 * - Vault is typically lower latency than cloud KMS
 * - Can be deployed close to applications
 * - Supports batch operations for high throughput
 *
 * @extends BaseKmsProvider
 *
 * @throws {InvalidKmsConfigError} When address, token, or keyName is missing
 */
export class VaultTransitProvider extends BaseKmsProvider {
  /** @internal Vault client instance */
  private client: VaultClient;

  /** @internal Provider configuration */
  private config: IVaultTransitProviderOptions;

  /** @internal Default key name in Transit engine */
  private defaultKeyName: string;

  /**
   * Creates a new Vault Transit provider instance.
   *
   * @param config - Provider configuration options
   * @param config.address - Vault server URL (e.g., 'https://vault.example.com:8200')
   * @param config.token - Vault authentication token
   * @param config.keyName - Default key name in Transit engine - required
   * @param config.namespace - Optional Vault namespace (Enterprise feature)
   * @param config.enginePath - Optional Transit engine path (default: 'transit')
   *
   * @throws {InvalidKmsConfigError} When address, token, or keyName is missing
   *
   * @example
   * ```typescript
   * const provider = new VaultTransitProvider({
   *   address: 'https://vault.example.com:8200',
   *   token: process.env.VAULT_TOKEN,
   *   keyName: 'my-key'
   * });
   * ```
   */
  constructor(config: IVaultTransitProviderOptions) {
    super('vault');

    if (!config.address || !config.token) {
      throw new InvalidKmsConfigError('Vault Transit requires address and token');
    }

    this.config = config;

    // Initialize Vault client
    const clientConfig: Record<string, unknown> = {
      endpoint: config.address,
      token: config.token
    };

    if (config.namespace) {
      clientConfig['namespace'] = config.namespace;
    }

    this.client = Vault(clientConfig);

    // Set default key name
    if (config.keyName) {
      this.defaultKeyName = config.keyName;
    } else {
      throw new InvalidKmsConfigError('Vault Transit requires keyName to be configured');
    }
  }

  /**
   * Resolve key name (use provided keyName or default)
   */
  private resolveKeyName(keyName?: string): string {
    return keyName ?? this.defaultKeyName;
  }

  /**
   * Get Transit engine path
   */
  private getEnginePath(): string {
    return this.config.enginePath ?? 'transit';
  }

  /**
   * Build full path for Transit operations
   */
  private buildPath(operation: string, keyName: string): string {
    const enginePath = this.getEnginePath();
    return `${enginePath}/${operation}/${keyName}`;
  }

  /**
   * Sanitize error for metrics recording.
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
   * Encrypts plaintext data using Vault Transit.
   *
   * Sends the plaintext (base64-encoded) to Vault's Transit encrypt
   * endpoint. Returns the ciphertext in Vault's format (vault:v1:...).
   *
   * @param plaintext - Data to encrypt
   * @param keyName - Key name to use; uses default if not specified
   * @returns Encrypted ciphertext as Buffer (Vault format)
   *
   * @throws {EncryptionOperationError} When Vault API call fails
   */
  async encrypt(plaintext: Buffer, keyName?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyName = this.resolveKeyName(keyName);
      attributes['key_id'] = resolvedKeyName;

      const path = this.buildPath('encrypt', resolvedKeyName);
      const result = await this.client.write(path, {
        plaintext: plaintext.toString('base64')
      });

      const ciphertext = result.data.ciphertext as string;
      this.recordEncrypt(attributes, Date.now() - startTime);
      return Buffer.from(ciphertext, 'utf8');
    } catch (error) {
      this.recordEncrypt(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      throw new EncryptionOperationError('vault-transit:encrypt', error);
    }
  }

  /**
   * Decrypts ciphertext using Vault Transit.
   *
   * Sends the ciphertext to Vault's Transit decrypt endpoint.
   * The ciphertext must be in Vault's format (vault:v1:...).
   *
   * @param ciphertext - Data to decrypt (Vault format)
   * @param keyName - Key name to use; uses default if not specified
   * @returns Decrypted plaintext as Buffer
   *
   * @throws {DecryptionOperationError} When decryption fails
   */
  async decrypt(ciphertext: Buffer, keyName?: string): Promise<Buffer> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyName = this.resolveKeyName(keyName);
      attributes['key_id'] = resolvedKeyName;

      const path = this.buildPath('decrypt', resolvedKeyName);
      const result = await this.client.write(path, {
        ciphertext: ciphertext.toString('utf8')
      });

      const plaintextB64 = result.data.plaintext as string;
      this.recordDecrypt(attributes, Date.now() - startTime);
      return Buffer.from(plaintextB64, 'base64');
    } catch (error) {
      this.recordDecrypt(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      throw new DecryptionOperationError('vault-transit:decrypt', error);
    }
  }

  /**
   * Generates a data encryption key (DEK) for envelope encryption.
   *
   * Uses Vault's native `datakey/plaintext` endpoint which generates
   * the DEK within Vault and returns both plaintext and wrapped versions.
   * This is more secure than generating locally as Vault's CSPRNG is used.
   *
   * **Security Note**: The plaintext DEK should be zeroed after use:
   * ```typescript
   * const { plaintext, ciphertext } = await provider.generateDataKey();
   * // ... use plaintext for encryption ...
   * plaintext.fill(0); // Zero after use
   * ```
   *
   * @param keyName - Key name to wrap the DEK; uses default if not specified
   * @returns IDataKeyResult with plaintext (32 bytes) and ciphertext
   *
   * @throws {DataKeyGenerationError} When Vault API call fails
   */
  async generateDataKey(keyName?: string): Promise<IDataKeyResult> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyName = this.resolveKeyName(keyName);
      attributes['key_id'] = resolvedKeyName;

      // Use Vault's native datakey endpoint for secure DEK generation
      const path = this.buildPath('datakey/plaintext', resolvedKeyName);
      const result = await this.client.write(path, {
        bits: 256
      });

      const plaintextB64 = result.data.plaintext as string;
      const ciphertext = result.data.ciphertext as string;

      this.recordGenerateDataKey(attributes, Date.now() - startTime);
      return {
        plaintext: Buffer.from(plaintextB64, 'base64'),
        ciphertext: Buffer.from(ciphertext, 'utf8')
      };
    } catch (error) {
      this.recordGenerateDataKey(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      throw new DataKeyGenerationError(error);
    }
  }

  /**
   * Re-encrypts a DEK with the latest key version (native rewrap).
   *
   * **This is Vault's key advantage**: The rewrap operation is atomic and
   * the plaintext DEK **never leaves the Vault boundary**. This provides
   * the highest security for key rotation operations.
   *
   * ## How It Works
   *
   * 1. Vault decrypts the ciphertext internally
   * 2. Re-encrypts with the latest key version
   * 3. Returns new ciphertext
   * 4. Plaintext never exposed to the application
   *
   * @param ciphertext - Encrypted DEK to rewrap (Vault format)
   * @param keyName - Key name to rewrap with; uses default if not specified
   * @param _sourceKeyId - Unused; included for interface compatibility. Vault Transit
   *                       uses atomic rewrap which doesn't require explicit source key.
   * @returns New ciphertext wrapped with latest key version
   *
   * @throws {DataKeyReencryptionError} When rewrap operation fails
   *
   * @example
   * ```typescript
   * // After rotating the key in Vault:
   * const newCiphertext = await provider.rewrap(oldCiphertext);
   * // The underlying DEK never left Vault!
   * ```
   */
  override async rewrap(
    ciphertext: Buffer,
    keyName?: string,
    _sourceKeyId?: string
  ): Promise<{ ciphertext: Buffer }> {
    const startTime = Date.now();
    const attributes = this.buildAttributes();

    try {
      const resolvedKeyName = this.resolveKeyName(keyName);

      // Bug B4: Vault Transit rewrap decrypts under the destination key's
      // min_decryption_version policy regardless of the source key. When the
      // caller omits sourceKeyId, the implicit rotation is silent. Emit a
      // warning so operators can audit it. We don't throw because rewrap is
      // genuinely useful in single-key setups; we just want observability.
      if (_sourceKeyId === undefined && keyName !== undefined) {
        const logger = (this as unknown as { logger?: { warn: (msg: string) => void } }).logger;
        logger?.warn(
          `[VaultTransitProvider] rewrap called with explicit target key '${resolvedKeyName}' ` +
            `but no source key. Vault will decrypt under the target's ` +
            `min_decryption_version policy and re-encrypt under the target's latest version. ` +
            `If the ciphertext was originally wrapped under a different key, ` +
            `this rotates it implicitly. Pass sourceKeyId to make the rotation explicit.`
        );
      }

      attributes['key_id'] = resolvedKeyName;

      const path = this.buildPath('rewrap', resolvedKeyName);
      const result = await this.client.write(path, {
        ciphertext: ciphertext.toString('utf8')
      });

      const newCiphertext = result.data.ciphertext as string;
      this.recordRewrap(attributes, Date.now() - startTime);
      return { ciphertext: Buffer.from(newCiphertext, 'utf8') };
    } catch (error) {
      this.recordRewrap(
        { ...attributes, error: this.sanitizeErrorForMetrics(error) },
        Date.now() - startTime
      );
      throw new DataKeyReencryptionError('vault-transit:rewrap', error);
    }
  }

  /**
   * Retrieves metadata about a Transit key.
   *
   * Reads the key configuration from Vault including type,
   * exportable flag, and key versions.
   *
   * @param keyName - Key name to query; uses default if not specified
   * @returns IKeyInfo with key metadata
   *
   * @throws {KeyNotFoundError} When the key doesn't exist or is inaccessible
   */
  override async getKeyInfo(keyName?: string): Promise<IKeyInfo> {
    const resolvedKeyName = this.resolveKeyName(keyName);

    try {
      const path = this.buildPath('keys', resolvedKeyName);
      const result = await this.client.read(path);

      const data = result.data as Record<string, unknown>;

      // Vault Transit returns version identifiers under data['keys'] (e.g., {"1": ts, "2": ts})
      // A key is enabled if it has at least one version entry
      const keys = data['keys'] as Record<string, unknown> | undefined;
      const hasVersions = keys ? Object.keys(keys).length > 0 : false;

      return {
        keyId: resolvedKeyName,
        enabled: hasVersions,
        purpose: 'transit',
        metadata: {
          provider: 'vault',
          type: data['type'] as string,
          exportable: data['exportable'] as boolean,
          ...(data['latest_version'] !== undefined && { latestVersion: data['latest_version'] })
        }
      };
    } catch (error) {
      // Only throw KeyNotFoundError for actual 404 (key not found) errors
      // node-vault errors have response.statusCode for HTTP status codes
      const statusCode = (error as { response?: { statusCode?: number } })?.response?.statusCode;
      if (statusCode === 404) {
        throw new KeyNotFoundError(resolvedKeyName, { cause: error });
      }
      // For other errors (permission denied, network, Vault sealed, etc.), rethrow
      // the original error to avoid masking critical operational issues
      throw error;
    }
  }

  /**
   * Checks if the provider is available and properly configured.
   *
   * Verifies connectivity by attempting to list keys in the Transit engine.
   * This validates the token, network access, and policy permissions.
   *
   * @returns true if the Transit engine is accessible, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Verify access to Transit engine by listing keys
      // Note: /keys endpoint is LIST-only; using read triggers 405 Method Not Allowed
      const enginePath = this.getEnginePath();
      await this.client.list(`${enginePath}/keys`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Diagnostic variant of isAvailable() that returns a structured result so
   * callers can distinguish permanent (403/472) vs transient (429/503) vs
   * network failures. Bug B3: the simple isAvailable() broad-catch hid
   * all status codes behind a single boolean.
   */
  async isAvailableDetailed(): Promise<{
    available: boolean;
    reason: string;
    statusCode?: number;
  }> {
    try {
      const enginePath = this.getEnginePath();
      await this.client.list(`${enginePath}/keys`);
      return { available: true, reason: 'ok' };
    } catch (error) {
      // Bug B3: surface the upstream status code so operators can tell
      // token-revoked (403), policy-disabled (472), sealed/standby (429/503),
      // and DNS/network errors apart.
      const statusCode = this.extractStatusCode(error);
      const reason = this.classifyVaultError(statusCode, error);
      return { available: false, reason, statusCode };
    }
  }

  /**
   * Extract a numeric status code from a node-vault error. node-vault
   * typically surfaces the code on `error.statusCode` or `error.response.statusCode`.
   * @internal
   */
  private extractStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      const e = error as { statusCode?: unknown; response?: { statusCode?: unknown } };
      if (typeof e.statusCode === 'number') return e.statusCode;
      if (e.response && typeof e.response.statusCode === 'number') {
        return e.response.statusCode;
      }
    }
    return undefined;
  }

  /**
   * Produce a stable, loggable reason string for an availability probe failure.
   * @internal
   */
  private classifyVaultError(statusCode: number | undefined, error: unknown): string {
    if (statusCode === 403) return 'forbidden';
    if (statusCode === 472) return 'policy_disabled';
    if (statusCode === 429) return 'sealed_or_standby';
    if (statusCode === 503) return 'unavailable';
    if (statusCode !== undefined) return `http_${statusCode}`;
    // No statusCode → likely transport (DNS, ECONNRefused, TLS).
    const message = error instanceof Error ? error.message : String(error);
    const firstLine = (message ?? '').split('\n')[0] ?? '';
    return `network:${firstLine.slice(0, 120)}`;
  }

  /**
   * Performs a health check on the provider.
   *
   * Delegates to `isAvailable()` to verify Vault connectivity.
   *
   * @returns true if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    return this.isAvailable();
  }

  /**
   * Checks if strict validation is enabled via config or environment variable.
   *
   * Strict validation is enabled when either:
   * - `enableStrictValidation: true` is set in provider config
   * - `ENABLE_STRICT_KMS_VALIDATION=true` environment variable is set
   *
   * @returns true if strict validation should be performed
   */
  private isStrictValidationEnabled(): boolean {
    return (
      this.config.enableStrictValidation || process.env['ENABLE_STRICT_KMS_VALIDATION'] === 'true'
    );
  }

  /**
   * Performs a round-trip encrypt/decrypt validation.
   *
   * Tests both encrypt and decrypt permissions by encrypting a test payload
   * and verifying the decrypted result matches the original.
   *
   * @param validationKeyName - The key name to use for validation
   * @returns Validation result with success status and optional error details
   */
  private async performRoundTripValidation(validationKeyName: string): Promise<{
    success: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    const testPayload = Buffer.from('vault-transit-permission-validation-test', 'utf8');

    const encrypted = await this.encrypt(testPayload, validationKeyName);
    const decrypted = await this.decrypt(encrypted, validationKeyName);

    if (!testPayload.equals(decrypted)) {
      return {
        success: false,
        error: 'Round-trip validation failed: decrypted data does not match original',
        details: {
          enginePath: this.getEnginePath()
        }
      };
    }

    return {
      success: true,
      details: {
        enginePath: this.getEnginePath()
      }
    };
  }

  /**
   * Maps a validation error to a standardized error response.
   *
   * Uses safe error indicators (status codes, error types) to determine
   * if the error is permission-related without exposing raw error messages.
   *
   * @param error - The error to map
   * @param validated - Whether validation was attempted
   * @returns Standardized error response
   */
  private mapValidationError(
    error: unknown,
    validated: boolean
  ): {
    success: boolean;
    validated: boolean;
    error?: string;
    details?: Record<string, unknown>;
  } {
    const sanitizedErrorType = this.sanitizeErrorForMetrics(error);
    const isPermissionError = this.isPermissionRelatedError(error);

    return {
      success: false,
      validated,
      error: isPermissionError
        ? 'Permission denied: Token lacks encrypt/decrypt permissions on validation key'
        : 'Validation failed',
      details: {
        enginePath: this.getEnginePath(),
        errorType: sanitizedErrorType,
        isPermissionError
      }
    };
  }

  /**
   * Validates that the provider has full encrypt/decrypt permissions.
   *
   * Unlike `isAvailable()` which only checks list permissions, this method
   * performs a full encrypt/decrypt round-trip to verify operational permissions.
   * This is useful for fail-fast validation during application startup.
   *
   * **When to use**: Call this method during application initialization when
   * you need to ensure the Vault token has all required permissions before
   * processing requests.
   *
   * **Gating**: This validation only runs when:
   * - `enableStrictValidation: true` is set in provider config, OR
   * - `ENABLE_STRICT_KMS_VALIDATION=true` environment variable is set
   *
   * If neither is set, the method returns success without performing validation.
   *
   * @returns Validation result with success status and optional error details
   *
   * @example Startup validation
   * ```typescript
   * const provider = new VaultTransitProvider({
   *   address: 'https://vault.example.com:8200',
   *   token: process.env.VAULT_TOKEN,
   *   keyName: 'my-key',
   *   enableStrictValidation: true
   * });
   *
   * const result = await provider.validatePermissions();
   * if (!result.success) {
   *   console.error('KMS validation failed:', result.error);
   *   process.exit(1);
   * }
   * ```
   */
  async validatePermissions(): Promise<{
    success: boolean;
    validated: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    if (!this.isStrictValidationEnabled()) {
      return {
        success: true,
        validated: false
      };
    }

    const validationKeyName = this.config.validationKeyName ?? this.defaultKeyName;

    try {
      const result = await this.performRoundTripValidation(validationKeyName);
      return {
        ...result,
        validated: true
      };
    } catch (error) {
      return this.mapValidationError(error, true);
    }
  }

  /**
   * Determines if an error is permission-related based on safe indicators.
   *
   * Checks HTTP status codes and error types without exposing raw error messages.
   *
   * @param error - The error to check
   * @returns true if the error appears to be permission-related
   */
  private isPermissionRelatedError(error: unknown): boolean {
    // Check HTTP status code if available (node-vault errors include this)
    const statusCode = (error as { response?: { statusCode?: number } })?.response?.statusCode;
    if (statusCode === 403 || statusCode === 401) {
      return true;
    }

    // Check for common permission-related error names
    if (error instanceof Error) {
      const errorName = error.name.toLowerCase();
      if (
        errorName.includes('forbidden') ||
        errorName.includes('unauthorized') ||
        errorName.includes('permission')
      ) {
        return true;
      }
    }

    return false;
  }
}
