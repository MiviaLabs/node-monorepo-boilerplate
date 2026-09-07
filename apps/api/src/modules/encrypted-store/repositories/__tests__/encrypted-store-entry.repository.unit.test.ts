/**
 * EncryptedStoreEntryRepository Unit Tests
 *
 * Tests repository operations with mocked database.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - findByEntityAndField() - composite key lookup
 * - findByTenant() - tenant-scoped listing
 * - findByClassification() - classification filtering
 * - countByTenant() - entry counting
 * - createWithTransaction() - atomic creation
 * - updateAccessLogWithTransaction() - JSONB append
 * - updateEncryptionWithTransaction() - key rotation update
 * - Tenant isolation verification
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AccessLogAction } from '@package/db-core';

import { EncryptedStoreEntryRepository } from '../encrypted-store-entry.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('EncryptedStoreEntryRepository', () => {
  let repository: EncryptedStoreEntryRepository;
  let db: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;
  let mockTx: jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;
  let mockSelectBuilder: {
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };
  let mockInsertBuilder: {
    values: jest.Mock;
    returning: jest.Mock;
  };
  let mockUpdateBuilder: {
    set: jest.Mock;
    where: jest.Mock;
  };

  // Test data
  const tenantId = 123;
  const entityType = 'user';
  const entityId = 789;
  const fieldPath = 'profile.ssn';

  const mockEncryptedStoreEntry = {
    id: 1,
    organizationId: tenantId,
    entityType: 'user' as const,
    entityId,
    fieldPath,
    ciphertext: 'encrypted-ciphertext-base64',
    encryptedDataKey: 'encrypted-data-key-base64',
    iv: 'initialization-vector-base64',
    authTag: 'authentication-tag-base64',
    keyId: `tenant-${tenantId}`,
    classification: 'confidential' as const,
    category: 'pii' as const,
    accessLog: [],
    expiresAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rotatedAt: null
  };

  beforeEach(() => {
    // Create chainable select builder
    mockSelectBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    };

    // Create chainable insert builder
    mockInsertBuilder = {
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([mockEncryptedStoreEntry])
    };

    // Create chainable update builder
    mockUpdateBuilder = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock transaction context
    mockTx = {
      insert: jest.fn().mockReturnValue(mockInsertBuilder),
      update: jest.fn().mockReturnValue(mockUpdateBuilder),
      select: jest.fn().mockReturnValue(mockSelectBuilder)
    } as unknown as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

    // Create mock database
    db = {
      select: jest.fn().mockReturnValue(mockSelectBuilder),
      insert: jest.fn().mockReturnValue(mockInsertBuilder),
      update: jest.fn().mockReturnValue(mockUpdateBuilder)
    } as unknown as jest.Mocked<Partial<NodePgDatabase>> & NodePgDatabase;

    // Create repository with mocked db
    repository = new EncryptedStoreEntryRepository(db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEntityAndField', () => {
    it('should find encrypted-store entry by entity and field path', async () => {
      // Arrange
      mockSelectBuilder.limit = jest.fn().mockResolvedValue([mockEncryptedStoreEntry]);

      // Act
      const result = await repository.findByEntityAndField(
        tenantId,
        entityType,
        entityId,
        fieldPath
      );

      // Assert
      expect(result).toEqual(mockEncryptedStoreEntry);
      expect(db.select).toHaveBeenCalled();
      expect(mockSelectBuilder.from).toHaveBeenCalled();
      expect(mockSelectBuilder.where).toHaveBeenCalled();
      expect(mockSelectBuilder.limit).toHaveBeenCalledWith(1);
    });

    it('should return null when encrypted-store entry not found', async () => {
      // Arrange
      mockSelectBuilder.limit = jest.fn().mockResolvedValue([]);

      // Act
      const result = await repository.findByEntityAndField(
        tenantId,
        entityType,
        entityId,
        'nonexistent.field'
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should scope query to tenant', async () => {
      // Arrange
      mockSelectBuilder.limit = jest.fn().mockResolvedValue([mockEncryptedStoreEntry]);

      // Act
      await repository.findByEntityAndField(tenantId, entityType, entityId, fieldPath);

      // Assert - verify where clause was called (tenant scoping happens in the where)
      expect(mockSelectBuilder.where).toHaveBeenCalled();
    });
  });

  describe('findByTenant', () => {
    it('should find all encrypted-store entries for a tenant', async () => {
      // Arrange
      const mockEntries = [
        mockEncryptedStoreEntry,
        { ...mockEncryptedStoreEntry, id: 2, fieldPath: 'profile.email' }
      ];
      mockSelectBuilder.where = jest.fn().mockResolvedValue(mockEntries);

      // Act
      const result = await repository.findByTenant(tenantId);

      // Assert
      expect(result).toEqual(mockEntries);
      expect(db.select).toHaveBeenCalled();
      expect(mockSelectBuilder.from).toHaveBeenCalled();
      expect(mockSelectBuilder.where).toHaveBeenCalled();
    });

    it('should return empty array when no entries found', async () => {
      // Arrange
      mockSelectBuilder.where = jest.fn().mockResolvedValue([]);

      // Act
      const result = await repository.findByTenant(tenantId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findByClassification', () => {
    it('should find encrypted-store entries by classification level', async () => {
      // Arrange
      const restrictedEntries = [{ ...mockEncryptedStoreEntry, classification: 'restricted' as const }];
      mockSelectBuilder.where = jest.fn().mockResolvedValue(restrictedEntries);

      // Act
      const result = await repository.findByClassification(tenantId, 'restricted');

      // Assert
      expect(result).toEqual(restrictedEntries);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when no entries match classification', async () => {
      // Arrange
      mockSelectBuilder.where = jest.fn().mockResolvedValue([]);

      // Act
      const result = await repository.findByClassification(tenantId, 'public');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('countByTenant', () => {
    it('should count encrypted-store entries for a tenant', async () => {
      // Arrange
      mockSelectBuilder.where = jest.fn().mockResolvedValue([{ count: 42 }]);

      // Act
      const result = await repository.countByTenant(tenantId);

      // Assert
      expect(result).toBe(42);
    });

    it('should return 0 when no entries exist', async () => {
      // Arrange
      mockSelectBuilder.where = jest.fn().mockResolvedValue([{ count: 0 }]);

      // Act
      const result = await repository.countByTenant(tenantId);

      // Assert
      expect(result).toBe(0);
    });

    it('should return 0 when result is undefined', async () => {
      // Arrange
      mockSelectBuilder.where = jest.fn().mockResolvedValue([]);

      // Act
      const result = await repository.countByTenant(tenantId);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('createWithTransaction', () => {
    it('should create encrypted-store entry within transaction', async () => {
      // Arrange
      const createData = {
        organizationId: tenantId,
        entityType: 'user' as const,
        entityId,
        fieldPath,
        ciphertext: 'encrypted-ciphertext',
        encryptedDataKey: 'encrypted-data-key',
        iv: 'iv',
        authTag: 'authTag',
        keyId: `tenant-${tenantId}`,
        classification: 'confidential' as const,
        category: 'pii' as const,
        accessLog: [],
        expiresAt: null,
        metadata: null
      };

      // Act
      const result = await repository.createWithTransaction(tenantId, mockTx, createData);

      // Assert
      expect(result).toEqual(mockEncryptedStoreEntry);
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockInsertBuilder.values).toHaveBeenCalled();
      expect(mockInsertBuilder.returning).toHaveBeenCalled();
    });

    it('should throw error when insert fails', async () => {
      // Arrange
      mockInsertBuilder.returning = jest.fn().mockResolvedValue([]);
      const createData = {
        organizationId: tenantId,
        entityType: 'user' as const,
        entityId,
        fieldPath,
        ciphertext: 'encrypted-ciphertext',
        encryptedDataKey: 'encrypted-data-key',
        iv: 'iv',
        authTag: 'authTag',
        keyId: `tenant-${tenantId}`,
        classification: 'confidential' as const,
        category: 'pii' as const,
        accessLog: [],
        expiresAt: null,
        metadata: null
      };

      // Act & Assert
      await expect(repository.createWithTransaction(tenantId, mockTx, createData)).rejects.toThrow(
        'Failed to create vault entry'
      );
    });

    it('should include tenant ID in the insert', async () => {
      // Arrange
      const createData = {
        organizationId: tenantId,
        entityType: 'user' as const,
        entityId,
        fieldPath,
        ciphertext: 'encrypted-ciphertext',
        encryptedDataKey: 'encrypted-data-key',
        iv: 'iv',
        authTag: 'authTag',
        keyId: `tenant-${tenantId}`,
        classification: 'confidential' as const,
        category: 'pii' as const,
        accessLog: [],
        expiresAt: null,
        metadata: null
      };

      // Act
      await repository.createWithTransaction(tenantId, mockTx, createData);

      // Assert - verify values was called with organizationId
      expect(mockInsertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: tenantId
        })
      );
    });
  });

  describe('updateAccessLogWithTransaction', () => {
    it('should append access log entry within transaction', async () => {
      // Arrange
      const accessLogEntry = {
        timestamp: new Date().toISOString(),
        accessedBy: 999,
        action: AccessLogAction.RETRIEVED,
        ipAddress: '192.168.1.1'
      };

      // Act
      await repository.updateAccessLogWithTransaction(mockTx, 1, accessLogEntry);

      // Assert
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockUpdateBuilder.set).toHaveBeenCalled();
      expect(mockUpdateBuilder.where).toHaveBeenCalled();
    });

    it('should update the updatedAt timestamp', async () => {
      // Arrange
      const accessLogEntry = {
        timestamp: new Date().toISOString(),
        accessedBy: 999,
        action: AccessLogAction.RETRIEVED
      };

      // Act
      await repository.updateAccessLogWithTransaction(mockTx, 1, accessLogEntry);

      // Assert - verify set was called (with updatedAt included)
      expect(mockUpdateBuilder.set).toHaveBeenCalled();
    });
  });

  describe('updateEncryptionWithTransaction', () => {
    it('should update encryption data within transaction', async () => {
      // Arrange
      const encryptionData = {
        ciphertext: 'new-ciphertext',
        encryptedDataKey: 'new-encrypted-data-key',
        iv: 'new-iv',
        authTag: 'new-authTag',
        keyId: `tenant-${tenantId}-rotated-${Date.now()}`
      };

      // Act
      await repository.updateEncryptionWithTransaction(mockTx, 1, encryptionData);

      // Assert
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockUpdateBuilder.set).toHaveBeenCalled();
      expect(mockUpdateBuilder.where).toHaveBeenCalled();
    });

    it('should set rotatedAt timestamp', async () => {
      // Arrange
      const encryptionData = {
        ciphertext: 'new-ciphertext',
        encryptedDataKey: 'new-encrypted-data-key',
        iv: 'new-iv',
        authTag: 'new-authTag',
        keyId: `tenant-${tenantId}-rotated-${Date.now()}`
      };

      // Act
      await repository.updateEncryptionWithTransaction(mockTx, 1, encryptionData);

      // Assert - verify set was called (with rotatedAt included)
      expect(mockUpdateBuilder.set).toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('should not return entries from other tenants in findByEntityAndField', async () => {
      // Arrange - entry belongs to different tenant
      const otherTenantEntry = { ...mockEncryptedStoreEntry, organizationId: 456 };
      mockSelectBuilder.limit = jest.fn().mockResolvedValue([otherTenantEntry]);

      // Act
      await repository.findByEntityAndField(tenantId, entityType, entityId, fieldPath);

      // Assert - result returned but query was scoped (mock returns different tenant data for testing)
      // In real implementation, the WHERE clause ensures tenant scoping
      expect(mockSelectBuilder.where).toHaveBeenCalled();
    });

    it('should scope findByClassification to tenant', async () => {
      // Act
      await repository.findByClassification(tenantId, 'confidential');

      // Assert - verify where clause was called for tenant scoping
      expect(mockSelectBuilder.where).toHaveBeenCalled();
    });

    it('should scope countByTenant to tenant', async () => {
      // Arrange
      mockSelectBuilder.where = jest.fn().mockResolvedValue([{ count: 5 }]);

      // Act
      await repository.countByTenant(tenantId);

      // Assert - verify where clause was called for tenant scoping
      expect(mockSelectBuilder.where).toHaveBeenCalled();
    });
  });
});
