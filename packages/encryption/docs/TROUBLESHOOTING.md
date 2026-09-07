# Troubleshooting Guide

Common issues and solutions for the encryption infrastructure.

## Table of Contents

- [Common Issues](#common-issues)
- [Provider-Specific Issues](#provider-specific-issues)
- [Migration Issues](#migration-issues)
- [Performance Issues](#performance-issues)
- [Debugging Tips](#debugging-tips)

## Common Issues

### Issue: "Provider not found" Error

**Error Message:**

```
KeyRotationError: KMS provider 'default' not found
```

**Cause:** The provider is not registered or the name doesn't match.

**Solution:**

```typescript
// Check provider registration
const providers = new Map([
  ['gcp', gcpProvider],
  ['aws', awsProvider]
]);

const service = new KeyRotationService(
  (name) => providers.get(name),
  'gcp' // Make sure this matches a registered provider
);

// Or register provider explicitly
EncryptionModule.forRoot({
  providers: [
    gcpKmsConfig({
      projectId: 'my-project',
      // ... other config
      default: true // This sets it as the default provider
    })
  ]
});
```

### Issue: "Key not found" Error

**Error Message:**

```
KeyNotFoundError: Key 'my-key' not found
```

**Cause:** The specified key doesn't exist in the KMS provider.

**Solution:**

```typescript
// First, verify the key exists
const keyInfo = await provider.getKeyInfo('my-key');
console.log('Key info:', keyInfo);

// If key doesn't exist, create it

// For GCP Secret Manager:
const secretClient = new SecretManagerServiceClient();
await secretClient.createSecret({
  parent: `projects/${projectId}`,
  secretId: 'my-key',
  secret: {
    replication: { automatic: {} }
  }
});

// For EnvVar, set the environment variable
process.env.ENCRYPTION_KEY_MY_KEY = crypto.randomBytes(32).toString('hex');
```

### Issue: Decryption Fails After Migration

**Error Message:**

```
DecryptionOperationError: Failed to decrypt data
```

**Cause:** Migration didn't complete successfully or old key was disabled too early.

**Solution:**

```typescript
// 1. Check migration status
const progress = migrationService.getMigrationProgress(migrationId);
console.log('Migration state:', progress.state);

// 2. Verify old key is still accessible
const oldKeyInfo = await provider.getKeyInfo('old-key');
console.log('Old key enabled:', oldKeyInfo.enabled);

// 3. Rollback if needed
await rollbackMigration(repository, 'new-key', 'old-key');

// 4. Re-run migration
await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 50, // Smaller batches
  continueOnError: true
});
```

### Issue: Invalid Key Length

**Error Message:**

```
InvalidKmsConfigError: Encryption key must be 32 bytes (64 hex characters)
```

**Cause:** The encryption key is not the correct length for AES-256-GCM.

**Solution:**

```bash
# Generate a valid 32-byte key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output will be 64 hex characters (32 bytes)
# Example: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Issue: Authentication Failed

**Error Message:**

```
Error: Could not load the default credentials
```

**Cause:** Missing or invalid credentials for cloud provider.

**Solution:**

```typescript
// For GCP:
const provider = new GcpSecretManagerProvider({
  projectId: 'my-project',
  credentialsFile: '/path/to/service-account-key.json'
});

// Or set environment variable
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';

// For AWS:
const provider = new AwsKmsProvider({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// For Azure:
const provider = new AzureKeyVaultProvider({
  vaultUrl: 'https://my-vault.vault.azure.net',
  credentialType: 'clientSecret',
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET
});
```

## Provider-Specific Issues

### GCP Secret Manager

#### Issue: Permission Denied

**Error:**

```
Error: 7 PERMISSION_DENIED: Permission 'secretmanager.secrets.get' denied
```

**Solution:**

```bash
# Grant required IAM role
gcloud secrets add-iam-policy-binding encryption-keys-default \
  --member=serviceAccount:my-service@my-project.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor \
  --project=my-project

# Or grant broader access (not recommended for production)
gcloud secrets add-iam-policy-binding encryption-keys-default \
  --member=allAuthenticatedUsers \
  --role=roles/secretmanager.secretAccessor \
  --project=my-project
```

#### Issue: Secret Not Found

**Error:**

```
Error: 5 NOT_FOUND: Secret not found: projects/my-project/secrets/my-key
```

**Solution:**

```bash
# Create the secret
KEY_HEX=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo -n "$KEY_HEX" | gcloud secrets create my-key --data-file=-

# Or use the provider's built-in method
if (provider instanceof GcpSecretManagerProvider) {
  const key = crypto.randomBytes(32);
  await provider['storeEncryptionKey']('my-key', key);
}
```

#### Issue: Quota Exceeded

**Error:**

```
Error: 8 RESOURCE_EXHAUSTED: Quota exceeded for API requests
```

**Solution:**

```typescript
// Add delays between requests
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 50, // Smaller batches
  batchDelay: 200 // 200ms delay between batches
});

// Or request quota increase in GCP Console
// IAM & Admin > Quotas > Secret Manager API
```

### EnvVar Provider

#### Issue: Key Not Set

**Error:**

```
InvalidKmsConfigError: EnvVarProvider requires encryptionKey option or ENCRYPTION_KEY environment variable
```

**Solution:**

```bash
# Set environment variable
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Or create .env file
echo "ENCRYPTION_KEY=0123456789abcdef..." > .env

# Or use in code
const provider = new EnvVarProvider({
  encryptionKey: crypto.randomBytes(32).toString('hex'),
});
```

#### Issue: Invalid Hex String

**Error:**

```
InvalidKmsConfigError: Invalid hex string
```

**Solution:**

```typescript
// Ensure key is valid hex
function validateKey(key: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(key);
}

// Generate valid key
const key = crypto.randomBytes(32).toString('hex');
console.log('Valid key:', validateKey(key));
```

### AWS KMS

#### Issue: Access Denied

**Error:**

```
AccessDeniedException: User is not authorized to perform: kms:Encrypt
```

**Solution:**

```bash
# Add IAM policy to KMS key
aws kms put-key-policy \
  --key-id <key-id> \
  --policy-name default \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::123456789012:user/my-user"},
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "*"
    }]
  }'
```

### Azure Key Vault

#### Issue: Unauthorized

**Error:**

```
Error: Unauthorized (401)
```

**Solution:**

```bash
# Grant access to Azure AD app
az keyvault set-policy \
  --name my-vault \
  --object-id <app-object-id> \
  --key-permissions encrypt decrypt get list
```

## Migration Issues

### Issue: Migration Hangs

**Symptom:** Migration doesn't complete, stays at "IN_PROGRESS" state.

**Solution:**

```typescript
// 1. Check if migration is actually making progress
const progress = migrationService.getMigrationProgress(migrationId);
console.log('Progress:', progress);

// 2. If no progress, pause and investigate
migrationService.pauseMigration(migrationId);

// 3. Check database locks
// 4. Check for long-running queries
// 5. Resume migration
migrationService.resumeMigration(migrationId);
```

### Issue: Out of Memory During Migration

**Error:**

```
JavaScript heap out of memory
```

**Solution:**

```typescript
// Use smaller batches
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 10, // Very small batches
  batchDelay: 100 // Add delay for GC
});

// Or increase Node.js memory limit
// node --max-old-space-size=4096 dist/index.js
```

### Issue: Inconsistent Data After Migration

**Symptom:** Some entities migrated, some not.

**Solution:**

```typescript
// Re-run migration - it will skip already-migrated entities
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  continueOnError: true
});

console.log('Migrated:', result.succeeded);
console.log('Failed:', result.failed);

// Check for entities with old key version
const entities = await repository.findAll();
const oldVersionEntities = entities.filter((e) => e.sensitiveData?.version === 'old-key');

console.log('Entities with old key:', oldVersionEntities.length);
```

## Performance Issues

### Issue: Slow Migration Speed

**Symptom:** Migration takes too long.

**Solution:**

```typescript
// 1. Increase batch size
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 500, // Larger batches
  batchDelay: 0 // Remove delays
});

// 2. Add concurrency (for large datasets)
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  concurrency: 4 // Process 4 entities in parallel
});

// 3. Use parallel migrations for independent tables
await Promise.all([migrateEntityTable(), migrateOrderTable(), migratePaymentTable()]);
```

### Issue: High CPU Usage

**Symptom:** Migration causes high CPU load.

**Solution:**

```typescript
// Reduce batch size and add delays
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 50, // Smaller batches
  batchDelay: 200 // 200ms delay
});

// Add adaptive rate limiting
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  onProgress: async (progress) => {
    const load = await getCpuLoad();
    if (load > 0.8) {
      // Pause migration
      migrationService.pauseMigration(progress.migrationId);
      // Resume later
      setTimeout(() => {
        migrationService.resumeMigration(progress.migrationId);
      }, 5000);
    }
  }
});
```

### Issue: Database Connection Pool Exhausted

**Error:**

```
Error: Connection pool exhausted
```

**Solution:**

```typescript
// Increase connection pool size
const pool = new Pool({
  max: 20, // Increase from default
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Or use smaller batches
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 20 // Smaller batches to reduce connections
});
```

## Debugging Tips

### Enable Debug Logging

```typescript
import { EncryptionService } from '@package/encryption';

// Enable debug logs
process.env.DEBUG = 'encryption:*';

const service = new EncryptionService({
  providers: [...],
});
```

### Trace Encryption Operations

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('encryption');

await tracer.startActiveSpan('encrypt-data', async (span) => {
  try {
    const result = await encryption.encrypt(data);
    span.setAttribute('data.length', data.length);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
});
```

### Monitor Provider Health

```typescript
// Create health check endpoint
app.get('/health/encryption', async (req, res) => {
  const results = [];

  for (const [name, provider] of providers) {
    const isAvailable = await provider.isAvailable();
    const isHealthy = await provider.healthCheck();

    results.push({
      provider: name,
      available: isAvailable,
      healthy: isHealthy
    });
  }

  res.json({
    status: results.every((r) => r.healthy) ? 'healthy' : 'degraded',
    providers: results
  });
});
```

### Test Provider Connectivity

```typescript
async function testProvider(provider: IKmsProvider): Promise<boolean> {
  try {
    // Test health
    const healthy = await provider.healthCheck();
    if (!healthy) {
      console.error('Provider health check failed');
      return false;
    }

    // Test encryption/decryption
    const testData = Buffer.from('test-data');
    const encrypted = await provider.encrypt(testData);
    const decrypted = await provider.decrypt(encrypted);

    if (!testData.equals(decrypted)) {
      console.error('Encrypt/decrypt test failed');
      return false;
    }

    console.log('Provider test passed');
    return true;
  } catch (error) {
    console.error('Provider test failed:', error);
    return false;
  }
}
```

### Verify Key Access

```typescript
async function verifyKeyAccess(provider: IKmsProvider, keyId: string): Promise<boolean> {
  try {
    const keyInfo = await provider.getKeyInfo(keyId);
    console.log('Key info:', keyInfo);

    if (!keyInfo.enabled) {
      console.error('Key is disabled');
      return false;
    }

    // Test encrypt/decrypt with key
    const testData = Buffer.from('test');
    const encrypted = await provider.encrypt(testData, keyId);
    const decrypted = await provider.decrypt(encrypted, keyId);

    return testData.equals(decrypted);
  } catch (error) {
    console.error('Key access verification failed:', error);
    return false;
  }
}
```

## Getting Help

If you're still experiencing issues:

1. **Check the logs** - Enable debug logging and review output
2. **Verify configuration** - Double-check all settings
3. **Test connectivity** - Verify network access to KMS providers
4. **Check permissions** - Ensure proper IAM/ACL permissions
5. **Review examples** - Look at working examples in the docs
6. **Create minimal reproduction** - Isolate the issue in a small test case
7. **Check GitHub Issues** - Search for similar problems
8. **Create an issue** - Include error messages, configuration, and steps to reproduce

## Additional Resources

- [Key Rotation Guide](./KEY_ROTATION_GUIDE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [Provider Documentation](./PROVIDERS.md)
- [Performance Guide](./PERFORMANCE.md)
