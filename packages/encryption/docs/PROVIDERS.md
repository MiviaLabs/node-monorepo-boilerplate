# Provider Documentation

Complete guide for configuring and using different KMS providers.

## Table of Contents

- [Overview](#overview)
- [GCP Secret Manager](#gcp-secret-manager)
- [Environment Variable Provider](#environment-variable-provider)
- [GCP KMS](#gcp-kms)
- [AWS KMS](#aws-kms)
- [Azure Key Vault](#azure-key-vault)
- [HashiCorp Vault](#hashicorp-vault)
- [Provider Comparison](#provider-comparison)

## Overview

This package supports multiple KMS providers through a unified interface:

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

## GCP Secret Manager

### Overview

The GCP Secret Manager provider stores encryption keys in Google Cloud Secret Manager. It can optionally use GCP KMS for actual encryption operations.

### Use Cases

- Storing keys securely in Google Cloud
- Automatic key rotation support
- Fine-grained IAM permissions
- Audit logging integration

### Configuration

#### Environment Variables

```bash
# Required
GCP_PROJECT_ID=my-project-id

# Optional
GCP_SECRET_PREFIX=encryption-keys/  # Default prefix for secret names
GCP_CREDENTIALS_FILE=/path/to/credentials.json
GCP_CREDENTIALS_BASE64=<base64-encoded-credentials>

# KMS backing (optional)
GCP_KMS_LOCATION_ID=global
GCP_KMS_KEY_RING_ID=my-keyring
GCP_KMS_KEY_ID=my-key

# Custom endpoint (for testing)
GCP_SECRET_MANAGER_ENDPOINT=localhost:9090
```

#### Programmatic Configuration

```typescript
import { GcpSecretManagerProvider } from '@package/encryption';

// Basic configuration (Secret Manager only)
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  secretPrefix: 'encryption-keys/'
});

// With KMS backing
const providerWithKms = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  secretPrefix: 'encryption-keys/',
  kmsConfig: {
    locationId: 'global',
    keyRingId: 'my-keyring',
    keyId: 'my-key'
  },
  credentialsFile: '/path/to/credentials.json'
});

// With inline credentials
const providerWithCreds = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  credentials: {
    type: 'service_account',
    project_id: 'my-project-id',
    private_key_id: 'key-id',
    private_key: '-----BEGIN PRIVATE KEY-----\n...',
    client_email: 'service-account@my-project-id.iam.gserviceaccount.com'
    // ... other credential fields
  }
});
```

### Authentication

#### Method 1: Service Account Key File

```typescript
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  credentialsFile: '/path/to/service-account-key.json'
});
```

#### Method 2: Inline Credentials

```typescript
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  credentials: {
    type: 'service_account',
    project_id: 'my-project-id',
    private_key_id: 'key-id',
    private_key: process.env.GCP_PRIVATE_KEY,
    client_email: 'service-account@my-project-id.iam.gserviceaccount.com',
    token_uri: 'https://oauth2.googleapis.com/token'
  }
});
```

#### Method 3: Application Default Credentials

```typescript
// Uses ADC (recommended for production)
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project-id'
  // No credentials specified - uses ADC
});
```

#### Method 4: Base64-Encoded Credentials

```typescript
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  credentials: JSON.parse(
    Buffer.from(process.env.GCP_CREDENTIALS_BASE64, 'base64').toString('utf-8')
  )
});
```

### Setting Up Keys

#### Option 1: Create Secret with GCP Console

```bash
# 1. Go to Secret Manager in GCP Console
# 2. Click "Create Secret"
# 3. Name: encryption-keys/default
# 4. Secret value: Generate with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 5. Click "Create"
```

#### Option 2: Create Secret with gcloud CLI

```bash
# Generate a key
KEY_HEX=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Create secret
echo -n "$KEY_HEX" | \
  gcloud secrets create encryption-keys-default \
    --data-file=- \
    --project=my-project-id

# Add label
gcloud secrets update encryption-keys-default \
  --update-labels=purpose=encryption,managed-by=encryption \
  --project=my-project-id
```

#### Option 3: Create Secret Programmatically

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

async function createEncryptionKey(keyId: string) {
  const key = crypto.randomBytes(32).toString('hex');

  await client.createSecret({
    parent: `projects/my-project-id`,
    secretId: keyId,
    secret: {
      replication: { automatic: {} },
      labels: {
        purpose: 'encryption',
        managed_by: 'encryption'
      }
    }
  });

  const secretName = client.secretPath('my-project-id', keyId);
  await client.addSecretVersion({
    parent: secretName,
    payload: { data: Buffer.from(key, 'utf-8') }
  });

  console.log(`Created encryption key: ${keyId}`);
}
```

### IAM Permissions

Required IAM roles for the service account:

```json
{
  "bindings": [
    {
      "role": "roles/secretmanager.secretAccessor",
      "members": ["serviceAccount:encryption-service@my-project-id.iam.gserviceaccount.com"]
    },
    {
      "role": "roles/secretmanager.secretVersionAdder",
      "members": ["serviceAccount:encryption-service@my-project-id.iam.gserviceaccount.com"]
    },
    {
      "role": "roles/cloudkms.cryptoKeyEncrypterDecrypter",
      "members": ["serviceAccount:encryption-service@my-project-id.iam.gserviceaccount.com"]
    }
  ]
}
```

Grant with gcloud:

```bash
# Grant Secret Manager access
gcloud secrets add-iam-policy-binding encryption-keys-default \
  --member=serviceAccount:encryption-service@my-project-id.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project=my-project-id

# Grant KMS access (if using KMS backing)
gcloud kms keys add-iam-policy-binding my-key \
  --location=global \
  --keyring=my-keyring \
  --member=serviceAccount:encryption-service@my-project-id.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter \
  --project=my-project-id
```

### Usage Example

```typescript
import { GcpSecretManagerProvider } from '@package/encryption';
import { EnvelopeEncryptionService } from '@package/encryption';

// Initialize provider
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project-id',
  secretPrefix: 'encryption-keys/',
  credentialsFile: process.env.GCP_CREDENTIALS_FILE
});

// Use with envelope encryption
const encryption = new EnvelopeEncryptionService(provider);

// Encrypt data
const result = await encryption.encryptToBase64('sensitive-data', {
  keyId: 'default'
});

console.log('Encrypted:', result.ciphertext);

// Decrypt data
const decrypted = await encryption.decryptFromBase64(
  result.ciphertext,
  result.encryptedDataKey,
  result.iv,
  result.authTag,
  { keyId: 'default' }
);

console.log('Decryption successful, length:', decrypted.length);
```

### Key Rotation

```typescript
// GCP Secret Manager supports automatic rotation via console or gcloud
// Or rotate programmatically:

await provider.rotateKey('default');

// This creates a new version of the secret
// Old versions remain accessible
```

### Health Checks

```typescript
// Check if provider is available
const available = await provider.isAvailable();
console.log('Provider available:', available);

// Detailed health check
const healthy = await provider.healthCheck();
console.log('Provider healthy:', healthy);

// Get key information
const keyInfo = await provider.getKeyInfo('default');
console.log('Key info:', keyInfo);
// Output:
// {
//   keyId: 'default',
//   version: 'latest',
//   enabled: true,
//   purpose: 'ENCRYPT_DECRYPT',
//   metadata: {
//     provider: 'gcp-secret-manager',
//     backing: 'secret-manager',
//     versioning: true
//   }
// }
```

### Best Practices

1. **Use least-privilege IAM** - Only grant necessary permissions
2. **Enable secret versioning** - Automatic, keeps old versions
3. **Set up automatic rotation** - Use GCP's built-in rotation
4. **Monitor access logs** - Use Cloud Audit Logs
5. **Use separate keys per environment** - dev/staging/prod
6. **Enable secret replication** - For high availability
7. **Set secret expiration** - For temporary data

### Troubleshooting

#### Issue: Permission Denied

```
Error: 7 PERMISSION_DENIED: Permission 'secretmanager.secrets.get' denied
```

**Solution:** Grant `roles/secretmanager.secretAccessor` role to the service account.

#### Issue: Secret Not Found

```
Error: 5 NOT_FOUND: Secret not found
```

**Solution:** Create the secret first:

```bash
echo -n "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" | \
  gcloud secrets create encryption-keys-default --data-file=-
```

#### Issue: Invalid Credentials

```
Error: Could not load the default credentials
```

**Solution:** Set up Application Default Credentials:

```bash
# For development
gcloud auth application-default login

# For production, use service account key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

## Environment Variable Provider

### Overview

The EnvVar provider is the simplest provider, storing encryption keys in environment variables. **This is for development and testing only - not for production use.**

### Use Cases

- Local development
- Testing without cloud dependencies
- CI/CD pipelines
- Small deployments where operational simplicity is prioritized

### Security Warning

**NOT RECOMMENDED FOR PRODUCTION** because:

- Keys are accessible to all processes in the same container
- Keys are stored in plaintext in environment configuration
- No key rotation support
- No audit logging
- No access control

### Configuration

#### Environment Variables

```bash
# Single default key
ENCRYPTION_KEY=<64-character hex string>

# Multiple keys
ENCRYPTION_KEY_DEFAULT=<key1>
ENCRYPTION_KEY_SECONDARY=<key2>
ENCRYPTION_KEY_EMAIL=<key3>
```

#### Programmatic Configuration

```typescript
import { EnvVarProvider } from '@package/encryption';

// Option 1: Single key
const provider1 = new EnvVarProvider({
  encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
});

// Option 2: Multiple keys
const provider2 = new EnvVarProvider({
  keys: {
    default: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    email: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
  }
});

// Option 3: Custom env prefix
const provider3 = new EnvVarProvider({
  envPrefix: 'MY_APP_ENCRYPTION_KEY'
});

// Option 4: Explicitly allow production (not recommended)
const provider4 = new EnvVarProvider({
  encryptionKey: process.env.ENCRYPTION_KEY,
  allowProduction: true // Suppresses warning
});
```

### Generating Keys

```bash
# Generate a 32-byte (256-bit) key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use openssl
openssl rand -hex 32
```

### Usage Example

```typescript
import { EnvVarProvider } from '@package/encryption';
import { EnvelopeEncryptionService } from '@package/encryption';

// Initialize provider
const provider = new EnvVarProvider({
  encryptionKey: process.env.ENCRYPTION_KEY
});

// Use with envelope encryption
const encryption = new EnvelopeEncryptionService(provider);

// Encrypt data
const result = await encryption.encryptToBase64('sensitive-data');
console.log('Encrypted:', result.ciphertext);

// Decrypt data
const decrypted = await encryption.decryptFromBase64(
  result.ciphertext,
  result.encryptedDataKey,
  result.iv,
  result.authTag
);
console.log('Decryption successful, length:', decrypted.length);
```

### Key Rotation

```typescript
// Manual key rotation process

// 1. Add new key to environment
process.env.ENCRYPTION_KEY_V2 = '<new key>';

// 2. Update provider
provider.setKey('v2', process.env.ENCRYPTION_KEY_V2);

// 3. Migrate data (see Migration Guide)

// 4. Remove old key from environment
delete process.env.ENCRYPTION_KEY_V1;
```

### Testing Example

```typescript
import { EnvVarProvider } from '@package/encryption';

describe('MyEncryptedService', () => {
  let provider: EnvVarProvider;

  beforeEach(() => {
    // Generate test key
    const testKey = crypto.randomBytes(32).toString('hex');

    // Create provider with test key
    provider = new EnvVarProvider({
      encryptionKey: testKey,
      allowProduction: true // OK for tests
    });
  });

  it('should encrypt and decrypt data', async () => {
    const encryption = new EnvelopeEncryptionService(provider);

    const result = await encryption.encryptToBase64('test data');
    const decrypted = await encryption.decryptFromBase64(
      result.ciphertext,
      result.encryptedDataKey,
      result.iv,
      result.authTag
    );

    assert.strictEqual(decrypted, 'test data');
  });
});
```

### Best Practices

1. **Never commit keys to git** - Use .env files and .gitignore
2. **Use different keys per environment** - dev/staging/prod
3. **Rotate keys regularly** - Manual process
4. **Use .env.example** - Document required variables without values
5. **Generate keys securely** - Use crypto.randomBytes or openssl
6. **Never use in production** - Use cloud KMS providers instead

## GCP KMS

### Overview

The GCP KMS provider uses Google Cloud Key Management Service for encryption operations.

### Configuration

```typescript
import { gcpKmsConfig } from '@package/encryption';

const config = gcpKmsConfig({
  projectId: 'my-project-id',
  locationId: 'global',
  keyRingId: 'my-keyring',
  keyId: 'my-key',
  default: true,
  credentialsFile: '/path/to/credentials.json'
});
```

### Setting Up

```bash
# Create key ring
gcloud kms keyrings create my-keyring \
  --location=global \
  --project=my-project-id

# Create key
gcloud kms keys create my-key \
  --location=global \
  --keyring=my-keyring \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time=$(date -d '+90 days' +%Y-%m-%d) \
  --project=my-project-id
```

## AWS KMS

### Overview

The AWS KMS provider uses AWS Key Management Service for encryption operations.

### Configuration

```typescript
import { awsKmsConfig } from '@package/encryption';

const config = awsKmsConfig({
  region: 'us-east-1',
  keyId: 'alias/my-key',
  default: true,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
```

### Setting Up

```bash
# Create KMS key
aws kms create-key \
  --description "My encryption key" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS

# Create alias
aws kms create-alias \
  --alias-name alias/my-key \
  --target-key-id <key-id>
```

## Azure Key Vault

### Overview

The Azure Key Vault provider uses Azure Key Vault for encryption operations.

### Configuration

```typescript
import { azureKeyVaultConfig } from '@package/encryption';

const config = azureKeyVaultConfig({
  vaultUrl: 'https://my-vault.vault.azure.net',
  keyName: 'my-key',
  credentialType: 'default'
});
```

### Setting Up

```bash
# Create key vault
az keyvault create \
  --name my-vault \
  --resource-group my-resource-group \
  --location eastus

# Create key
az keyvault key create \
  --vault-name my-vault \
  --name my-key \
  --kty RSA \
  --size 2048
```

## HashiCorp Vault

### Overview

The Vault Transit provider uses HashiCorp Vault's Transit secrets engine for encryption operations.

### Configuration

```typescript
import { vaultTransitConfig } from '@package/encryption';

const config = vaultTransitConfig({
  address: 'https://vault.example.com',
  token: process.env.VAULT_TOKEN,
  enginePath: 'transit',
  keyName: 'my-key'
});
```

### Setting Up

```bash
# Enable transit engine
vault secrets enable transit

# Create encryption key
vault write -f transit/keys/my-key
```

## Provider Comparison

| Provider           | Best For                      | Pros                             | Cons               |
| ------------------ | ----------------------------- | -------------------------------- | ------------------ |
| GCP Secret Manager | GCP deployments, key rotation | Built-in rotation, audit logging | GCP-specific       |
| EnvVar             | Development, testing          | Simple, no dependencies          | Not for production |
| GCP KMS            | GCP deployments               | Highly scalable, managed         | GCP-specific       |
| AWS KMS            | AWS deployments               | Highly scalable, managed         | AWS-specific       |
| Azure Key Vault    | Azure deployments             | Highly scalable, managed         | Azure-specific     |
| Vault Transit      | Multi-cloud, on-premise       | Cloud-agnostic, flexible         | Self-managed       |

## Choosing a Provider

**Use GCP Secret Manager if:**

- You're deploying to Google Cloud
- You need automatic key rotation
- You want built-in audit logging

**Use EnvVar if:**

- You're in development/testing
- You need to test without cloud dependencies
- You're building a proof of concept

**Use GCP/AWS/Azure KMS if:**

- You need maximum security
- You want full managed service
- You're already using that cloud provider

**Use Vault if:**

- You're multi-cloud
- You have on-premise requirements
- You need self-hosted solution

## Additional Resources

- [GCP Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [GCP KMS Documentation](https://cloud.google.com/kms/docs)
- [AWS KMS Documentation](https://docs.aws.amazon.com/kms/)
- [Azure Key Vault Documentation](https://learn.microsoft.com/azure/key-vault/)
- [Vault Transit Documentation](https://www.vaultproject.io/docs/secrets/transit)
