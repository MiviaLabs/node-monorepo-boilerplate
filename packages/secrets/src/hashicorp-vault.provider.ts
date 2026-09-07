import axios from 'axios';

import { BaseSecretProvider } from './base-provider';
import type { HashiCorpVaultConfig } from './config/interfaces';

/**
 * HashiCorp Vault Secret Provider
 *
 * Provides secret management using HashiCorp Vault's KV v2 secrets engine
 * and Transit secrets engine for encryption/decryption. Extends BaseSecretProvider
 * for automatic OpenTelemetry tracing on all secret operations.
 *
 * Features:
 * - KV v2 secrets engine support
 * - Token and AppRole authentication
 * - Namespace support for Vault Enterprise
 * - Transit engine for encryption/decryption
 * - Automatic OpenTelemetry tracing (inherited from BaseSecretProvider)
 *
 * @example Basic initialization with token authentication
 * ```typescript
 * import { HashiCorpVaultProvider } from '@package/secrets';
 *
 * const provider = new HashiCorpVaultProvider({
 *   addr: 'https://vault.example.com:8200',
 *   token: 'hvs.xxxxxxxxxxxxxxxxxxxxx',
 * });
 *
 * // Retrieve a secret
 * const apiKey = await provider.getSecret('api/keys/stripe');
 * ```
 *
 * @example Using AppRole authentication
 * ```typescript
 * const provider = new HashiCorpVaultProvider({
 *   addr: 'https://vault.example.com:8200',
 *   roleId: 'db02de05-fa39-4855-059b-67221c5c2f63',
 *   secretId: '6a174c20-f6de-a53c-74d2-6018fcceff64',
 * });
 *
 * // Provider automatically authenticates on first use
 * const dbPassword = await provider.getSecret('database/password');
 * ```
 *
 * @example Using with Vault Enterprise namespaces
 * ```typescript
 * const provider = new HashiCorpVaultProvider({
 *   addr: 'https://vault.example.com:8200',
 *   token: 'hvs.xxxxxxxxxxxxxxxxxxxxx',
 *   namespace: 'admin/production',
 * });
 * ```
 *
 * @example Using with NestJS dependency injection
 * ```typescript
 * import { Injectable, Inject } from '@nestjs/common';
 * import { SECRET_PROVIDER_TOKEN, ISecretProvider } from '@package/secrets';
 *
 * @Injectable()
 * export class PaymentService {
 *   constructor(
 *     @Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: ISecretProvider,
 *   ) {}
 *
 *   async getStripeKey(): Promise<string> {
 *     return this.secrets.getSecret('payment/stripe-api-key');
 *   }
 * }
 * ```
 *
 * @see {@link BaseSecretProvider} for tracing and validation functionality
 */
export class HashiCorpVaultProvider extends BaseSecretProvider {
  private readonly config: Required<Pick<HashiCorpVaultConfig, 'addr'>> & HashiCorpVaultConfig;
  private authToken?: string;

  constructor(config: HashiCorpVaultConfig = {}) {
    super({ name: 'HashiCorpVaultProvider', enableTracing: true });
    this.config = {
      addr: config.addr ?? 'http://localhost:8200',
      token: config.token ?? '',
      roleId: config.roleId ?? '',
      secretId: config.secretId ?? '',
      namespace: config.namespace
    };
    this.authToken = undefined;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.config.token || this.authToken) return;

    // Use AppRole authentication if roleId and secretId are provided
    const roleId = this.config.roleId;
    const secretId = this.config.secretId;

    if (roleId && secretId) {
      const response = await axios.post(`${this.config.addr}/v1/auth/approle/login`, {
        role_id: roleId,
        secret_id: secretId
      });
      this.authToken = response.data.auth.client_token;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Vault-Token': (this.authToken || this.config.token) as string
    };

    if (this.config.namespace) {
      headers['X-Vault-Namespace'] = this.config.namespace;
    }

    return headers;
  }

  /**
   * Implementation: Get a secret value from Vault KV v2 engine
   */
  protected async getSecretImpl(path: string): Promise<string> {
    await this.ensureAuthenticated();

    const response = await axios.get(`${this.config.addr}/v1/kv/data/${path}`, {
      headers: this.getHeaders()
    });

    return response.data.data.data.value;
  }

  /**
   * Implementation: Set a secret value in Vault KV v2 engine
   */
  protected async setSecretImpl(path: string, value: string): Promise<void> {
    await this.ensureAuthenticated();

    await axios.post(
      `${this.config.addr}/v1/kv/data/${path}`,
      { data: { value } },
      { headers: this.getHeaders() }
    );
  }

  /**
   * Implementation: Delete a secret from Vault KV v2 engine
   */
  protected async deleteSecretImpl(path: string): Promise<void> {
    await this.ensureAuthenticated();

    await axios.delete(`${this.config.addr}/v1/kv/data/${path}`, { headers: this.getHeaders() });
  }

  /**
   * Implementation: Generate a data key using Vault Transit engine
   */
  protected async generateDataKeyImpl(
    _keyId?: string
  ): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    await this.ensureAuthenticated();

    const response = await axios.post(
      `${this.config.addr}/v1/transit/keys/vault-key/datakey/plaintext`,
      {},
      { headers: this.getHeaders() }
    );

    return {
      plaintext: Buffer.from(response.data.data.plaintext, 'base64'),
      ciphertext: Buffer.from(response.data.data.ciphertext, 'utf8')
    };
  }

  /**
   * Implementation: Encrypt plaintext using Vault Transit engine
   */
  protected async encryptImpl(plaintext: string, _keyId?: string): Promise<string> {
    await this.ensureAuthenticated();

    const response = await axios.post(
      `${this.config.addr}/v1/transit/encrypt/vault-key`,
      { plaintext: Buffer.from(plaintext).toString('base64') },
      { headers: this.getHeaders() }
    );

    return response.data.data.ciphertext;
  }

  /**
   * Implementation: Decrypt ciphertext using Vault Transit engine
   */
  protected async decryptImpl(ciphertext: string, _keyId?: string): Promise<string> {
    await this.ensureAuthenticated();

    const response = await axios.post(
      `${this.config.addr}/v1/transit/decrypt/vault-key`,
      { ciphertext },
      { headers: this.getHeaders() }
    );

    return Buffer.from(response.data.data.plaintext, 'base64').toString();
  }

  /**
   * Implementation: Rotate a secret's encryption key in Vault Transit engine
   */
  protected async rotateSecretImpl(_key: string): Promise<void> {
    await this.ensureAuthenticated();

    await axios.post(
      `${this.config.addr}/v1/transit/keys/vault-key/rotate`,
      {},
      { headers: this.getHeaders() }
    );
  }

  /**
   * Health check for HashiCorp Vault provider
   *
   * @returns true if Vault is accessible, false otherwise
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
   *     const vaultHealthy = await this.secrets.healthCheck?.() ?? true;
   *     return { vault: vaultHealthy ? 'healthy' : 'unhealthy' };
   *   }
   * }
   * ```
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      // Try to read Vault status
      await axios.get(`${this.config.addr}/v1/sys/health`, {
        headers: this.getHeaders()
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // Clear authentication token
    this.authToken = undefined;
  }
}
