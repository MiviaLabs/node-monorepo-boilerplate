/**
 * Data Migration Example
 *
 * Demonstrates migrating encrypted data from one key to another.
 */

/* eslint-disable no-console */

import { strict as assert } from 'node:assert';

import { createMockKmsProvider } from '../src/__mocks__/kms-mock';
import {
  DataMigrationService,
  createDataMigrationService,
  type IEntityRepository
} from '../src/services/data-migration.service';

/**
 * Test user interface
 */
interface TestUser {
  id: string;
  name: string;
  email: string;
  ssn?: string; // Encrypted field
}

/**
 * Mock repository implementation for demonstration purposes.
 *
 * Note: This is a simplified in-memory mock that intentionally does NOT
 * enforce tenant isolation. The `_organizationId` parameter is accepted
 * but ignored - all data is stored in a single Map. In production, the
 * repository would filter by organizationId to ensure tenant isolation.
 */
class MockUserRepository implements IEntityRepository<TestUser> {
  entityName = 'TestUser';
  private data: Map<string, TestUser> = new Map();

  constructor(users: TestUser[] = []) {
    for (const user of users) {
      this.data.set(user.id, user);
    }
  }

  async findAll(
    _organizationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<TestUser[]> {
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? this.data.size;
    return Array.from(this.data.values()).slice(offset, offset + limit);
  }

  async save(_organizationId: string, entity: TestUser): Promise<TestUser> {
    this.data.set(entity.id, entity);
    return entity;
  }

  async saveBatch(_organizationId: string, entities: TestUser[]): Promise<TestUser[]> {
    for (const entity of entities) {
      await this.save(_organizationId, entity);
    }
    return entities;
  }

  async count(_organizationId: string): Promise<number> {
    return this.data.size;
  }

  getData(): TestUser[] {
    return Array.from(this.data.values());
  }

  add(user: TestUser): void {
    this.data.set(user.id, user);
  }
}

/**
 * Example 1: Basic data migration
 */
async function example1_basicMigration() {
  console.log('\n=== Example 1: Basic Data Migration ===\n');

  // Setup
  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  const migrationService = new DataMigrationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  // Create test users
  const users = Array.from({ length: 10 }, (_, i) => ({
    id: `user-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));

  const repository = new MockUserRepository(users);

  console.log(`Migrating ${users.length} users...`);

  // Run migration
  const result = await migrationService.migrateEntities(repository, {
    organizationId: 'org-example',
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 5
  });

  console.log('\nMigration Results:');
  console.log(`- Total: ${result.total}`);
  console.log(`- Succeeded: ${result.succeeded}`);
  console.log(`- Failed: ${result.failed}`);
  console.log(`- Duration: ${result.duration}ms`);
  console.log(`- State: ${result.state}\n`);
}

/**
 * Example 2: Migration with progress tracking
 */
async function example2_migrationWithProgress() {
  console.log('\n=== Example 2: Migration with Progress Tracking ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  const migrationService = new DataMigrationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  const users = Array.from({ length: 25 }, (_, i) => ({
    id: `user-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));

  const repository = new MockUserRepository(users);

  console.log(`Migrating ${users.length} users with progress tracking...\n`);

  let lastProgress = 0;

  const result = await migrationService.migrateEntities(repository, {
    organizationId: 'org-example',
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 5,
    onProgress: (progress) => {
      const percent = ((progress.processed / progress.total) * 100).toFixed(1);

      // Only log every 20% progress
      if (parseFloat(percent) >= lastProgress + 20) {
        console.log(`Progress: ${percent}% (${progress.processed}/${progress.total})`);
        lastProgress = parseFloat(percent);
      }

      if (progress.estimatedTimeRemaining) {
        const eta = new Date(progress.estimatedTimeRemaining * 1000).toISOString().substr(11, 8);
        console.log(`   ETA: ${eta}`);
      }
    }
  });

  console.log(`\n✅ Migration completed: ${result.succeeded}/${result.total} succeeded\n`);
}

/**
 * Example 3: Dry-run migration
 */
async function example3_dryRunMigration() {
  console.log('\n=== Example 3: Dry-Run Migration ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  const migrationService = new DataMigrationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  const users = Array.from({ length: 10 }, (_, i) => ({
    id: `user-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));

  const repository = new MockUserRepository(users);

  console.log('Running dry-run migration (no changes will be made)...');

  const preview = await migrationService.previewMigration(repository, {
    organizationId: 'org-example',
    oldKeyId: 'old-key',
    newKeyId: 'new-key'
  });

  console.log('\nPreview Results:');
  console.log(`- Total entities: ${preview.total}`);
  console.log(`- Would succeed: ${preview.succeeded}`);
  console.log(`- Would fail: ${preview.failed}`);
  console.log(`- Dry run: ${preview.dryRun ? 'Yes' : 'No'}\n`);
}

/**
 * Example 4: Migration with continue on error
 */
async function example4_continueOnError() {
  console.log('\n=== Example 4: Continue on Error ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  const migrationService = new DataMigrationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  const users = Array.from({ length: 10 }, (_, i) => ({
    id: `user-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));

  const repository = new MockUserRepository(users);

  console.log('Running migration with continueOnError=true...');

  const result = await migrationService.migrateEntities(repository, {
    organizationId: 'org-example',
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 3,
    continueOnError: true
  });

  console.log('\nMigration Results:');
  console.log(`- Total: ${result.total}`);
  console.log(`- Succeeded: ${result.succeeded}`);
  console.log(`- Failed: ${result.failed}`);
  console.log(`- Success: ${result.success ? 'Yes' : 'No'}\n`);
}

/**
 * Example 5: Pause and resume migration
 */
async function example5_pauseResume() {
  console.log('\n=== Example 5: Pause and Resume Migration ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  const migrationService = new DataMigrationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  const users = Array.from({ length: 20 }, (_, i) => ({
    id: `user-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));

  const repository = new MockUserRepository(users);

  let migrationId = '';
  let pauseTriggered = false;

  console.log('Starting migration with pause capability...');

  const migrationPromise = migrationService.migrateEntities(repository, {
    organizationId: 'org-example',
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 5,
    onProgress: (progress) => {
      migrationId = progress.migrationId;

      // Pause on first progress update
      if (!pauseTriggered && progress.processed > 0) {
        console.log(`\nPausing migration at ${progress.processed}/${progress.total}...`);
        pauseTriggered = true;
        migrationService.pauseMigration(migrationId);
      }
    }
  });

  // Wait a bit then resume
  await new Promise((resolve) => setTimeout(resolve, 100));

  const pausedProgress = migrationService.getMigrationProgress(migrationId);
  console.log('Migration state:', pausedProgress?.state);

  console.log('\nResuming migration...');
  migrationService.resumeMigration(migrationId);

  await migrationPromise;

  console.log('✅ Migration completed after pause/resume\n');
}

/**
 * Example 6: Create with factory
 */
async function example6_factoryCreate() {
  console.log('\n=== Example 6: Create with Factory ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  const providerMap = new Map([['test-kms', mockKms]]);

  const migrationService = createDataMigrationService((name) => providerMap.get(name), 'test-kms');

  assert.ok(migrationService instanceof DataMigrationService);
  console.log('✅ Migration service created with factory!\n');
}

/**
 * Example 7: Large dataset migration
 */
async function example7_largeDataset() {
  console.log('\n=== Example 7: Large Dataset Migration ===\n');

  const mockKms = createMockKmsProvider({ name: 'test-kms' });
  mockKms.createTestKey('old-key');
  mockKms.createTestKey('new-key');

  const migrationService = new DataMigrationService(
    (name) => (name === 'test-kms' ? mockKms : undefined),
    'test-kms'
  );

  const users = Array.from({ length: 1000 }, (_, i) => ({
    id: `user-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`
  }));

  const repository = new MockUserRepository(users);

  console.log(`Migrating ${users.length} users...`);

  const startTime = Date.now();

  const result = await migrationService.migrateEntities(repository, {
    organizationId: 'org-example',
    oldKeyId: 'old-key',
    newKeyId: 'new-key',
    batchSize: 100,
    onProgress: (progress) => {
      const percent = ((progress.processed / progress.total) * 100).toFixed(1);

      // Log every 25% progress
      if (parseFloat(percent) % 25 < 5) {
        const elapsed = Date.now() - startTime;
        const rate = (progress.processed / (elapsed / 1000)).toFixed(2);
        console.log(
          `Progress: ${percent}% (${progress.processed}/${progress.total}) - ${rate} entities/sec`
        );
      }
    }
  });

  const duration = Date.now() - startTime;
  const throughput = (result.total / (duration / 1000)).toFixed(2);

  console.log('\nMigration Results:');
  console.log(`- Total: ${result.total}`);
  console.log(`- Succeeded: ${result.succeeded}`);
  console.log(`- Duration: ${duration}ms`);
  console.log(`- Throughput: ${throughput} entities/sec\n`);
}

/**
 * Run all examples
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Data Migration Examples                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await example1_basicMigration();
    await example2_migrationWithProgress();
    await example3_dryRunMigration();
    await example4_continueOnError();
    await example5_pauseResume();
    await example6_factoryCreate();
    await example7_largeDataset();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   All examples completed successfully!                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
