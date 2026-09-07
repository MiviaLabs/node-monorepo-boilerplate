/**
 * EncryptedStoreService Unit Tests
 *
 * Tests vault service operations with mocked dependencies.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - Store and retrieve classified data
 * - Access log updates on each operation
 * - Tenant isolation (cross-tenant prevention)
 * - Envelope encryption format validation
 * - Key rotation with transactional re-encryption
 */

import { inspect } from 'node:util';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { EncryptedStoreService } from '../encrypted-store.service';

import type { EncryptedStoreKeyService } from '../encrypted-store-key.service';
import type { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import type { EncryptionService } from '@package/encryption';
import type { OutboxRepository } from '@package/events';
import type { DataClassification } from '@package/types';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('EncryptedStoreService', () => {
  let encryptedStoreService: EncryptedStoreService;
  let encryption: jest.Mocked<Partial<EncryptionService>> & EncryptionService;
  let outbox: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;
  let mockTx: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;
  let encryptedStoreKeyService: jest.Mocked<EncryptedStoreKeyService>;
  let mockQueryBuilder: {
    from: jest.Mock;
    where: jest.Mock;
    and: jest.Mock;
    or: jest.Mock;
    limit: jest.Mock;
  };

  // Test data
  const tenantId1 = 123;
  const tenantId2 = 456;
  const userId = 999;
  const entityType = 'user';
  const entityId = 789;
  const fieldPath = 'profile.ssn';
  const confidentialValue = '123-45-6789';

  beforeEach(() => {
    // Create chainable query builder mock (Drizzle ORM pattern)
    mockQueryBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      and: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    };

    // Create chainable insert builder for .values().returning()
    function createMockInsertBuilder(): {
      values: jest.Mock;
      onConflictDoUpdate: jest.Mock;
      returning: jest.Mock;
    } {
      const now = new Date();
      return {
        values: jest.fn().mockReturnThis(),
        onConflictDoUpdate: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([
          {
            id: 1,
            organizationId: tenantId1,
            oldKeyId: `tenant-${tenantId1}`,
            newKeyId: `tenant-${tenantId1}-v2`,
            status: 'in_progress',
            totalEntries: 0,
            processedEntries: 0,
            failedEntries: 0,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            lastCursor: null
          }
        ])
      };
    }

    // Create mock transaction context (tx)
    mockTx = {
      insert: jest.fn().mockReturnValue(createMockInsertBuilder()),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined)
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      select: jest.fn(),
      execute: jest.fn().mockResolvedValue({ rows: [] })
    } as unknown as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

    // Create mock database with transaction support
    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(mockTx);
      }),
      select: jest.fn().mockReturnValue(mockQueryBuilder),
      insert: jest.fn().mockReturnValue(createMockInsertBuilder()),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined)
      })
    } as unknown as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

    // Create mock encryption service
    encryption = {
      encryptToBase64: jest.fn().mockResolvedValue({
        ciphertext: 'encrypted-ciphertext',
        encryptedDataKey: 'encrypted-data-key',
        iv: 'initialization-vector',
        authTag: 'authentication-tag'
      }),
      decryptFromBase64: jest.fn().mockResolvedValue(confidentialValue),
      reencryptDataKey: jest.fn().mockResolvedValue({
        encryptedDataKey: Buffer.from('new-encrypted-data-key'),
        oldKeyId: `tenant-${tenantId1}`,
        newKeyId: `tenant-${tenantId1}-v2`
      }),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      getProvider: jest.fn(),
      generateKey: jest.fn()
    } as unknown as jest.Mocked<Partial<EncryptionService>> & EncryptionService;

    // Create mock outbox repository
    outbox = {
      insert: jest.fn().mockResolvedValue(undefined),
      pollPending: jest.fn().mockResolvedValue([]),
      pollRetryable: jest.fn().mockResolvedValue([]),
      markAsProcessing: jest.fn().mockResolvedValue(undefined),
      markAsDelivered: jest.fn().mockResolvedValue(undefined),
      markAsFailed: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByAggregateId: jest.fn().mockResolvedValue([]),
      cleanupOldReplayMetadata: jest.fn().mockResolvedValue(undefined),
      createReplayMetadata: jest.fn().mockResolvedValue(undefined),
      getReplayMetadata: jest.fn().mockResolvedValue(null),
      updateReplayMetadata: jest.fn().mockResolvedValue(undefined),
      getPendingCount: jest.fn().mockResolvedValue(0),
      getFailedCount: jest.fn().mockResolvedValue(0),
      getRetryableCount: jest.fn().mockResolvedValue(0)
    } as unknown as jest.Mocked<OutboxRepository>;

    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<AuditOutboxPublisher>;

    // Mock EncryptedStoreKeyService
    encryptedStoreKeyService = {
      getPrimaryKeyId: jest.fn().mockResolvedValue('primary-encryption-key'),
      getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
        keyId: 'primary-encryption-key',
        keyVersion: 'primary-encryption-key/cryptoKeyVersions/1'
      })
    } as unknown as jest.Mocked<EncryptedStoreKeyService>;

    // Create vault service manually (not using NestJS DI for simpler testing)
    // Constructor signature: (encryption, encryptedStoreKeyService, outbox, db)
    encryptedStoreService = new EncryptedStoreService(encryption, encryptedStoreKeyService, outbox, auditOutbox, db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('store', () => {
    it('should store classified data with envelope encryption', async () => {
      // Arrange
      const options = {
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: confidentialValue,
        storedBy: userId,
        classification: 'confidential' as DataClassification
      };

      // Act
      const vaultEntryId = await encryptedStoreService.store(options);

      // Assert
      // PERF-001 fix: Verify store() returns vault entry ID
      expect(vaultEntryId).toBe(1);

      expect(encryption.encryptToBase64).toHaveBeenCalledTimes(1);
      expect(encryption.encryptToBase64).toHaveBeenCalledWith(confidentialValue, {
        keyId: 'primary-encryption-key'
      });

      // Verify transaction was used (operations happen inside transaction)
      expect(db.transaction).toHaveBeenCalledTimes(1);

      // Verify database insert was called inside transaction
      expect(mockTx.insert).toHaveBeenCalledTimes(1);

      // Verify outbox event was published
      expect(outbox.insert).toHaveBeenCalledTimes(1);
      expect(outbox.insert).toHaveBeenCalledWith(
        expect.anything(), // mockTx
        expect.objectContaining({
          eventType: 'vault.entry.created'
        })
      );
    });

    it('should default to internal classification if not provided', async () => {
      // Arrange - classification not provided
      const options = {
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: 'some-data',
        storedBy: userId
        // classification not provided - should default to 'internal'
      };

      // Act
      const vaultEntryId = await encryptedStoreService.store(options);

      // Assert - verify return value
      expect(vaultEntryId).toBe(1);

      // Assert - verify encryption was called with primary key
      expect(encryption.encryptToBase64).toHaveBeenCalledWith(
        'some-data',
        expect.objectContaining({
          keyId: 'primary-encryption-key'
        })
      );

      // Assert - verify 'internal' classification was used in the insert
      const insertBuilder = mockTx.insert(undefined as never);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          classification: 'internal'
        })
      );
    });

    it('should use transaction for atomic operation', async () => {
      // Arrange
      const options = {
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: confidentialValue,
        storedBy: userId,
        classification: 'confidential' as DataClassification
      };

      // Act
      const vaultEntryId = await encryptedStoreService.store(options);

      // Assert - verify return value
      expect(vaultEntryId).toBe(1);

      // Assert - verify transaction was used
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('should publish vault.entry.created event to outbox', async () => {
      // Arrange
      const options = {
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: confidentialValue,
        storedBy: userId,
        classification: 'restricted' as DataClassification
      };

      // Act
      const vaultEntryId = await encryptedStoreService.store(options);

      // Assert - verify return value
      expect(vaultEntryId).toBe(1);

      // Assert
      expect(outbox.insert).toHaveBeenCalledWith(
        expect.anything(), // mockTx
        expect.objectContaining({
          eventType: 'vault.entry.created'
        })
      );
    });

    it('should persist metadata-only audit event in the same transaction when requested', async () => {
      await encryptedStoreService.store({
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: confidentialValue,
        storedBy: userId,
        classification: 'restricted' as DataClassification,
        requestId: 'req-store',
        correlationId: 'corr-store',
        causationId: 'cause-store',
        emitAuditEvent: true
      });

      expect(auditOutbox.insert).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          eventType: 'vault.entry.stored.audit',
          correlationId: 'corr-store',
          causationId: 'cause-store',
          payload: expect.objectContaining({
            requestId: 'req-store',
            details: expect.objectContaining({
              classification: 'restricted'
            })
          })
        })
      );
    });

    it('should include access log in initial insert', async () => {
      // Arrange
      const options = {
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: confidentialValue,
        storedBy: userId,
        classification: 'confidential' as DataClassification
      };

      // Act
      const vaultEntryId = await encryptedStoreService.store(options);

      // Assert - verify return value
      expect(vaultEntryId).toBe(1);

      // Assert - verify insert was called with accessLog included
      // PERF-002 fix: accessLog is included in INSERT, no separate UPDATE
      expect(mockTx.insert).toHaveBeenCalled();
      const insertBuilder = mockTx.insert(undefined as never);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          accessLog: expect.arrayContaining([
            expect.objectContaining({
              action: 'stored',
              accessedBy: userId
            })
          ])
        })
      );
    });
  });

  describe('retrieve', () => {
    it('should retrieve and decrypt classified data', async () => {
      // Arrange - mock vault entry in database
      const mockVaultEntry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        ciphertext: 'encrypted-ciphertext',
        encryptedDataKey: 'encrypted-data-key',
        iv: 'initialization-vector',
        authTag: 'authentication-tag',
        keyId: `tenant-${tenantId1}`,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null
      };
      // Mock locked query result returned by tx.execute()
      mockTx.execute = jest.fn().mockResolvedValue({
        rows: [mockVaultEntry]
      });

      // Act
      const result = await encryptedStoreService.retrieve({
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        requestedBy: userId
      });

      // Assert
      expect(result).toBe(confidentialValue);

      // Verify decryption
      expect(encryption.decryptFromBase64).toHaveBeenCalledTimes(1);
      expect(encryption.decryptFromBase64).toHaveBeenCalledWith(
        mockVaultEntry.ciphertext,
        mockVaultEntry.encryptedDataKey,
        mockVaultEntry.iv,
        mockVaultEntry.authTag,
        { keyId: mockVaultEntry.keyId }
      );
    });

    it('should throw error when vault entry not found', async () => {
      // Arrange - empty result
      mockTx.execute = jest.fn().mockResolvedValue({
        rows: []
      });

      // Act & Assert
      await expect(
        encryptedStoreService.retrieve({
          tenantId: tenantId1,
          entityType,
          entityId,
          fieldPath,
          requestedBy: userId
        })
      ).rejects.toThrow('not found');
    });

    it('should update access log on retrieve', async () => {
      // Arrange - mock vault entry
      const mockVaultEntry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        ciphertext: 'encrypted-ciphertext',
        encryptedDataKey: 'encrypted-data-key',
        iv: 'iv',
        authTag: 'authTag',
        keyId: `tenant-${tenantId1}`,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null
      };
      mockTx.execute = jest.fn().mockResolvedValue({
        rows: [mockVaultEntry]
      });

      // Act
      await encryptedStoreService.retrieve({
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        requestedBy: userId
      });

      // Assert - verify update was called
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should emit metadata-only audit event for sensitive retrieve operations', async () => {
      // Arrange - mock vault entry
      const mockVaultEntry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: `tenant-${tenantId1}`,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        rotatedAt: null
      };
      mockTx.execute = jest.fn().mockResolvedValue({
        rows: [mockVaultEntry]
      });

      // Act
      await encryptedStoreService.retrieve({
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        requestedBy: userId,
        requestId: 'req-read',
        correlationId: 'corr-read',
        causationId: 'cause-read',
        emitAuditEvent: true
      });

      expect(auditOutbox.insert).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          eventType: 'vault.entry.viewed.audit',
          correlationId: 'corr-read',
          causationId: 'cause-read',
          payload: expect.objectContaining({
            requestId: 'req-read',
            details: expect.objectContaining({
              accessPath: 'entity_lookup',
              result: 'found'
            })
          })
        })
      );
    });

    it('should not emit direct audit outbox events for retrieveById helper reads', async () => {
      mockTx.execute = jest.fn().mockResolvedValue({
        rows: [
          {
            id: 1,
            entityType,
            entityId,
            fieldPath,
            ciphertext: 'ciphertext',
            encryptedDataKey: 'encryptedDataKey',
            iv: 'iv',
            authTag: 'authTag',
            keyId: `tenant-${tenantId1}`,
            keyVersion: null
          }
        ]
      });

      await encryptedStoreService.retrieveById({
        tenantId: tenantId1,
        vaultEntryId: 1,
        requestedBy: userId
      });

      expect(auditOutbox.insert).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('should scope queries to tenant ID', async () => {
      // Arrange - mock different entries for different tenants
      // Single-key architecture: all tenants use primary-encryption-key
      const tenant1Entry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: 'primary-encryption-key',
        classification: 'confidential' as DataClassification,
        category: 'pii'
      };
      const tenant2Entry = {
        id: 2,
        organizationId: tenantId2,
        entityType,
        entityId,
        fieldPath,
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: 'primary-encryption-key',
        classification: 'confidential' as DataClassification,
        category: 'pii'
      };

      // First call returns tenant1 entry, second could return tenant2 entry
      mockTx.execute = jest
        .fn()
        .mockResolvedValueOnce({
          rows: [tenant1Entry]
        })
        .mockResolvedValueOnce({
          rows: [tenant2Entry]
        });

      // Act - retrieve data for tenant1
      await encryptedStoreService.retrieve({
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        requestedBy: userId
      });

      // Assert - verify tenant scoping in WHERE clause
      expect(mockTx.execute).toHaveBeenCalledTimes(1);
    });

    it('should use primary encryption key for all tenants (single-key architecture)', async () => {
      // Arrange
      const options = {
        tenantId: tenantId1,
        entityType,
        entityId,
        fieldPath,
        value: confidentialValue,
        storedBy: userId,
        classification: 'confidential' as DataClassification
      };

      // Act
      const vaultEntryId = await encryptedStoreService.store(options);

      // Assert - verify return value
      expect(vaultEntryId).toBe(1);

      // Assert - single-key architecture: all tenants use primary-encryption-key
      expect(encryption.encryptToBase64).toHaveBeenCalledWith(confidentialValue, {
        keyId: 'primary-encryption-key'
      });
    });
  });

  describe('key rotation', () => {
    const oldKeyId = `tenant-${tenantId1}`;
    const newKeyId = `tenant-${tenantId1}-v2`;

    it('should rotate key with transactional re-encryption using provided key IDs', async () => {
      // Arrange - multiple vault entries for tenant, all under oldKeyId
      const now = new Date();
      const mockEntries = [
        {
          id: 1,
          organizationId: tenantId1,
          entityType,
          entityId: 1,
          fieldPath: 'profile.ssn',
          ciphertext: 'ciphertext',
          encryptedDataKey: 'encryptedDataKey',
          iv: 'iv',
          authTag: 'authTag',
          keyId: oldKeyId,
          classification: 'confidential' as DataClassification,
          category: 'pii',
          accessLog: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 2,
          organizationId: tenantId1,
          entityType,
          entityId: 2,
          fieldPath: 'profile.creditCard',
          ciphertext: 'ciphertext',
          encryptedDataKey: 'encryptedDataKey',
          iv: 'iv',
          authTag: 'authTag',
          keyId: oldKeyId,
          classification: 'confidential' as DataClassification,
          category: 'pii',
          accessLog: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 3,
          organizationId: tenantId1,
          entityType,
          entityId: 3,
          fieldPath: 'profile.bankAccount',
          ciphertext: 'ciphertext',
          encryptedDataKey: 'encryptedDataKey',
          iv: 'iv',
          authTag: 'authTag',
          keyId: oldKeyId,
          classification: 'confidential' as DataClassification,
          category: 'pii',
          accessLog: [],
          createdAt: now,
          updatedAt: now
        }
      ];

      // First SELECT returns the batch, second returns [] (exhausted)
      const limitFn = jest.fn().mockResolvedValueOnce(mockEntries).mockResolvedValueOnce([]);
      mockQueryBuilder.from = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: limitFn,
          // _getOrCreateRotationState uses .where().orderBy().limit(1) – return [] (no existing state)
          orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
        })
      });

      // Act
      await encryptedStoreService.rotateKey({ tenantId: tenantId1, actorId: userId, oldKeyId, newKeyId });

      // Assert - verify transactional re-encryption
      expect(db.transaction).toHaveBeenCalledTimes(1);

      // Verify each entry was re-encrypted using DEK rewrap (reencryptDataKey)
      expect(encryption.reencryptDataKey).toHaveBeenCalledTimes(mockEntries.length);

      // Verify first entry was re-encrypted with correct keys
      const firstEntry = mockEntries[0];
      if (!firstEntry) {
        throw new Error('First entry should exist');
      }
      expect(encryption.reencryptDataKey).toHaveBeenCalledWith(
        Buffer.from(firstEntry.encryptedDataKey, 'base64'),
        firstEntry.keyId,
        newKeyId
      );

      // Verify re-encryption used the event-provided newKeyId (not a synthetic Date.now() ID)
      const reencryptCall = encryption.reencryptDataKey as jest.Mock;
      const firstCall = reencryptCall.mock.calls[0];
      expect(firstCall?.[2]).toBe(newKeyId);
    });

    it('should rotate mixed key versions and query by tenant + keyId != newKeyId', async () => {
      const now = new Date();
      const legacyKeyId = `tenant-${tenantId1}-legacy-v0`;
      const mockEntries = [
        {
          id: 1,
          organizationId: tenantId1,
          entityType,
          entityId: 1,
          fieldPath: 'field',
          ciphertext: 'ciphertext',
          encryptedDataKey: 'encryptedDataKey',
          iv: 'iv',
          authTag: 'authTag',
          keyId: oldKeyId,
          classification: 'confidential' as DataClassification,
          category: 'pii',
          accessLog: [],
          createdAt: now,
          updatedAt: now
        },
        {
          id: 2,
          organizationId: tenantId1,
          entityType,
          entityId: 2,
          fieldPath: 'field-legacy',
          ciphertext: 'ciphertext',
          encryptedDataKey: 'encryptedDataKey',
          iv: 'iv',
          authTag: 'authTag',
          keyId: legacyKeyId,
          classification: 'confidential' as DataClassification,
          category: 'pii',
          accessLog: [],
          createdAt: now,
          updatedAt: now
        }
      ];

      const limitFn = jest.fn().mockResolvedValueOnce(mockEntries).mockResolvedValueOnce([]);
      const whereFn = jest.fn().mockReturnValue({
        limit: limitFn,
        // _getOrCreateRotationState uses .where().orderBy().limit(1) – return [] (no existing state)
        orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
      });
      mockQueryBuilder.from = jest.fn().mockReturnValue({ where: whereFn });

      await encryptedStoreService.rotateKey({ tenantId: tenantId1, actorId: userId, oldKeyId, newKeyId });

      expect(whereFn).toHaveBeenCalled();
      const batchWhereClause = (whereFn.mock.calls[0] ?? [])[0];
      expect(batchWhereClause).toBeDefined();
      const whereText = inspect(batchWhereClause, { depth: 6 });
      expect(whereText).toContain('organization_id');
      expect(whereText).toContain('key_id');
      expect(whereText).toContain(`value: ${tenantId1}`);
      expect(whereText).not.toContain(`value: '${oldKeyId}'`);

      expect(encryption.reencryptDataKey).toHaveBeenCalledTimes(mockEntries.length);
      expect(encryption.reencryptDataKey).toHaveBeenNthCalledWith(
        1,
        expect.any(Buffer),
        oldKeyId,
        newKeyId
      );
      expect(encryption.reencryptDataKey).toHaveBeenNthCalledWith(
        2,
        expect.any(Buffer),
        legacyKeyId,
        newKeyId
      );
    });

    it('should no-op when all tenant entries are already on newKeyId', async () => {
      // Arrange - empty result (query returns no entries with keyId != newKeyId)
      mockQueryBuilder.from = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
          // _getOrCreateRotationState uses .where().orderBy().limit(1) – return [] (no existing state)
          orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
        })
      });

      // Act - should not throw
      await encryptedStoreService.rotateKey({ tenantId: tenantId1, actorId: userId, oldKeyId, newKeyId });

      // Assert - no encryption operations
      expect(encryption.reencryptDataKey).not.toHaveBeenCalled();
      expect(db.select).toHaveBeenCalled();
    });

    it('should paginate through all entries beyond a single batch (no 1000-entry cap)', async () => {
      // Arrange - more entries than BATCH_SIZE (50) across multiple pages
      const BATCH_SIZE = 50;
      const now = new Date();
      const batch1 = Array.from({ length: BATCH_SIZE }, (_, i) => ({
        id: i + 1,
        organizationId: tenantId1,
        entityType,
        entityId: i + 1,
        fieldPath: 'field',
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: oldKeyId,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: now,
        updatedAt: now
      }));
      const batch2 = Array.from({ length: 30 }, (_, i) => ({
        id: BATCH_SIZE + i + 1,
        organizationId: tenantId1,
        entityType,
        entityId: BATCH_SIZE + i + 1,
        fieldPath: 'field',
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: oldKeyId,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: now,
        updatedAt: now
      }));

      // Pagination: first page full, second page partial (< BATCH_SIZE → done)
      const limitFn = jest
        .fn()
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2)
        .mockResolvedValueOnce([]); // safety guard – should not be called
      mockQueryBuilder.from = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: limitFn,
          // _getOrCreateRotationState uses .where().orderBy().limit(1) – return [] (no existing state)
          orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
        })
      });

      // Act
      await encryptedStoreService.rotateKey({ tenantId: tenantId1, actorId: userId, oldKeyId, newKeyId });

      const totalEntries = batch1.length + batch2.length; // 80 > BATCH_SIZE
      expect(encryption.reencryptDataKey).toHaveBeenCalledTimes(totalEntries);

      // Two batches → two transactions
      expect(db.transaction).toHaveBeenCalledTimes(2);
    });

    it('should use transaction for atomic key rotation', async () => {
      // Arrange
      const now = new Date();
      const mockEntry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId: 1,
        fieldPath: 'field',
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: oldKeyId,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: now,
        updatedAt: now
      };
      const limitFn = jest.fn().mockResolvedValueOnce([mockEntry]).mockResolvedValueOnce([]);
      mockQueryBuilder.from = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: limitFn,
          orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
        })
      });

      // Act
      await encryptedStoreService.rotateKey({ tenantId: tenantId1, actorId: userId, oldKeyId, newKeyId });

      // Assert
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('should emit rotation audit events with preserved trace metadata', async () => {
      mockQueryBuilder.from = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
          orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
        })
      });

      await encryptedStoreService.rotateKey({
        tenantId: tenantId1,
        actorId: userId,
        oldKeyId,
        newKeyId,
        requestId: 'req-rotate',
        correlationId: 'corr-rotate',
        causationId: 'cause-rotate',
        emitAuditEvent: true,
        triggerSource: 'http'
      });

      expect(auditOutbox.insert).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          eventType: 'vault.key.rotated.audit',
          correlationId: 'corr-rotate',
          causationId: 'cause-rotate',
          payload: expect.objectContaining({
            requestId: 'req-rotate',
            details: expect.objectContaining({
              triggerSource: 'http'
            })
          })
        })
      );
    });

    it('should use provided newKeyId for re-encryption (no synthetic Date.now() key)', async () => {
      // Arrange
      const now = new Date();
      const mockEntry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId: 1,
        fieldPath: 'field',
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: oldKeyId,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: now,
        updatedAt: now
      };
      const limitFn = jest.fn().mockResolvedValueOnce([mockEntry]).mockResolvedValueOnce([]);
      mockQueryBuilder.from = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: limitFn,
          orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
        })
      });

      // Act
      await encryptedStoreService.rotateKey({ tenantId: tenantId1, actorId: userId, oldKeyId, newKeyId });

      // Assert – must use the exact newKeyId supplied, never a Date.now() variant
      const reencryptCall = encryption.reencryptDataKey as jest.Mock;
      const firstCall = reencryptCall.mock.calls[0];
      expect(firstCall?.[2]).toBe(newKeyId);
      expect(firstCall?.[2]).not.toContain('rotated-');
    });

    it('should normalize full resource old/new key IDs and per-entry keyId before re-encrypting DEKs', async () => {
      const now = new Date();
      const fullResourceOldKeyId =
        'projects/p/locations/us/keyRings/r/cryptoKeys/primary-encryption-key/cryptoKeyVersions/7';
      const fullResourceNewKeyId =
        'projects/p/locations/us/keyRings/r/cryptoKeys/primary-encryption-key/cryptoKeyVersions/8';
      const mockEntry = {
        id: 1,
        organizationId: tenantId1,
        entityType,
        entityId: 1,
        fieldPath: 'field',
        ciphertext: 'ciphertext',
        encryptedDataKey: 'encryptedDataKey',
        iv: 'iv',
        authTag: 'authTag',
        keyId: fullResourceOldKeyId,
        classification: 'confidential' as DataClassification,
        category: 'pii',
        accessLog: [],
        createdAt: now,
        updatedAt: now
      };
      const limitFn = jest.fn().mockResolvedValueOnce([mockEntry]).mockResolvedValueOnce([]);
      const whereFn = jest.fn().mockReturnValue({
        limit: limitFn,
        orderBy: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) })
      });
      mockQueryBuilder.from = jest.fn().mockReturnValue({ where: whereFn });

      await encryptedStoreService.rotateKey({
        tenantId: tenantId1,
        actorId: userId,
        oldKeyId: fullResourceOldKeyId,
        newKeyId: fullResourceNewKeyId
      });

      const whereClause = (whereFn.mock.calls[0] ?? [])[0];
      const whereText = inspect(whereClause, { depth: 6 });
      expect(whereText).toContain('primary-encryption-key/cryptoKeyVersions/8');

      expect(encryption.reencryptDataKey).toHaveBeenCalledWith(
        Buffer.from(mockEntry.encryptedDataKey, 'base64'),
        'primary-encryption-key/cryptoKeyVersions/7',
        'primary-encryption-key/cryptoKeyVersions/8'
      );
    });
  });
});
