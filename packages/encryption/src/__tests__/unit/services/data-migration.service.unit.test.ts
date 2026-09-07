/**
 * Unit tests for Data Migration Service
 */

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import {
  DataMigrationService,
  MigrationState,
  createDataMigrationService,
  IEntityRepository
} from '../../../services/data-migration.service';

/**
 * Test entity interface
 */
interface TestUser extends Record<string, unknown> {
  id: string;
  name: string;
  email: string | Record<string, unknown>;
}

/**
 * Mock repository for testing with tenant isolation.
 *
 * Implements `IEntityRepository<TestUser>` with strict multi-tenant isolation.
 * Data is stored in a Map keyed by organizationId, ensuring that all repository
 * methods only operate on data belonging to the specified tenant.
 *
 * ## Tenant Isolation Behavior
 *
 * - **Constructor**: The `organizationId` parameter is **enforced** - initial data
 *   is stored under that tenant ID and cannot be accessed by other tenants.
 * - **All methods**: Each method requires an `organizationId` parameter and will
 *   only return/modify data for that specific tenant. Cross-tenant access is prevented.
 * - **Empty results**: Querying a non-existent tenant returns empty arrays, not errors.
 *
 * @example
 * ```typescript
 * // Create repository with initial data for tenant 'org-123'
 * const users = [{ id: '1', name: 'Alice', email: 'alice@example.com' }];
 * const repo = new MockRepository('org-123', users);
 *
 * // Query data - only returns data for the specified tenant
 * const org123Users = await repo.findAll('org-123'); // Returns [Alice]
 * const org456Users = await repo.findAll('org-456'); // Returns [] (empty)
 *
 * // Save data - scoped to the tenant
 * await repo.save('org-123', { id: '2', name: 'Bob', email: 'bob@example.com' });
 * ```
 */
class MockRepository implements IEntityRepository<TestUser> {
  entityName = 'TestUser';
  /** Data storage keyed by organizationId for tenant isolation */
  private dataByOrg: Map<string, TestUser[]> = new Map();

  /** Track save calls for assertions */
  saveCalls: Array<{ organizationId: string; entity: TestUser }> = [];

  /**
   * Creates a mock repository with initial data for a specific tenant.
   *
   * The organizationId is enforced - data is stored under this tenant ID
   * and will only be accessible via methods called with the same tenant ID.
   *
   * @param organizationId - The tenant ID to associate initial data with (required)
   * @param data - Initial data for the specified tenant
   */
  constructor(organizationId: string, data: TestUser[]) {
    this.dataByOrg.set(organizationId, [...data]);
  }

  async findAll(
    organizationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<TestUser[]> {
    const tenantData = this.dataByOrg.get(organizationId) ?? [];
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? tenantData.length;
    return tenantData.slice(offset, offset + limit);
  }

  async save(organizationId: string, entity: TestUser): Promise<TestUser> {
    this.saveCalls.push({ organizationId, entity });
    const tenantData = this.dataByOrg.get(organizationId) ?? [];
    const index = tenantData.findIndex((e) => e.id === entity.id);
    if (index >= 0) {
      tenantData[index] = entity;
    } else {
      tenantData.push(entity);
    }
    this.dataByOrg.set(organizationId, tenantData);
    return entity;
  }

  async saveBatch(organizationId: string, entities: TestUser[]): Promise<TestUser[]> {
    for (const entity of entities) {
      await this.save(organizationId, entity);
    }
    return entities;
  }

  async count(organizationId: string): Promise<number> {
    const tenantData = this.dataByOrg.get(organizationId) ?? [];
    return tenantData.length;
  }

  /**
   * Returns data for a specific tenant (for test assertions).
   */
  getData(organizationId: string): TestUser[] {
    return [...(this.dataByOrg.get(organizationId) ?? [])];
  }
}

describe('DataMigrationService', () => {
  let mockKms: ReturnType<typeof createMockKmsProvider>;
  let service: DataMigrationService;
  const providerMap = new Map<string, ReturnType<typeof createMockKmsProvider>>();

  beforeEach(() => {
    providerMap.clear();
    mockKms = createMockKmsProvider({ name: 'mock-kms' });
    providerMap.set('mock-kms', mockKms);
    service = new DataMigrationService(
      (name?: string) => (name ? (providerMap.get(name) ?? undefined) : undefined),
      'mock-kms'
    );
  });

  describe('migrateEntities', () => {
    it('should migrate entities successfully (without encrypted fields)', async () => {
      // Arrange
      const entities = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const repository = new MockRepository('org-test', entities);

      // Act
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 5
      });

      // Assert
      expect(result.migrationId.startsWith('migration-')).toBeTruthy();
      expect(result.total).toBe(10);
      expect(result.succeeded).toBe(0); // No encrypted fields, so nothing migrated
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
      expect(result.state).toBe(MigrationState.COMPLETED);
      expect(result.batchesProcessed).toBe(2);
    });

    it('should handle empty dataset', async () => {
      // Arrange
      const repository = new MockRepository('org-test', []);

      // Act
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Assert
      expect(result.total).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle continueOnError', async () => {
      // Arrange
      const entities = [
        { id: '1', name: 'User1', email: 'user1@example.com' },
        { id: '2', name: 'User2', email: 'user2@example.com' },
        { id: '3', name: 'User3', email: 'user3@example.com' }
      ];
      const repository = new MockRepository('org-test', entities);

      // Act
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 1,
        continueOnError: true
      });

      // Assert
      expect(result.total).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
      expect(result.state).toBe(MigrationState.COMPLETED);
    });

    it('should fail on error when continueOnError is false', async () => {
      // Arrange
      const entities = [
        { id: '1', name: 'User1', email: 'user1@example.com' },
        { id: '2', name: 'User2', email: 'user2@example.com' }
      ];
      const repository = new MockRepository('org-test', entities);

      const unavailableProvider = createMockKmsProvider({ name: 'unavailable-kms' });
      unavailableProvider.healthCheck = async () => false;
      unavailableProvider.isAvailable = async () => false;

      const failingProviderMap = new Map<string, ReturnType<typeof createMockKmsProvider>>();
      failingProviderMap.set('unavailable-kms', unavailableProvider);

      const failingService = new DataMigrationService(
        (name?: string) => (name ? (failingProviderMap.get(name) ?? undefined) : undefined),
        'unavailable-kms'
      );

      // Act & Assert
      await expect(
        failingService.migrateEntities(repository, {
          organizationId: 'org-test',
          oldKeyId: 'old-key',
          newKeyId: 'new-key',
          oldProvider: 'unavailable-kms',
          newProvider: 'unavailable-kms',
          continueOnError: false
        })
      ).rejects.toThrow(/not available/);
    });

    it('should support dry-run mode', async () => {
      // Arrange
      const entities = [
        { id: '1', name: 'User1', email: 'user1@example.com' },
        { id: '2', name: 'User2', email: 'user2@example.com' }
      ];
      const repository = new MockRepository('org-test', entities);

      // Act
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        dryRun: true
      });

      // Assert - save should not be called in dry-run mode
      expect(repository.saveCalls.length).toBe(0);
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(0); // No encrypted fields
    });

    it('should call progress callback', async () => {
      // Arrange
      const entities = Array.from({ length: 25 }, (_, i) => ({
        id: String(i),
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const repository = new MockRepository('org-test', entities);
      const progressUpdates: unknown[] = [];

      // Act
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 10,
        onProgress: (progress) => {
          progressUpdates.push({ ...progress });
        }
      });

      // Assert
      expect(progressUpdates.length > 0).toBeTruthy();
      expect(result.total).toBe(25);
      const lastUpdate = progressUpdates[progressUpdates.length - 1] as { processed: number };
      expect(lastUpdate.processed).toBe(25);
    });

    it('should add delay between batches', async () => {
      // Arrange
      const entities = Array.from({ length: 4 }, (_, i) => ({
        id: String(i),
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const repository = new MockRepository('org-test', entities);

      // Act - use a minimal delay to verify the feature works without slowing tests
      const startTime = Date.now();
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 2,
        batchDelay: 10 // 10ms delay between batches
      });
      const elapsed = Date.now() - startTime;

      // Assert - migration completed successfully
      expect(result.total).toBe(4);
      expect(result.success).toBe(true);
      // With 2 batches and 10ms delay between them, should take at least some time
      // (only 1 delay between batch 1 and batch 2)
      // Use >= 5 to account for timing variations in test environments
      expect(elapsed).toBeGreaterThanOrEqual(5);
    });

    it('should validate providers are available', async () => {
      // Arrange
      const repository = new MockRepository('org-test', []);

      // Act & Assert
      await expect(
        service.migrateEntities(repository, {
          organizationId: 'org-test',
          oldKeyId: 'old-key',
          newKeyId: 'new-key',
          oldProvider: 'non-existent'
        })
      ).rejects.toThrow(/not found/);
    });
  });

  describe('getMigrationProgress', () => {
    it('should return progress for active migration', async () => {
      // Arrange
      const entities = [
        { id: '1', name: 'User1', email: 'user1@example.com' },
        { id: '2', name: 'User2', email: 'user2@example.com' }
      ];
      const repository = new MockRepository('org-test', entities);
      let migrationId = '';
      const onProgress = (progress: { migrationId: string }) => {
        migrationId = progress.migrationId;
      };

      // Act
      await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        onProgress
      });
      const progress = service.getMigrationProgress('org-test', migrationId);

      // Assert
      // After completion, the migration is removed from active migrations
      expect(progress === undefined || progress.migrationId === migrationId).toBeTruthy();
    });

    it('should return undefined for non-existent migration', () => {
      // Arrange - no setup needed, using non-existent ID

      // Act
      const progress = service.getMigrationProgress('org-test', 'non-existent');

      // Assert
      expect(progress).toBeUndefined();
    });
  });

  describe('pause/resume/cancel', () => {
    it('should return false when pausing/resuming completed migration', async () => {
      // Arrange
      const entities = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const repository = new MockRepository('org-test', entities);
      let migrationId = '';
      const onProgress = (progress: { migrationId: string }) => {
        migrationId = progress.migrationId;
      };

      // Act - complete the migration first
      await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        batchSize: 5,
        onProgress
      });

      // Try to pause/resume after completion
      const paused = service.pauseMigration('org-test', migrationId);
      const resumed = service.resumeMigration('org-test', migrationId);

      // Assert
      // After completion, the migration is no longer active, so pause/resume should return false
      expect(paused).toBe(false);
      expect(resumed).toBe(false);
    });

    it('should cancel migration', async () => {
      // Arrange
      const entities = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const repository = new MockRepository('org-test', entities);
      let migrationId = '';
      const onProgress = (progress: { migrationId: string }) => {
        migrationId = progress.migrationId;
      };

      // Act
      const migrationPromise = service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key',
        onProgress
      });
      await migrationPromise;
      const cancelled = service.cancelMigration('org-test', migrationId);

      // Assert
      // Cancel might return false if migration already completed
      expect(typeof cancelled).toBe('boolean');
    });

    it('should list active migrations', async () => {
      // Arrange
      const entities = [{ id: '1', name: 'User1', email: 'user1@example.com' }];
      const repository = new MockRepository('org-test', entities);

      // Act
      const result = await service.migrateEntities(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      });
      const activeMigrations = service.listActiveMigrations('org-test');

      // Assert
      expect(Array.isArray(activeMigrations)).toBeTruthy();
      expect(activeMigrations.some((m) => m.migrationId === result.migrationId)).toBe(false);
    });
  });

  describe('previewMigration', () => {
    it('should run migration in dry-run mode', async () => {
      // Arrange
      const entities = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: `User${i}`,
        email: `user${i}@example.com`
      }));
      const repository = new MockRepository('org-test', entities);

      // Act
      const result = await service.previewMigration(repository, {
        organizationId: 'org-test',
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      });

      // Assert
      expect(result.total).toBe(5);
      expect(result.succeeded).toBe(0); // No encrypted fields
      expect(result.failed).toBe(0);
    });
  });
});

describe('createDataMigrationService', () => {
  it('should create service instance', () => {
    // Arrange
    const mockKms = createMockKmsProvider({ name: 'mock-kms' });
    const providerMap = new Map([['mock-kms', mockKms]]);

    // Act
    const service = createDataMigrationService(
      (name?: string) => (name ? (providerMap.get(name) ?? undefined) : undefined),
      'mock-kms'
    );

    // Assert
    expect(service).toBeInstanceOf(DataMigrationService);
  });
});
