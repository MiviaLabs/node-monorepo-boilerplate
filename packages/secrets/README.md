# @package/secrets

Unified secret management interface supporting multiple providers for secure credential storage and encryption operations.

## Supported Providers

- **GCP Secret Manager** - Google Cloud's secret management service
- **HashiCorp Vault** - Industry-leading secret management
- **1Password** - Password manager and secrets automation
- **DevSecretProvider** - Development provider (environment variables)

## Installation

This package is part of the Node Monorepo Boilerplate monorepo.

```bash
pnpm install @package/secrets
```

## Quick Start

### Using the Factory

```typescript
import { SecretProviderFactory } from '@package/secrets';

// Create provider based on environment variable
const provider = SecretProviderFactory.create();

// Fetch a secret
const dbUrl = await provider.getSecret('DATABASE_URL');
```

### Direct Provider Instantiation

```typescript
import { OnePasswordProvider } from '@package/secrets';

const provider = new OnePasswordProvider({
  token: process.env.OP_SERVICE_ACCOUNT_TOKEN,
  vaultId: 'runtime-secrets',
  itemName: 'Runtime Secrets',
  fieldName: 'notes' // Optional: field for text-based format
});

const secret = await provider.getSecret('MY_SECRET');
```

## Configuration

### Provider Selection

Set the `SECRET_PROVIDER` environment variable:

```bash
# .env
SECRET_PROVIDER=onepassword  # gcp | hashicorp | onepassword
```

### 1Password Configuration

```bash
# Required
OP_SERVICE_ACCOUNT_TOKEN=op_service_account_token

# Optional (with defaults)
OP_VAULT_ID=runtime-secrets
OP_ITEM_NAME=Runtime Secrets
OP_FIELD_NAME=notes
```

### GCP Configuration

```bash
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./path/to/credentials.json
KMS_KEY_LOCATION=global
KMS_KEY_RING_ID=vault-keys
KMS_KEY_ID=vault-key

# Optional: Enable caching (default: false)
GCP_ENABLE_CACHE=true
GCP_CACHE_TTL=300000

# Optional: Configure retry (default: true, 5 retries)
GCP_ENABLE_RETRY=true
GCP_MAX_RETRIES=5
GCP_RETRY_BASE_DELAY_MS=100
GCP_RETRY_MAX_DELAY_MS=10000
```

### HashiCorp Vault Configuration

```bash
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-token
VAULT_ROLE_ID=role-id
VAULT_SECRET_ID=secret-id
```

## API Reference

### SecretProvider Interface

```typescript
interface SecretProvider {
  getSecret(key: string): Promise<string>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  generateDataKey(keyId?: string): Promise<{ plaintext: Buffer; ciphertext: Buffer }>;
  encrypt(plaintext: string, keyId?: string): Promise<string>;
  decrypt(ciphertext: string, keyId?: string): Promise<string>;
  rotateSecret(key: string): Promise<void>;
}
```

### Factory Methods

```typescript
class SecretProviderFactory {
  // Create provider from environment or options
  static create(options?: SecretProviderOptions): SecretProvider;

  // Create development provider (reads from process.env)
  static createDev(): SecretProvider;
}
```

## 1Password Provider

The 1Password provider supports two secret formats:

1. **Field-based** (preferred): Each secret is a separate field in the 1Password item
2. **Text-based**: KEY=VALUE pairs stored in a single field (default: "notes")

### Format Auto-Detection

The provider automatically tries both formats:

```typescript
const provider = new OnePasswordProvider({
  token: 'op_...',
  vaultId: 'my-vault',
  itemName: 'My Secrets',
  fieldName: 'notes' // Optional: specifies field for text-based format
});

// 1. Tries field-based: op item get "My Secrets" --fields label="MY_SECRET"
// 2. Falls back to text-based in "notes" field
// 3. Falls back to searching all fields for KEY=VALUE pairs
```

### Unsupported Operations

The following operations throw errors (use DevSecretProvider or external KMS):

- `deleteSecret()` - Use 1Password app or API
- `generateDataKey()` - Use Dev provider or external KMS
- `encrypt()` / `decrypt()` - Use Dev provider or external KMS
- `rotateSecret()` - Use 1Password app or API

### Caching

Secrets are cached in memory for 5 minutes to reduce CLI calls. The cache is automatically invalidated on `setSecret()` operations.

```typescript
const provider = new OnePasswordProvider({ token: 'op_...' });

// First call: fetches from 1Password CLI
const value1 = await provider.getSecret('MY_SECRET');

// Within 5 minutes: returns cached value
const value2 = await provider.getSecret('MY_SECRET');

// After 5 minutes: fetches fresh value
const value3 = await provider.getSecret('MY_SECRET');

// Manual cache clearing
provider.clearCache();
```

## Building

```bash
pnpm nx build secrets
```

## Running Tests

```bash
# Run all tests
pnpm nx test secrets

# Run only unit tests
pnpm nx test secrets -- src/**/*.test.ts

# Run only integration tests (requires GCP emulator)
pnpm nx test secrets -- src/**/*.integration.test.ts

# Watch mode
pnpm nx test secrets -- --watch
```

### Integration Tests with GCP Emulator

To run integration tests, start the GCP Secret Manager emulator:

```bash
# Install gcloud CLI if not already installed
# Then start the emulator
gcloud beta emulators secret-manager start \
  --host-port=localhost:9000 \
  --project=test-project

# In another terminal, set environment variables and run tests
export SECRET_MANAGER_EMULATOR_HOST=localhost:9000
export GOOGLE_CLOUD_PROJECT=test-project

pnpm nx test secrets -- src/**/*.integration.test.ts
```

## Advanced Features

### Secret Caching

GCP Secret Manager provider supports optional in-memory caching to reduce API calls:

```typescript
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project',
  enableCache: true,
  cacheTtl: 300000 // 5 minutes
});

// First call fetches from GCP
const value1 = await provider.getSecret('my-secret');

// Subsequent calls within TTL return cached value
const value2 = await provider.getSecret('my-secret');

// Manual cache invalidation
provider.clearCache();
```

### Retry Logic

All GCP operations automatically retry with exponential backoff on transient failures:

```typescript
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project',
  enableRetry: true,
  maxRetries: 5,
  retryBaseDelayMs: 100,
  retryMaxDelayMs: 10000
});
```

### Secret Versioning

Retrieve specific versions of secrets:

```typescript
// Get latest version
const latest = await provider.getSecret('my-secret');

// Get specific version
const version2 = await provider.getSecret('my-secret:2');

// List all versions
const versions = await provider.listVersions('my-secret');
```

### Error Handling

The package provides custom error types for better error handling:

```typescript
import {
  SecretNotFoundError,
  SecretProviderConfigError,
  SecretOperationError,
  SecretCryptoError,
  SecretRotationError
} from '@package/secrets';

try {
  await provider.getSecret('non-existent');
} catch (error) {
  if (error instanceof SecretNotFoundError) {
    console.error('Secret not found:', error.resourceName);
  } else if (error instanceof SecretOperationError) {
    console.error('Operation failed:', error.operation, error.cause);
  }
}
```

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.
