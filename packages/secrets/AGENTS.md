# @package/secrets

Enterprise-grade secret management with multi-provider support for GCP, HashiCorp Vault, and 1Password.

## Purpose

This package provides a unified interface for secret management across multiple providers. It supports GCP Secret Manager, HashiCorp Vault, and 1Password with automatic OpenTelemetry tracing, retry logic, caching, and NestJS integration.

## Structure

```text
src/
├── config/                  # Configuration resolution
│   ├── config-resolver.ts   # Environment variable fallbacks
│   ├── defaults.ts          # Default configuration values
│   └── interfaces.ts        # Configuration interfaces
├── utils/                   # Utility functions
│   ├── cache.ts             # Caching helpers
│   └── retry.ts             # Retry logic with exponential backoff
├── base-provider.ts         # Base class with OpenTelemetry tracing
├── mock-provider.ts         # Mock provider for local development
├── gcp-secret-manager.provider.ts    # GCP Secret Manager implementation
├── hashicorp-vault.provider.ts       # HashiCorp Vault implementation
├── one-password.provider.ts          # 1Password implementation
├── secret-provider.factory.ts        # Factory for creating providers
├── secret-provider.interface.ts      # ISecretProvider interface
├── secrets.module.ts        # NestJS module with forRoot/forRootAsync
├── errors.ts                # Typed error classes
└── index.ts
```

## Usage

```typescript
// NestJS module setup
import { Module } from '@nestjs/common';
import { SecretsModule } from '@package/secrets';

@Module({
  imports: [
    SecretsModule.forRoot({
      provider: 'gcp',
      gcp: {
        projectId: 'my-gcp-project',
        kmsKeyLocation: 'global',
        kmsKeyRingId: 'vault-keys',
        kmsKeyId: 'vault-key'
      }
    })
  ]
})
export class AppModule {}

// Inject and use in a service
import { Injectable, Inject } from '@nestjs/common';
import { SECRET_PROVIDER_TOKEN, ISecretProvider } from '@package/secrets';

@Injectable()
export class DatabaseService {
  constructor(@Inject(SECRET_PROVIDER_TOKEN) private readonly secrets: ISecretProvider) {}

  async getDatabaseUrl(): Promise<string> {
    return this.secrets.getSecret('DATABASE_URL');
  }

  async encryptSensitiveData(data: string): Promise<string> {
    return this.secrets.encrypt(data);
  }
}
```

## Key Exports

### Providers

- `GcpSecretManagerProvider` - GCP Secret Manager with KMS encryption
- `HashiCorpVaultProvider` - HashiCorp Vault with AppRole authentication
- `OnePasswordProvider` - 1Password service account integration
- `MockSecretProvider` - Mock provider for local development
- `SecretProviderFactory` - Factory for creating providers by type

### NestJS Integration

- `SecretsModule` - Global module with `forRoot` and `forRootAsync` patterns
- `SECRET_PROVIDER_TOKEN` - Injection token for `ISecretProvider`

### Interfaces and Types

- `ISecretProvider` - Provider interface with getSecret, setSecret, encrypt, decrypt
- `SecretProviderType` - Enum: `gcp`, `hashicorp`, `onepassword`
- `SecretsModuleConfig` - Module configuration interface
- `InfrastructureSecretsConfig` - Infrastructure configuration

### Error Classes

- `SecretNotFoundError` - Secret key not found
- `SecretProviderConfigError` - Invalid provider configuration
- `SecretOperationError` - General operation failure
- `SecretProviderUnavailableError` - Provider connectivity issues
- `SecretCryptoError` - Encryption/decryption failures
- `SecretRotationError` - Secret rotation failures

### Utilities

- `resolveConfig` - Configuration resolution with environment fallbacks
- `withCache` - Caching decorator for provider methods
- `withRetry` - Retry logic with exponential backoff

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
