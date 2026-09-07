# Key Rotation Guide

Complete guide for rotating encryption keys in the Node Monorepo Boilerplate encryption infrastructure.

## Table of Contents

- [Overview](#overview)
- [Why Rotate Keys](#why-rotate-keys)
- [Key Rotation Concepts](#key-rotation-concepts)
- [Rotation Workflow](#rotation-workflow)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Overview

Key rotation is the process of replacing an existing encryption key with a new one. This package provides comprehensive key rotation support through:

- **KeyRotationService** - Manages key rotation operations
- **DataMigrationService** - Orchestrates bulk data re-encryption
- **Provider Support** - Works with all KMS providers

## Why Rotate Keys

Regular key rotation is a security best practice that:

1. **Limits Exposure** - Reduces the amount of data encrypted with a single key
2. **Compliance** - Meets regulatory requirements (PCI DSS, HIPAA, SOC 2)
3. **Mitigates Compromise** - Limits damage if a key is compromised
4. **Fresh Cryptography** - Ensures keys use current cryptographic standards

**Recommended Rotation Schedule:**

- **High-Security Data**: Every 30-90 days
- **Standard Data**: Every 90-180 days
- **Compliance Requirements**: Follow specific guidelines (e.g., PCI DSS requires annual rotation)

## Key Rotation Concepts

### Envelope Encryption

This package uses envelope encryption, where:

1. **Data Keys** - Encrypt actual data (generated randomly)
2. **Master Keys** - Encrypt data keys (stored in KMS)
3. **Rotation Process** - Re-encrypt data keys with new master keys

### Rotation Strategy

```
┌─────────────────┐      ┌─────────────────┐
│ Old Master Key  │      │ New Master Key  │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │ encrypts               │ encrypts
         │                        │
    ┌────▼────┐              ┌────▼────┐
    │ Data    │─────────────▶│ Data    │
    │ Key v1  │   re-encrypt │ Key v1  │
    └────┬────┘              └─────────┘
         │
         │ encrypts
         │
    ┌────▼────┐
    │ Actual  │
    │ Data    │
    └─────────┘
```

## Rotation Workflow

### Step 1: Create New Key

Create a new key in your KMS provider:

```typescript
// GCP KMS
const newKeyId = 'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/my-key-v2';

// AWS KMS
const newKeyId = 'alias/my-key-v2';

// Azure Key Vault
const newKeyId = 'my-key-v2';
```

### Step 2: Validate Rotation

Ensure both old and new keys are accessible:

```typescript
import { KeyRotationService } from '@package/encryption';

const rotationService = new KeyRotationService((name) => getProvider(name), 'default-provider');

// Validate before starting
await rotationService.validateRotation({
  currentKeyId: 'my-key-v1',
  newKeyId: 'my-key-v2'
});
```

### Step 3: Migrate Data

Migrate encrypted data to use the new key:

```typescript
import { DataMigrationService } from '@package/encryption';

const migrationService = new DataMigrationService((name) => getProvider(name), 'default-provider');

// Perform migration
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'my-key-v1',
  newKeyId: 'my-key-v2',
  batchSize: 100,
  continueOnError: false,
  onProgress: (progress) => {
    console.log(`Progress: ${progress.processed}/${progress.total}`);
  }
});

console.log(`Migration completed: ${result.succeeded} succeeded, ${result.failed} failed`);
```

### Step 4: Verify

Verify migration success:

```typescript
// Check for any failures
if (result.failed > 0) {
  console.error('Migration had failures:', result.errors);
  // Handle failures
}

// Test decryption with new key
const sampleEntity = await repository.findOne({ id: 'test-id' });
const decrypted = await entityTransformer.decryptEntity(sampleEntity);
console.log('Decrypted successfully:', decrypted);
```

### Step 5: Update Configuration

Update your application to use the new key:

```typescript
// Update environment variables
process.env.GCP_KEY_ID = 'my-key-v2';

// Or update configuration
EncryptionModule.forRoot({
  providers: [
    gcpKmsConfig({
      projectId: 'my-project',
      locationId: 'global',
      keyRingId: 'my-ring',
      keyId: 'my-key-v2', // Updated
      default: true
    })
  ]
});
```

### Step 6: Retire Old Key (Optional)

After successful migration and verification:

1. **Disable Old Key** - Prevents new encrypt operations
2. **Schedule Deletion** - Most KMS providers have a waiting period (7-30 days)
3. **Monitor** - Watch for any decryption failures

```typescript
// Disable old key
await kmsClient.disableCryptoKey({
  name: 'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/my-key-v1'
});

// Schedule deletion (after retention period)
await kmsClient.scheduleCryptoKeyDestruction({
  name: 'projects/my-project/locations/global/keyRings/my-ring/cryptoKeys/my-key-v1'
});
```

## Best Practices

### 1. Plan Your Rotation

- **Schedule During Low Traffic** - Minimize impact
- **Create Backups** - Before migration
- **Test in Staging** - Verify process first
- **Set Rollback Plan** - Know how to revert

### 2. Use Proper Batch Sizes

```typescript
// For small datasets (< 1,000 records)
batchSize: 50;

// For medium datasets (1,000 - 100,000 records)
batchSize: 100;

// For large datasets (> 100,000 records)
batchSize: 200 - 500;
```

### 3. Implement Progress Tracking

```typescript
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  onProgress: (progress) => {
    const percent = ((progress.processed / progress.total) * 100).toFixed(2);
    console.log(`Migration: ${percent}% (${progress.processed}/${progress.total})`);

    if (progress.estimatedTimeRemaining) {
      const minutes = Math.floor(progress.estimatedTimeRemaining / 60);
      console.log(`ETA: ${minutes} minutes`);
    }
  }
});
```

### 4. Handle Errors Gracefully

```typescript
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  continueOnError: true, // Continue on single entity failures
  onProgress: (progress) => {
    // Log progress
    logger.info(`Migration progress: ${progress.processed}/${progress.total}`);
  }
});

// Handle failures after migration
if (result.failed > 0) {
  for (const error of result.errors) {
    logger.error(`Failed to migrate ${error.entityId}: ${error.error.message}`);

    // Retry failed entities
    await retryMigration(error.entityId);
  }
}
```

### 5. Use Dry-Run Mode

Always preview before actual migration:

```typescript
// Preview migration (no changes)
const preview = await migrationService.previewMigration(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key'
});

console.log(`Preview: ${preview.total} entities to migrate`);

// Only proceed if preview looks good
if (preview.total > 0) {
  const actual = await migrationService.migrateEntities(repository, {
    oldKeyId: 'old-key',
    newKeyId: 'new-key'
  });
}
```

### 6. Monitor Performance

```typescript
const startTime = Date.now();
const result = await migrationService.migrateEntities(repository, options);
const duration = Date.now() - startTime;

const throughput = result.total / (duration / 1000);
console.log(`Throughput: ${throughput.toFixed(2)} entities/second`);

// Adjust batch size based on performance
if (throughput < 10) {
  console.log('Consider increasing batch size for better performance');
}
```

## Examples

### Example 1: Simple Key Rotation

```typescript
import { KeyRotationService, DataMigrationService } from '@package/encryption';
import { UserRepository } from './repositories/user.repository';

async function rotateKeys() {
  const rotationService = new KeyRotationService((name) => providers.get(name), 'gcp');

  // Validate rotation is possible
  await rotationService.validateRotation({
    currentKeyId: 'customer-data-key-v1',
    newKeyId: 'customer-data-key-v2'
  });

  // Perform migration
  const migrationService = new DataMigrationService((name) => providers.get(name), 'gcp');

  const result = await migrationService.migrateEntities(new UserRepository(), {
    oldKeyId: 'customer-data-key-v1',
    newKeyId: 'customer-data-key-v2',
    batchSize: 100
  });

  console.log(`Migration completed: ${result.succeeded}/${result.total} succeeded`);

  return result;
}
```

### Example 2: Rotation with Progress Tracking

```typescript
import { DataMigrationService, MigrationState } from '@package/encryption';

async function rotateKeysWithProgress() {
  const migrationService = new DataMigrationService(providerGetter, 'gcp');

  let migrationId: string;

  const result = await migrationService.migrateEntities(repository, {
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 50,
    batchDelay: 100, // 100ms delay between batches
    onProgress: (progress) => {
      migrationId = progress.migrationId;

      const state = progress.state.toUpperCase();
      const percent = ((progress.processed / progress.total) * 100).toFixed(1);

      console.log(`[${state}] ${progress.processed}/${progress.total} (${percent}%)`);

      if (progress.estimatedTimeRemaining) {
        const eta = new Date(progress.estimatedTimeRemaining * 1000).toISOString().substr(11, 8);
        console.log(`ETA: ${eta}`);
      }
    }
  });

  // Check final status
  if (result.state === MigrationState.COMPLETED) {
    console.log('Migration completed successfully!');
  } else if (result.state === MigrationState.FAILED) {
    console.error('Migration failed:', result.errors);
  }
}
```

### Example 3: Pause/Resume Migration

```typescript
async function pauseableMigration() {
  const migrationService = new DataMigrationService(providerGetter, 'gcp');

  let migrationId: string;

  // Start migration in background
  const migrationPromise = migrationService.migrateEntities(repository, {
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 100,
    onProgress: async (progress) => {
      migrationId = progress.migrationId;

      // Pause if system load is high
      const load = await getSystemLoad();
      if (load > 0.8) {
        console.log('High system load, pausing migration...');
        migrationService.pauseMigration(migrationId);
      }
    }
  });

  // Resume when load decreases
  setInterval(async () => {
    const load = await getSystemLoad();
    if (load < 0.5) {
      migrationService.resumeMigration(migrationId);
    }
  }, 5000);

  await migrationPromise;
}
```

### Example 4: Cross-Provider Migration

```typescript
async function migrateAcrossProviders() {
  const migrationService = new DataMigrationService(providerGetter);

  // Migrate from GCP to AWS
  const result = await migrationService.migrateEntities(repository, {
    oldKeyId: 'gcp-key-2023',
    oldProvider: 'gcp',
    newKeyId: 'aws-key-2024',
    newProvider: 'aws',
    batchSize: 100,
    continueOnError: true
  });

  console.log(`Migrated from GCP to AWS: ${result.succeeded} entities`);
}
```

### Example 5: Automated Rotation Schedule

```typescript
import { cron } from 'cron';

// Schedule key rotation every 90 days
new cron.CronJob(
  '0 2 1 */3 *',
  async () => {
    console.log('Starting scheduled key rotation...');

    try {
      await rotateKeys();
      console.log('Scheduled rotation completed successfully');
    } catch (error) {
      console.error('Scheduled rotation failed:', error);
      // Alert operations team
    }
  },
  null,
  true,
  'America/New_York'
);
```

## Troubleshooting

### Migration Fails Partway Through

```typescript
// Migration is resumable - just run again with same options
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key'
});

// Service tracks processed entities and will skip already-migrated ones
```

### Out of Memory Errors

```typescript
// Reduce batch size and add delay
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 10, // Smaller batches
  batchDelay: 500 // 500ms delay between batches
});
```

### Slow Performance

```typescript
// Increase batch size and remove delays
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 500, // Larger batches
  batchDelay: 0 // No delay
});
```

## Additional Resources

- [Migration Guide](./MIGRATION_GUIDE.md) - Detailed migration procedures
- [Provider Documentation](./PROVIDERS.md) - Provider-specific guides
- [Examples](../examples/) - Complete working examples
- [Performance Guide](./PERFORMANCE.md) - Performance optimization
