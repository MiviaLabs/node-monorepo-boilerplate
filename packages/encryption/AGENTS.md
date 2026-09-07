# @package/encryption

Enterprise-grade encryption infrastructure with multi-provider KMS support and field-level encryption decorators.

## Purpose

This package provides comprehensive encryption capabilities for protecting sensitive data (Class-C):

- **Multiple KMS Providers**: GCP KMS, AWS KMS, Azure Key Vault, HashiCorp Vault Transit, GCP Secret Manager, and environment variables
- **Envelope Encryption**: Industry-standard pattern where data keys (DEK) are wrapped by master keys (KEK)
- **Single Primary Key Architecture**: Cost-optimized single KEK shared across all tenants ($1/month vs $1M+/month for 1M tenants)
- **Tenant Isolation via DEKs**: Each vault entry has unique DEK, tenant isolation maintained through data encryption not key management
- **Field-Level Encryption**: `@Encrypted()` decorator for automatic entity field encryption/decryption
- **Multi-Tenancy Support**: Tenant isolation via unique DEKs per entry and database `organizationId` scoping
- **OpenTelemetry Integration**: Built-in tracing for encryption operations
- **NestJS Module**: Ready-to-use `EncryptionModule` with dependency injection

## Structure

```text
src/
├── config/                    # Configuration schemas and resolvers
│   ├── encryption-config.ts
│   └── encryption-config.schema.ts
├── decorators/                # Field-level encryption decorators
│   ├── encrypted.decorator.ts     # @Encrypted() and @EncryptedEntity()
│   ├── encrypted-metadata.ts      # Metadata storage utilities
│   ├── entity-transformer.ts      # Transform entities for storage
│   └── hooks.ts                   # ORM lifecycle hooks
├── providers/                 # KMS provider implementations
│   ├── kms-provider.interface.ts  # IKmsProvider interface
│   ├── factory.ts                 # Provider factory
│   ├── gcp-kms.provider.ts
│   ├── aws-kms.provider.ts
│   ├── azure-keyvault.provider.ts
│   ├── vault-transit.provider.ts
│   ├── gcp-secret-manager.provider.ts
│   └── env-var.provider.ts
├── services/                  # High-level encryption services
│   ├── encryption.service.ts      # Main encryption API
│   ├── envelope-encryption.service.ts
│   ├── key-rotation.service.ts
│   └── data-migration.service.ts
├── encryption.module.ts       # NestJS module
├── errors.ts                  # Error types
├── constants.ts               # Encryption constants
├── telemetry.ts               # OpenTelemetry integration
└── index.ts
```

## Usage

```typescript
import {
  EncryptionModule,
  EncryptionService,
  Encrypted,
  EncryptedEntity
} from '@package/encryption';

// NestJS Module Setup
@Module({
  imports: [
    EncryptionModule.forRoot({
      providers: [
        {
          type: 'gcp',
          projectId: 'my-project',
          locationId: 'global',
          keyRingId: 'my-keyring',
          keyId: 'my-key',
          default: true
        }
      ]
    })
  ]
})
export class AppModule {}

// Direct Service Usage
@Injectable()
export class UserService {
  constructor(private readonly encryption: EncryptionService) {}

  async encryptSsn(ssn: string): Promise<IBase64EncryptionResult> {
    return this.encryption.encryptToBase64(ssn);
  }

  async decryptSsn(encrypted: IBase64EncryptionResult): Promise<string> {
    return this.encryption.decryptFromBase64(
      encrypted.ciphertext,
      encrypted.encryptedDataKey,
      encrypted.iv,
      encrypted.authTag
    );
  }
}

// Field-Level Encryption with Decorators
@EncryptedEntity({ provider: 'gcp', keyId: 'my-key' })
class User {
  id: string;
  username: string; // Not encrypted - used for lookups

  @Encrypted()
  email: string; // PII - encrypted with entity defaults

  @Encrypted({ keyId: 'high-security-key' })
  ssn: string; // Uses dedicated key
}
```

## Key Exports

### Module and Services

- `EncryptionModule` - NestJS dynamic module with `forRoot()` and `forRootAsync()`
- `EncryptionService` - Main encryption API with `encrypt()`, `decrypt()`, `encryptToBase64()`, `decryptFromBase64()`
- `EnvelopeEncryptionService` - Low-level envelope encryption operations
- `KeyRotationService` - Key rotation workflow management
- `DataMigrationService` - Encrypted data migration utilities

### Decorators

- `@Encrypted(options?)` - Mark entity fields for automatic encryption
- `@EncryptedEntity(options)` - Set entity-level encryption defaults
- `EntityTransformer` - Transform entities before storage / after retrieval
- `EncryptedEntityHooks` - ORM lifecycle hooks for automatic encryption

### Providers

- `GcpKmsProvider` - Google Cloud KMS
- `AwsKmsProvider` - AWS KMS
- `AzureKeyVaultProvider` - Azure Key Vault
- `VaultTransitProvider` - HashiCorp Vault Transit
- `GcpSecretManagerProvider` - GCP Secret Manager
- `EnvVarProvider` - Environment variable-based keys (development only)
- `KmsProviderFactory` - Factory for creating and managing providers

### Types

- `IKmsProvider` - KMS provider interface
- `IEncryptionModuleConfig` - Module configuration
- `IBase64EncryptionResult` - Base64-encoded encryption result
- `IEncryptedOptions` - Field decorator options
- `IEnvelopeEncryptionResult` - Raw encryption result with buffers

### Errors

- `EncryptionError` - Base encryption error
- `KmsProviderNotFoundError` - Provider not registered
- `KmsProviderUnavailableError` - Provider health check failed
- `EncryptionOperationError` - Encryption operation failed
- `DecryptionOperationError` - Decryption operation failed

## Associated Packages

- `@package/db-core` - Vault entries for encrypted data
- `@package/observability` - Encryption operation tracing
- `@package/core` - Base error classes

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
