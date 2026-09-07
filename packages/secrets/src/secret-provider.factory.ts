import { randomBytes } from 'crypto';

import {
  resolveConfig,
  SecretProviderType as ConfigSecretProviderType,
  type InfrastructureSecretsConfig
} from './config';
import { SecretProviderConfigError } from './errors';
import { GcpSecretManagerProvider } from './gcp-secret-manager.provider';
import { HashiCorpVaultProvider } from './hashicorp-vault.provider';
import { OnePasswordProvider } from './one-password.provider';
import { SecretProvider, SecretProviderOptions } from './secret-provider.interface';

/**
 * Secret Provider Factory
 * =======================
 * Factory class for creating secret provider instances.
 *
 * @deprecated Use resolveConfig() and instantiate providers directly for better type safety.
 * This factory is maintained for backward compatibility.
 *
 * @example Deprecated usage (avoid)
 * ```typescript
 * const provider = SecretProviderFactory.create({
 *   provider: SecretProviderType.GCP,
 *   projectId: 'my-project',
 * });
 * ```
 *
 * @example Recommended approach (use instead)
 * ```typescript
 * import { resolveConfig, GcpSecretManagerProvider } from '@package/secrets';
 *
 * const config = resolveConfig({ provider: 'gcp', gcp: { projectId: 'my-project' } });
 * const provider = new GcpSecretManagerProvider(config.gcp);
 * ```
 */
export class SecretProviderFactory {
  /**
   * Create a secret provider instance
   *
   * @param options - Provider configuration options
   * @returns Configured secret provider instance
   *
   * @deprecated Use resolveConfig() and instantiate providers directly.
   *
   * @example Creating a GCP provider (deprecated)
   * ```typescript
   * const provider = SecretProviderFactory.create({
   *   provider: SecretProviderType.GCP,
   *   projectId: 'my-gcp-project',
   * });
   * ```
   *
   * @example Recommended approach
   * ```typescript
   * const config = resolveConfig({ provider: 'gcp' });
   * const provider = new GcpSecretManagerProvider(config.gcp);
   * ```
   */
  static create(options: SecretProviderOptions = {}): SecretProvider {
    // Map legacy SecretProviderOptions to new InfrastructureSecretsConfig
    const userConfig: InfrastructureSecretsConfig = {
      provider: options.provider as InfrastructureSecretsConfig['provider'],
      gcp: options.projectId
        ? {
            projectId: options.projectId,
            credentialsPath: options.projectId ? undefined : undefined // Will use env var
          }
        : undefined,
      hashicorp:
        options.vaultAddr || options.vaultToken || options.vaultRoleId
          ? {
              addr: options.vaultAddr,
              token: options.vaultToken,
              roleId: options.vaultRoleId,
              secretId: options.vaultSecretId
            }
          : undefined,
      onepassword:
        options.onePasswordToken ||
        options.onePasswordVaultId ||
        options.onePasswordItemName ||
        options.onePasswordFieldName
          ? {
              token: options.onePasswordToken,
              vaultId: options.onePasswordVaultId,
              itemName: options.onePasswordItemName,
              fieldName: options.onePasswordFieldName
            }
          : undefined
    };

    const config = resolveConfig(userConfig);

    switch (config.provider) {
      case ConfigSecretProviderType.GCP:
        return new GcpSecretManagerProvider(config.gcp);

      case ConfigSecretProviderType.HASHICORP:
        return new HashiCorpVaultProvider(config.hashicorp);

      case ConfigSecretProviderType.ONEPASSWORD:
        return new OnePasswordProvider(config.onepassword);

      default:
        throw new Error(`Unknown secret provider: ${config.provider}`);
    }
  }

  /**
   * Create a development secret provider that uses process.env
   * Useful for local development and testing
   *
   * @returns Development secret provider using environment variables
   *
   * @example Using for local development
   * ```typescript
   * const provider = SecretProviderFactory.createDev();
   *
   * // Set environment variable
   * process.env.MY_SECRET = 'dev-value';
   *
   * // Retrieve it via provider
   * const value = await provider.getSecret('MY_SECRET');
   * ```
   *
   * @example Using in tests
   * ```typescript
   * describe('MyService', () => {
   *   let provider: SecretProvider;
   *
   *   beforeEach(() => {
   *     provider = SecretProviderFactory.createDev();
   *     process.env.API_KEY = 'test-api-key';
   *   });
   *
   *   it('should retrieve secrets from environment', async () => {
   *     const apiKey = await provider.getSecret('API_KEY');
   *     expect(apiKey).toBe('test-api-key');
   *   });
   * });
   * ```
   */
  static createDev(): SecretProvider {
    return new DevSecretProvider();
  }
}

class DevSecretProvider implements SecretProvider {
  async getSecret(key: string): Promise<string> {
    this.validateSecretName(key);
    return process.env[key] || '';
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.validateSecretName(key);
    process.env[key] = value;
  }

  async deleteSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    delete process.env[key];
  }

  async generateDataKey(): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    // Use cryptographically secure random number generation
    const plaintext = randomBytes(32);
    return { plaintext, ciphertext: plaintext };
  }

  async encrypt(plaintext: string): Promise<string> {
    return Buffer.from(plaintext).toString('base64');
  }

  async decrypt(ciphertext: string): Promise<string> {
    return Buffer.from(ciphertext, 'base64').toString();
  }

  async rotateSecret(key: string): Promise<void> {
    this.validateSecretName(key);
    // No-op for development
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
