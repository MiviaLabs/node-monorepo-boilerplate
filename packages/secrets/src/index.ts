/**
 * @package/secrets
 *
 * Enterprise-grade secret management package providing a unified interface to multiple
 * secret providers. Supports GCP Secret Manager, HashiCorp Vault, and 1Password with
 * automatic OpenTelemetry tracing, retry logic, and NestJS integration.
 *
 * ## Features
 *
 * - **Multi-Provider Support**: Switch between {@link GcpSecretManagerProvider},
 *   {@link HashiCorpVaultProvider}, and {@link OnePasswordProvider} with consistent API
 * - **Factory Pattern**: Create providers via {@link SecretProviderFactory} for flexibility
 * - **NestJS Module**: {@link SecretsModule} with forRoot/forRootAsync configuration patterns
 * - **Base Provider**: {@link BaseSecretProvider} with built-in OpenTelemetry tracing
 * - **Mock Provider**: {@link MockSecretProvider} for unit and integration testing
 * - **Error Handling**: Typed errors for config, not-found, operation, and crypto failures
 * - **Configuration Resolution**: Environment variable fallbacks with type-safe defaults
 * - **Utilities**: Caching and retry helpers for provider implementations
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        SecretsModule                           │
 * │                  (NestJS DI Integration)                       │
 * └──────────────────────────┬──────────────────────────────────────┘
 *                            │
 *                            ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    SecretProviderFactory                       │
 * │              (Creates provider based on config)                │
 * └──────────────────────────┬──────────────────────────────────────┘
 *                            │
 *           ┌────────────────┼────────────────┐
 *           ▼                ▼                ▼
 * ┌──────────────┐  ┌─────────────────┐  ┌─────────────────┐
 * │     GCP      │  │    HashiCorp    │  │   1Password     │
 * │    Secret    │  │     Vault       │  │    Provider     │
 * │   Manager    │  │    Provider     │  │                 │
 * └──────────────┘  └─────────────────┘  └─────────────────┘
 *        │                  │                    │
 *        └──────────────────┴────────────────────┘
 *                           │
 *                           ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    SecretProvider Interface                    │
 * │   getSecret, setSecret, deleteSecret, encrypt, decrypt,        │
 * │              generateDataKey, rotateSecret, healthCheck        │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Module Setup
 *
 * ```typescript
 * import { Module } from '@nestjs/common';
 * import { SecretsModule } from '@package/secrets';
 *
 * @Module({
 *   imports: [
 *     SecretsModule.forRoot({
 *       provider: 'gcp',
 *       gcp: {
 *         projectId: 'my-gcp-project',
 *         kmsKeyLocation: 'global',
 *         kmsKeyRingId: 'vault-keys',
 *         kmsKeyId: 'vault-key',
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## Usage Examples
 *
 * ### Inject and Use ISecretProvider
 *
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
 *   async getDatabaseUrl(): Promise<string> {
 *     return this.secrets.getSecret('DATABASE_URL');
 *   }
 *
 *   async encryptSensitiveData(data: string): Promise<string> {
 *     return this.secrets.encrypt(data);
 *   }
 * }
 * ```
 *
 * ### Direct Provider Usage (Without NestJS)
 *
 * ```typescript
 * import { GcpSecretManagerProvider, resolveConfig } from '@package/secrets';
 *
 * const config = resolveConfig({ provider: 'gcp' });
 * const provider = new GcpSecretManagerProvider(config.gcp);
 *
 * const apiKey = await provider.getSecret('API_KEY');
 * const encrypted = await provider.encrypt('sensitive-data');
 * ```
 *
 * ### Testing with MockSecretProvider
 *
 * ```typescript
 * import { MockSecretProvider } from '@package/secrets';
 *
 * const mockProvider = new MockSecretProvider({
 *   initialSecrets: { 'DATABASE_URL': 'postgres://test' },
 *   latency: 50,
 *   failureRate: 0,
 * });
 *
 * await mockProvider.setSecret('API_KEY', 'test-key');
 * const value = await mockProvider.getSecret('API_KEY');
 * ```
 *
 * @see {@link SecretsModule} for NestJS integration
 * @see {@link ISecretProvider} for the provider interface
 * @see {@link GcpSecretManagerProvider} for GCP Secret Manager
 * @see {@link HashiCorpVaultProvider} for HashiCorp Vault
 * @see {@link OnePasswordProvider} for 1Password
 *
 * Related packages:
 * - `@package/core` - Base infrastructure utilities
 *
 * @packageDocumentation
 */

// ====================================================================
// Configuration
// ====================================================================
export * from './config';

// ====================================================================
// Errors
// ====================================================================
export * from './errors';

// ====================================================================
// Base Provider
// ====================================================================
export * from './base-provider';

// ====================================================================
// Mock Provider
// ====================================================================
export * from './mock-provider';

// ====================================================================
// Providers
// ====================================================================
export { SecretProviderFactory } from './secret-provider.factory';
export { HashiCorpVaultProvider } from './hashicorp-vault.provider';
export { GcpSecretManagerProvider } from './gcp-secret-manager.provider';
export { OnePasswordProvider } from './one-password.provider';
export type {
  ISecretProvider,
  SecretProvider,
  SecretProviderOptions
} from './secret-provider.interface';

// ====================================================================
// Utilities
// ====================================================================
export * from './utils';

// ====================================================================
// NestJS Module
// ====================================================================
export * from './secrets.module';
