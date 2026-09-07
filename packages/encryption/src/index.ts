/**
 * @package/encryption
 *
 * Enterprise-grade encryption infrastructure with support for:
 * - Multiple KMS providers (GCP, AWS, Azure, Vault, GCP Secret Manager)
 * - Envelope encryption pattern
 * - Entity field encryption via @Encrypted decorator
 * - OpenTelemetry integration
 * - NestJS module support
 *
 * @see @package/secrets - Secret management integration
 * @see @package/auth - Authentication token encryption
 * @see @package/core - Base infrastructure utilities
 * @see @package/observability - Encryption operation tracing
 *
 * @packageDocumentation
 */

// ====================================================================
// Core Module
// ====================================================================
export * from './encryption.module';

// ====================================================================
// Errors
// ====================================================================
export * from './errors';

// ====================================================================
// Providers
// ====================================================================
export * from './providers/kms-provider.interface';
export * from './providers/factory.types';
// Re-export specific types from factory to avoid conflicts
export {
  KmsProviderFactory,
  kmsProviderFactory,
  createKmsProvider,
  getKmsProvider,
  getDefaultKmsProvider
} from './providers/factory';
export type {
  IGcpKmsProviderOptions,
  IAwsKmsProviderOptions,
  IAzureKeyVaultProviderOptions,
  IVaultTransitProviderOptions,
  IGcpSecretManagerProviderOptions,
  IEnvVarProviderOptions,
  IKmsProvider
} from './providers/factory';
export type { IKmsProviderConfig } from './providers/factory';

// Individual providers
export { GcpKmsProvider } from './providers/gcp-kms.provider';
export { AwsKmsProvider } from './providers/aws-kms.provider';
export { AzureKeyVaultProvider } from './providers/azure-keyvault.provider';
export { VaultTransitProvider } from './providers/vault-transit.provider';
export { GcpSecretManagerProvider } from './providers/gcp-secret-manager.provider';
export { EnvVarProvider } from './providers/env-var.provider';

// ====================================================================
// Services
// ====================================================================
export * from './services/encryption.service';
export * from './services/envelope-encryption.service';
export * from './services/key-rotation.service';
export * from './services/data-migration.service';

// ====================================================================
// Decorators
// ====================================================================
export * from './decorators/encrypted.decorator';
export * from './decorators/encrypted-metadata';
export * from './decorators/entity-transformer';
export * from './decorators/hooks';

// ====================================================================
// Configuration
// ====================================================================
export * from './config/encryption-config';
export * from './config/encryption-config.schema';
// Re-export specific types from encryption.module
export type { IEncryptionModuleConfig, EncryptionModuleOptions } from './encryption.module';

// ====================================================================
// Telemetry
// ====================================================================
export * from './telemetry';
