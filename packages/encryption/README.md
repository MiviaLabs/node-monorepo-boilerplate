# @package/encryption

Enterprise-grade encryption infrastructure with multi-cloud KMS support, envelope encryption, and entity field encryption.

## Overview

`@package/encryption` provides a complete encryption infrastructure for the Node Monorepo Boilerplate with support for:

- Multiple KMS providers (GCP, AWS, Azure, HashiCorp Vault)
- Envelope encryption pattern
- Entity field encryption via `@Encrypted()` decorator
- OpenTelemetry integration for observability
- NestJS module support

## Features

- **Multi-Cloud KMS Support** - GCP KMS, AWS KMS, Azure Key Vault, HashiCorp Vault Transit, GCP Secret Manager
- **Envelope Encryption** - Efficient encryption using data keys (DEKs) encrypted by key encryption keys (KEKs)
- **Single Primary Key Architecture** - Cost-optimized single KEK shared across all tenants ($1/month vs $1M+/month for 1M tenants)
- **Tenant Isolation via DEKs** - Each vault entry has unique DEK, tenant isolation maintained through data encryption not key management
- **@Encrypted Decorator** - Automatic entity field encryption/decryption
- **Key Rotation Service** - Automated encryption key rotation workflows
- **Data Migration Service** - Bulk data re-encryption with progress tracking
- **OpenTelemetry Integration** - Built-in tracing and metrics
- **NestJS Module** - Easy integration with NestJS applications
- **Type-Safe** - Full TypeScript support
- **Mock Provider** - Testing without external dependencies

## Installation

```bash
pnpm install @package/encryption
```

## Quick Start

### Basic Usage (NestJS)

```typescript
import { Module } from '@nestjs/common';
import { EncryptionModule, gcpKmsConfig } from '@package/encryption';

@Module({
  imports: [
    EncryptionModule.forRoot({
      providers: [
        gcpKmsConfig({
          projectId: 'my-project',
          locationId: 'global',
          keyRingId: 'my-keyring',
          keyId: 'my-key',
          default: true
        })
      ]
    })
  ]
})
export class AppModule {}
```

### Using the Encryption Service

```typescript
import { Injectable } from '@nestjs/common';
import { EncryptionService } from '@package/encryption';

@Injectable()
export class UsersService {
  constructor(private readonly encryption: EncryptionService) {}

  async encryptSensitiveData(data: string): Promise<string> {
    const result = await this.encryption.encryptToBase64(data);
    return result.ciphertext;
  }

  async decryptSensitiveData(encrypted: string): Promise<string> {
    // Need to store encryptedDataKey, iv, and authTag alongside ciphertext
    return this.encryption.decryptFromBase64(
      encrypted.ciphertext,
      encrypted.encryptedDataKey,
      encrypted.iv,
      encrypted.authTag
    );
  }
}
```

### @Encrypted Decorator

```typescript
import { Encrypted } from '@package/encryption';

class User {
  id: string;

  @Encrypted()
  email: string;

  @Encrypted({ keyId: 'ssn-key', provider: 'aws' })
  ssn: string;

  @Encrypted({ provider: 'azure' })
  phone: string;
}

// Automatically encrypt before saving
const encryptedUser = await entityTransformer.encryptEntity(user);

// Automatically decrypt after reading
const decryptedUser = await entityTransformer.decryptEntity(encryptedUser);
```

## Configuration

### Environment Variables (Recommended)

The package supports automatic configuration from environment variables. Set the variables for your chosen KMS provider:

```bash
# GCP KMS
GCP_PROJECT_ID=my-project
GCP_LOCATION_ID=global
GCP_KEY_RING_ID=my-keyring
GCP_KEY_ID=my-key

# AWS KMS
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=alias/my-key

# Azure Key Vault
AZURE_VAULT_URL=https://my-vault.vault.azure.net
AZURE_KEY_NAME=my-key

# Vault Transit
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=your-token
```

Then use `EncryptionModule.forRoot()` without arguments:

```typescript
@Module({
  imports: [
    EncryptionModule.forRoot() // Providers resolved from environment variables
  ]
})
export class AppModule {}
```

For applications that explicitly support `EnvVarProvider` selection (for example, via `ENCRYPTION_PROVIDER=env-var` in app config), set:

```bash
# EnvVarProvider key material
ENCRYPTION_KEY=<64-character hex key>
ENCRYPTION_KEY_<keyId>=<64-character hex key>
```

### Provider Configuration (Alternative)

You can also explicitly configure providers:

```typescript
import {
  gcpKmsConfig,
  awsKmsConfig,
  azureKeyVaultConfig,
  vaultTransitConfig
} from '@package/encryption';

// GCP KMS
const gcpConfig = gcpKmsConfig({
  projectId: 'my-project',
  locationId: 'global',
  keyRingId: 'my-keyring',
  keyId: 'my-key',
  default: true,
  credentialsFile: './path/to/credentials.json'
});

// AWS KMS
const awsConfig = awsKmsConfig({
  region: 'us-east-1',
  keyId: 'alias/my-key',
  default: false
});

// Azure Key Vault
const azureConfig = azureKeyVaultConfig({
  vaultUrl: 'https://my-vault.vault.azure.net',
  keyName: 'my-key',
  credentialType: 'default'
});

// Vault Transit
const vaultConfig = vaultTransitConfig({
  address: 'https://vault.example.com',
  token: process.env.VAULT_TOKEN,
  enginePath: 'transit',
  keyName: 'my-key'
});
```

### Module Configuration

```typescript
EncryptionModule.forRoot({
  providers: [gcpConfig, awsConfig],
  encryption: {
    algorithm: 'aes-256-gcm',
    enableDecorators: true,
    enableMetrics: true
  }
});
```

### Hybrid Configuration (Env Vars + Overrides)

Combine environment variables with explicit overrides:

```typescript
EncryptionModule.forRoot({
  infrastructureConfig: {
    gcp: {
      // Override specific values, rest come from env vars
      projectId: 'my-project'
    },
    encryption: {
      algorithm: 'aes-256-gcm'
    }
  }
});
```

### Async Configuration

```typescript
import { ConfigService } from '@nestjs/config';

EncryptionModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    // Option 1: Return explicit provider configuration
    return {
      providers: [
        gcpKmsConfig({
          projectId: config.get('GCP_PROJECT_ID'),
          locationId: config.get('GCP_LOCATION_ID'),
          keyRingId: config.get('GCP_KEY_RING_ID'),
          keyId: config.get('GCP_KEY_ID'),
          default: true
        })
      ]
    };

    // Option 2: Return infrastructure config (providers resolved from env)
    // return {
    //   infrastructureConfig: {
    //     gcp: {
    //       projectId: config.get('GCP_PROJECT_ID'),
    //     },
    //   },
    // };

    // Option 3: Return empty config (providers resolved from env vars)
    // return {};
  }
});
```

### Environment Variable Reference

| Variable                       | Description                         | Required    |
| ------------------------------ | ----------------------------------- | ----------- |
| `GCP_PROJECT_ID`               | GCP project ID                      | For GCP KMS |
| `GCP_LOCATION_ID`              | KMS location (e.g., 'global')       | For GCP KMS |
| `GCP_KEY_RING_ID`              | Key ring ID                         | For GCP KMS |
| `GCP_KEY_ID`                   | Crypto key ID                       | For GCP KMS |
| `GCP_CREDENTIALS_FILE`         | Path to service account credentials | Optional    |
| `GCP_KMS_ENDPOINT`             | Custom endpoint (for testing)       | Optional    |
| `AWS_REGION`                   | AWS region                          | For AWS KMS |
| `AWS_KMS_KEY_ID`               | KMS key ID or ARN                   | Optional    |
| `AWS_ACCESS_KEY_ID`            | AWS access key                      | Optional    |
| `AWS_SECRET_ACCESS_KEY`        | AWS secret key                      | Optional    |
| `AWS_SESSION_TOKEN`            | AWS session token                   | Optional    |
| `AWS_KMS_ENDPOINT`             | Custom endpoint (for testing)       | Optional    |
| `AZURE_VAULT_URL`              | Key Vault URL                       | For Azure   |
| `AZURE_KEY_NAME`               | Key name in Key Vault               | Optional    |
| `AZURE_KEY_VERSION`            | Key version                         | Optional    |
| `AZURE_CREDENTIAL_TYPE`        | Credential type                     | Optional    |
| `AZURE_CLIENT_ID`              | Client ID for clientSecret auth     | Optional    |
| `AZURE_CLIENT_SECRET`          | Client secret                       | Optional    |
| `AZURE_TENANT_ID`              | Tenant ID                           | Optional    |
| `VAULT_ADDR`                   | Vault address                       | For Vault   |
| `VAULT_TOKEN`                  | Vault token                         | For Vault   |
| `VAULT_TRANSIT_ENGINE_PATH`    | Transit engine path                 | Optional    |
| `VAULT_TRANSIT_KEY_NAME`       | Transit key name                    | Optional    |
| `VAULT_NAMESPACE`              | Vault namespace                     | Optional    |
| `ENCRYPTION_KEY`               | Default EnvVarProvider key (hex)    | Optional\*  |
| `ENCRYPTION_KEY_<keyId>`       | EnvVarProvider key by key ID (hex)  | Optional\*  |
| `ENCRYPTION_ALGORITHM`         | Encryption algorithm                | Optional    |
| `ENCRYPTION_ENABLE_DECORATORS` | Enable @Encrypted decorator         | Optional    |
| `ENCRYPTION_ENABLE_METRICS`    | Enable OpenTelemetry metrics        | Optional    |

\* Required when `EnvVarProvider` is selected by the application.

## API Reference

### EncryptionService

```typescript
class EncryptionService {
  // Encrypt data using envelope encryption
  encrypt(
    plaintext: Buffer | string,
    options?: EncryptionOptions
  ): Promise<IEnvelopeEncryptionResult>;

  // Decrypt data
  decrypt(
    ciphertext: Buffer,
    encryptedDataKey: Buffer,
    iv: Buffer,
    authTag: Buffer,
    options?: EncryptionOptions
  ): Promise<Buffer>;

  // Encrypt to base64
  encryptToBase64(plaintext: string, options?: EncryptionOptions): Promise<Base64EncryptedResult>;

  // Decrypt from base64
  decryptFromBase64(
    ciphertext: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string,
    options?: EncryptionOptions
  ): Promise<string>;
}
```

### EnvelopeEncryptionService

```typescript
class EnvelopeEncryptionService {
  constructor(kmsProvider: IKmsProvider, options?: IEnvelopeEncryptionOptions);

  encrypt(
    plaintext: Buffer | string,
    options?: { keyId?: string }
  ): Promise<IEnvelopeEncryptionResult>;
  decrypt(
    ciphertext: Buffer,
    encryptedDataKey: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer>;
  encryptToBase64(plaintext: string): Promise<Base64EncryptedResult>;
  decryptFromBase64(
    ciphertext: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string
  ): Promise<string>;
}
```

### KMS Providers

All providers implement the `IKmsProvider` interface:

```typescript
interface IKmsProvider {
  readonly name: string;
  encrypt(plaintext: Buffer, keyId?: string): Promise<Buffer>;
  decrypt(ciphertext: Buffer, keyId?: string): Promise<Buffer>;
  generateDataKey(keyId?: string): Promise<IDataKeyResult>;
  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}
```

### @Encrypted Decorator Options

```typescript
interface IEncryptedOptions {
  keyId?: string; // KMS key ID to use
  provider?: string; // Provider name ('gcp', 'aws', 'azure', 'vault')
  algorithm?: 'aes-256-gcm' | 'aes-128-gcm';
  allowNull?: boolean; // Allow null values (default: false)
}
```

## Running Tests

### Mock Provider

```typescript
import { createMockKmsProvider } from '@package/encryption';

const mockKms = createMockKmsProvider({
  name: 'test-kms',
  latency: 10, // Simulate latency in ms
  failureRate: 0.01 // 1% failure rate
});

await mockKms.encrypt(Buffer.from('data'));
```

### Running Tests

```bash
# All tests
pnpm nx test encryption

# Unit tests only
pnpm run test:unit

# Integration tests
INCLUDE_INTEGRATION_TESTS=1 pnpm run test:integration
```

## Architecture

### Single Primary Key Architecture

**Cost-Optimized Design**: All tenants share `primary-encryption-key` (single KEK)

**Key Insight**: Tenant isolation is achieved through **DATA ENCRYPTION (DEKs)**, not **KEY MANAGEMENT (KEKs)**.

```
┌─────────────────────────────────────────────────────────────┐
│                      Vault Entry (Tenant 1)                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  DEK 1 (unique) encrypts: user@example.com           │  │
│  │  DEK 1 encrypted by: primary-encryption-key (KEK)    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Vault Entry (Tenant 2)                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  DEK 2 (unique) encrypts: admin@tenant2.com          │  │
│  │  DEK 2 encrypted by: primary-encryption-key (KEK)    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Benefits**:

- **Cost**: $1/month vs $1M+/month for 1M tenant-specific keys
- **Simplicity**: One key to manage, rotate, and monitor
- **Security**: Tenant isolation via unique DEKs (not KEKs)

**Multi-tenancy preserved**:

- Each vault entry has unique DEK (Data Encryption Key)
- Database queries scoped by `organizationId`
- KEK only wraps DEKs, does not encrypt data directly

### Multi-Provider Support

The package uses a factory pattern to support multiple KMS providers:

1. **Provider Interface** - `IKmsProvider` defines the contract
2. **Provider Factory** - Creates and manages provider instances
3. **Provider Implementations** - GCP, AWS, Azure, Vault
4. **Base Provider** - Common functionality with OpenTelemetry metrics

### Envelope Encryption

1. Generate a data key (DEK) from KMS
2. Encrypt data with the DEK (AES-256-GCM)
3. Encrypt the DEK with the KEK (`primary-encryption-key`)
4. Store encrypted DEK alongside encrypted data
5. To decrypt: decrypt DEK from KMS, then decrypt data with DEK

### @Encrypted Decorator

1. Decorator marks entity fields for encryption
2. EntityTransformer encrypts/decrypts entire entities
3. Lifecycle hooks integrate with ORMs
4. Metadata stores encryption configuration per field

## Best Practices

1. **Envelope Encryption** - Use for large data to reduce KMS calls
2. **Key Rotation** - Regularly rotate KMS keys (every 90-180 days)
3. **Multiple Providers** - Configure fallback providers
4. **Testing** - Use mock provider in tests
5. **Monitoring** - Enable OpenTelemetry metrics
6. **Error Handling** - Handle encryption failures gracefully

## Documentation

- **[Key Rotation Guide](./docs/KEY_ROTATION_GUIDE.md)** - Complete guide for rotating encryption keys
- **[Migration Guide](./docs/MIGRATION_GUIDE.md)** - Detailed procedures for migrating encrypted data
- **[Provider Documentation](./docs/PROVIDERS.md)** - Configuration and setup for each KMS provider
- **[Performance Guide](./docs/PERFORMANCE.md)** - Performance characteristics and optimization strategies
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Examples

- **[Basic Rotation](./examples/basic-rotation.ts)** - Simple key rotation examples
- **[Data Migration](./examples/data-migration.ts)** - Data migration examples with progress tracking

## Key Rotation

This package includes comprehensive key rotation support:

```typescript
import { KeyRotationService, DataMigrationService } from '@package/encryption';

// Validate rotation is possible
const rotationService = new KeyRotationService(providerGetter, 'default');
await rotationService.validateRotation({
  organizationId: 'org-123',
  currentKeyId: 'old-key',
  newKeyId: 'new-key'
});

// Re-encrypt data keys
const result = await rotationService.reencryptDataKey(encryptedDataKey, {
  organizationId: 'org-123',
  currentKeyId: 'old-key',
  newKeyId: 'new-key'
});

// Migrate all encrypted data
const migrationService = new DataMigrationService(providerGetter, 'default');
const migrationResult = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 100,
  onProgress: (progress) => {
    console.log(`Progress: ${progress.processed}/${progress.total}`);
  }
});
```

For detailed key rotation workflows, see the [Key Rotation Guide](./docs/KEY_ROTATION_GUIDE.md).

## Breaking Changes from v0.0.1

- Renamed `EnvelopeEncryption` to `EnvelopeEncryptionService`
- Renamed `GcpKmsClient` to `GcpKmsProvider`
- Renamed `VaultTransitClient` to `VaultTransitProvider`
- Added AWS KMS and Azure Key Vault providers
- Added OpenTelemetry integration
- Added `@Encrypted()` decorator
- Added NestJS module support
- Changed configuration format

## Migration from v0.0.1

```typescript
// Old
import { EnvelopeEncryption, GcpKmsClient } from '@package/encryption';

const kms = new GcpKmsClient({ projectId, locationId, keyRingId, keyId });
const encryption = new EnvelopeEncryption(kms);

// New
import { EnvelopeEncryptionService, GcpKmsProvider } from '@package/encryption';

const kms = new GcpKmsProvider({ projectId, locationId, keyRingId, keyId });
const encryption = new EnvelopeEncryptionService(kms);
```

## Dependencies

- `@opentelemetry/api` - OpenTelemetry integration
- `@nestjs/common` - NestJS support
- `@google-cloud/kms` - GCP KMS
- `@aws-sdk/client-kms` - AWS KMS
- `@azure/keyvault-keys` - Azure Key Vault
- `@azure/identity` - Azure authentication
- `@azure/core-rest-pipeline` - Required for `RestError` type used in `instanceof` checks for Azure SDK error handling (e.g., detecting 404 responses). Pinned to ensure version compatibility with other `@azure/*` packages.
- `node-vault` - HashiCorp Vault
- `reflect-metadata` - Decorator metadata

## Links

- [GCP KMS Documentation](https://cloud.google.com/kms/docs)
- [AWS KMS Documentation](https://docs.aws.amazon.com/kms/)
- [Azure Key Vault Documentation](https://learn.microsoft.com/azure/key-vault/)
- [Vault Transit Documentation](https://www.vaultproject.io/docs/secrets/transit)
