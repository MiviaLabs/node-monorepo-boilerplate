# Migration Guide

Complete guide for migrating encrypted data during key rotation operations.

## Table of Contents

- [Overview](#overview)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Strategies](#migration-strategies)
- [Step-by-Step Migration](#step-by-step-migration)
- [Post-Migration Verification](#post-migration-verification)
- [Rollback Procedures](#rollback-procedures)
- [Advanced Scenarios](#advanced-scenarios)

## Overview

Data migration is the process of re-encrypting existing encrypted data with a new encryption key. This guide covers:

- Planning and preparation
- Migration execution
- Verification and rollback
- Special scenarios

## Pre-Migration Checklist

### 1. Assess Your Data

```typescript
import { DataMigrationService } from '@package/encryption';

const migrationService = new DataMigrationService(providerGetter, 'default');

// Get counts for planning
const totalCount = await repository.count();
console.log(`Total entities to migrate: ${totalCount}`);

// Preview migration
const preview = await migrationService.previewMigration(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key'
});

console.log(`Estimated batches: ${Math.ceil(totalCount / 100)}`);
```

### 2. Backup Your Data

```bash
# PostgreSQL backup
pg_dump -U username -h hostname dbname > backup.sql

# Or use database-specific backup tools
```

### 3. Verify Key Availability

```typescript
import { KeyRotationService } from '@package/encryption';

const rotationService = new KeyRotationService(providerGetter, 'default');

// Validate both keys are accessible
await rotationService.validateRotation({
  currentKeyId: 'old-key',
  newKeyId: 'new-key'
});

console.log('Both keys are accessible');
```

### 4. Test in Staging

Always test migration in a non-production environment first:

```typescript
// 1. Copy production data to staging
// 2. Run migration in staging
// 3. Verify data integrity
// 4. Test application functionality
// 5. Only then proceed to production
```

### 5. Plan Maintenance Window

- **Schedule during low traffic**
- **Notify users of potential downtime**
- **Prepare rollback plan**
- **Have monitoring ready**

## Migration Strategies

### Strategy 1: Online Migration (Recommended)

Migrate data while application continues running:

```typescript
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 100,
  batchDelay: 50, // Small delay to reduce load
  continueOnError: true // Don't stop on single entity failure
});

// Application continues serving requests during migration
// Old and new keys work during migration period
```

**Pros:**

- No downtime required
- Gradual migration

**Cons:**

- Longer migration window
- Both keys must remain active

### Strategy 2: Offline Migration (Simple)

Migrate data during maintenance window:

```typescript
// 1. Put application in maintenance mode
await enableMaintenanceMode();

// 2. Run migration
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 500, // Larger batches for speed
  batchDelay: 0 // No delays
});

// 3. Verify migration
if (result.failed === 0) {
  // 4. Disable old key
  await disableOldKey('old-key');

  // 5. Take application out of maintenance mode
  await disableMaintenanceMode();
}
```

**Pros:**

- Faster migration
- Simpler process
- Immediate key switch

**Cons:**

- Application downtime
- User impact

### Strategy 3: Lazy Migration (Advanced)

Migrate data on access:

```typescript
class LazyMigrationService {
  async getEntity(id: string) {
    const entity = await repository.findOne({ id });

    // Check if entity needs migration
    const encryptedField = entity.sensitiveData;
    if (encryptedField.version === 'old-key') {
      // Migrate on read
      const migrated = await entityTransformer.reencryptEntity(entity, {
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Save migrated version
      await repository.save(migrated);

      return migrated;
    }

    return entity;
  }
}
```

**Pros:**

- No upfront migration time
- Only migrates accessed data

**Cons:**

- Complex implementation
- Data inconsistency during migration period

## Step-by-Step Migration

### Step 1: Create Repository Adapter

Implement the `IEntityRepository` interface for your data source:

```typescript
import { IEntityRepository } from '@package/encryption';

class DrizzleUserRepository implements IEntityRepository<User> {
  entityName = 'User';

  constructor(private readonly db: Database) {}

  async findAll(options?: { limit?: number; offset?: number }): Promise<User[]> {
    return this.db
      .select()
      .from(users)
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  }

  async save(entity: User): Promise<User> {
    await this.db.update(users).set(entity).where(eq(users.id, entity.id));

    return entity;
  }

  async saveBatch(entities: User[]): Promise<User[]> {
    for (const entity of entities) {
      await this.save(entity);
    }
    return entities;
  }

  async count(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(users);

    return result[0].count;
  }
}
```

### Step 2: Initialize Migration Service

```typescript
import { DataMigrationService } from '@package/encryption';

const migrationService = new DataMigrationService((name) => {
  if (name === 'gcp') return gcpProvider;
  if (name === 'aws') return awsProvider;
  return defaultProvider;
}, 'default');
```

### Step 3: Run Migration with Monitoring

```typescript
interface MigrationMetrics {
  startTime: Date;
  endTime?: Date;
  entitiesProcessed: number;
  entitiesPerSecond: number;
  errors: Error[];
}

async function runMonitoredMigration(
  repository: IEntityRepository<unknown>,
  options: IDataMigrationOptions
): Promise<MigrationMetrics> {
  const metrics: MigrationMetrics = {
    startTime: new Date(),
    entitiesProcessed: 0,
    entitiesPerSecond: 0,
    errors: []
  };

  let lastProgressUpdate = Date.now();

  // options MUST include organizationId for tenant isolation
  const result = await migrationService.migrateEntities(repository, {
    ...options, // includes organizationId, oldKeyId, newKeyId, etc.
    onProgress: async (progress) => {
      const now = Date.now();
      const elapsed = (now - lastProgressUpdate) / 1000;

      if (elapsed >= 5) {
        // Log every 5 seconds
        const percent = ((progress.processed / progress.total) * 100).toFixed(2);
        console.log(`Progress: ${percent}% (${progress.processed}/${progress.total})`);

        if (progress.estimatedTimeRemaining) {
          const eta = new Date(progress.estimatedTimeRemaining * 1000).toISOString().substr(11, 8);
          console.log(`ETA: ${eta}`);
        }

        lastProgressUpdate = now;
      }
    }
  });

  metrics.endTime = new Date();
  metrics.entitiesProcessed = result.total;
  metrics.entitiesPerSecond =
    result.total / ((metrics.endTime.getTime() - metrics.startTime.getTime()) / 1000);

  return metrics;
}
```

### Step 4: Execute Migration

```typescript
async function executeMigration() {
  const repository = new DrizzleUserRepository(db);

  console.log('Starting migration...');

  // IMPORTANT: organizationId is REQUIRED for multi-tenant isolation.
  // All repository operations will be scoped to this tenant.
  const metrics = await runMonitoredMigration(repository, {
    organizationId: 'org-123', // REQUIRED: Tenant ID for isolation
    oldKeyId: 'customer-data-key-2023',
    newKeyId: 'customer-data-key-2024',
    batchSize: 100,
    batchDelay: 100,
    continueOnError: false
  });

  console.log('Migration completed!');
  console.log(`Duration: ${metrics.endTime.getTime() - metrics.startTime.getTime()}ms`);
  console.log(`Throughput: ${metrics.entitiesPerSecond.toFixed(2)} entities/sec`);
}
```

## Post-Migration Verification

### 1. Verify Data Integrity

```typescript
async function verifyMigration(repository: IEntityRepository<unknown>): Promise<boolean> {
  const entities = await repository.findAll({ limit: 1000 });
  const transformer = new EntityTransformer({
    getProvider: providerGetter,
    defaultProvider: 'default'
  });

  for (const entity of entities) {
    try {
      // Try to decrypt with new key
      const decrypted = await transformer.decryptEntity(entity);

      // Verify expected fields exist
      if (!decrypted.sensitiveData) {
        console.error(`Decryption failed for entity ${entity.id}`);
        return false;
      }
    } catch (error) {
      console.error(`Verification failed for entity ${entity.id}:`, error);
      return false;
    }
  }

  console.log('Verification passed: All entities can be decrypted');
  return true;
}
```

### 2. Compare Record Counts

```typescript
const beforeCount = await repository.count();

// Run migration

const afterCount = await repository.count();

if (beforeCount !== afterCount) {
  throw new Error(`Record count mismatch: before=${beforeCount}, after=${afterCount}`);
}
```

### 3. Test Application Functionality

```typescript
// Test critical application paths
async function testApplication() {
  // Test user login
  const loginResult = await authService.login('test@example.com', 'password');
  assert.ok(loginResult.success);

  // Test data access
  const userData = await userService.getProfile('test-user-id');
  assert.ok(userData.email);

  // Test data modification
  await userService.updateEmail('test-user-id', 'newemail@example.com');

  console.log('Application tests passed');
}
```

## Rollback Procedures

### Rollback to Old Key

If migration fails and you need to rollback:

```typescript
async function rollbackMigration(
  repository: IEntityRepository<unknown>,
  newKeyId: string,
  oldKeyId: string
) {
  console.log('Rolling back migration...');

  const result = await migrationService.migrateEntities(repository, {
    oldKeyId: newKeyId, // Swap: new becomes old
    newKeyId: oldKeyId, // Swap: old becomes new
    batchSize: 100,
    continueOnError: true
  });

  console.log(`Rollback completed: ${result.succeeded}/${result.total} entities`);

  // Update configuration to use old key
  process.env.GCP_KEY_ID = oldKeyId;

  return result;
}
```

### Partial Rollback

If only some entities failed:

```typescript
async function rollbackFailedEntities(
  repository: IEntityRepository<unknown>,
  failedIds: string[],
  oldKeyId: string
) {
  for (const id of failedIds) {
    try {
      const entity = await repository.findOne({ id });

      // Manually re-encrypt with old key
      const rolledBack = await entityTransformer.reencryptEntity(entity, {
        oldKeyId: 'new-key',
        newKeyId: oldKeyId
      });

      await repository.save(rolledBack);
      console.log(`Rolled back entity ${id}`);
    } catch (error) {
      console.error(`Failed to rollback entity ${id}:`, error);
    }
  }
}
```

## Advanced Scenarios

### Scenario 1: Multi-Entity Migration

```typescript
async function migrateMultipleEntities() {
  const repositories = [new UserRepository(db), new OrderRepository(db), new PaymentRepository(db)];

  for (const repository of repositories) {
    console.log(`Migrating ${repository.entityName}...`);

    const result = await migrationService.migrateEntities(repository, {
      oldKeyId: 'old-key',
      newKeyId: 'new-key',
      batchSize: 100
    });

    console.log(`${repository.entityName}: ${result.succeeded}/${result.total} succeeded`);
  }
}
```

### Scenario 2: Cross-Database Migration

```typescript
async function migrateAcrossDatabases() {
  const oldDb = getDatabase('old-db');
  const newDb = getDatabase('new-db');

  const oldRepository = new UserRepository(oldDb);
  const newRepository = new UserRepository(newDb);

  // Migrate in old database
  await migrationService.migrateEntities(oldRepository, {
    oldKeyId: 'old-key',
    newKeyId: 'new-key'
  });

  // Copy to new database
  const entities = await oldRepository.findAll();
  for (const entity of entities) {
    await newRepository.save(entity);
  }
}
```

### Scenario 3: Incremental Migration

```typescript
async function incrementalMigration(
  repository: IEntityRepository<unknown>,
  batchSize: number = 1000
) {
  let offset = 0;
  let totalMigrated = 0;

  while (true) {
    const batch = await repository.findAll({
      limit: batchSize,
      offset
    });

    if (batch.length === 0) break;

    // Filter for entities that need migration
    const needsMigration = batch.filter((entity) => entity.sensitiveData?.version === 'old-key');

    if (needsMigration.length > 0) {
      const result = await migrationService.migrateEntities(
        {
          ...repository,
          findAll: async () => needsMigration
        },
        {
          oldKeyId: 'old-key',
          newKeyId: 'new-key'
        }
      );

      totalMigrated += result.succeeded;
      console.log(`Migrated ${result.succeeded} entities (offset: ${offset})`);
    }

    offset += batchSize;

    // Pause between batches
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`Total migrated: ${totalMigrated}`);
}
```

### Scenario 4: Migration with Parallel Processing

```typescript
import { Piscina } from 'piscina';

async function parallelMigration(repository: IEntityRepository<unknown>, concurrency: number = 4) {
  const workerPool = new Piscina({
    filename: './migration-worker.js'
  });

  const entities = await repository.findAll();
  const chunks = chunk(entities, Math.ceil(entities.length / concurrency));

  const results = await Promise.all(
    chunks.map((chunk) =>
      workerPool.run({
        entities: chunk,
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      })
    )
  );

  const totalMigrated = results.reduce((sum, r) => sum + r.count, 0);
  console.log(`Migrated ${totalMigrated} entities in parallel`);

  await workerPool.destroy();
}
```

## Best Practices Summary

1. **Always test in staging before production**
2. **Create backups before migration**
3. **Monitor migration progress actively**
4. **Verify data integrity after migration**
5. **Have rollback plan ready**
6. **Use appropriate batch sizes for your dataset**
7. **Consider online vs offline migration based on requirements**
8. **Document migration process for future reference**
9. **Monitor application performance during migration**
10. **Keep old key available until verification is complete**

## Additional Resources

- [Key Rotation Guide](./KEY_ROTATION_GUIDE.md) - Key rotation workflows
- [Provider Documentation](./PROVIDERS.md) - Provider-specific guides
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
