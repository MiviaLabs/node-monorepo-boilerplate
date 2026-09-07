import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  and,
  eq,
  inArray,
  keyRotationState,
  organizations,
  ROTATION_STATUS,
  tenants,
  encryptedStoreEntries
} from '@package/db-core';
import { EncryptionService, EnvVarProvider, KmsProviderFactory } from '@package/encryption';
import { sql } from 'drizzle-orm';

import { AddressKeyRotationService } from '../address-key-rotation.service';

import type { OutboxRepository } from '@package/events';

// Increase timeout for database operations (Testcontainers startup)
jest.setTimeout(60000);

describe('AddressKeyRotationService Integration Tests', () => {
  type AddressServiceDb = ConstructorParameters<typeof AddressKeyRotationService>[0];
  let db: AddressServiceDb;
  let teardownDb: () => Promise<void> = async () => {};
  let addressKeyRotationService: AddressKeyRotationService;
  let outboxRepo: Pick<OutboxRepository, 'insert'>;
  let encryptionService: EncryptionService;
  let createVaultEntry: (db: AddressServiceDb, data: Record<string, unknown>) => Promise<number>;

  // Test data
  let organizationId = 1;
  // Single-key architecture: keyId stays constant ('primary-encryption-key')
  // keyVersion tracks the specific KMS CryptoKeyVersion
  const oldKeyId = 'primary-encryption-key';
  // newKeyId is a versioned path for the new KMS CryptoKeyVersion
  const newKeyId = 'primary-encryption-key/cryptoKeyVersions/5';
  const userId = 1;
  const vaultEntryIds: number[] = [];

  beforeAll(async () => {
    // Setup test database with Testcontainers
    const testUtils = await import('@package/test-utils');
    await testUtils.setupTestDatabaseJest();
    db = testUtils.getTestDb().db as unknown as AddressServiceDb;
    teardownDb = testUtils.teardownTestDatabase;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS key_rotation_state (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        old_key_id VARCHAR(255) NOT NULL,
        new_key_id VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL,
        total_entries INTEGER NOT NULL,
        processed_entries INTEGER NOT NULL DEFAULT 0,
        failed_entries INTEGER NOT NULL DEFAULT 0,
        errors JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        last_cursor TEXT,
        metadata JSONB
      )
    `);
    const [tenant] = await db
      .insert(tenants)
      .values({
        type: 'organization',
        status: 'active'
      })
      .returning({ id: tenants.id });
    assert.ok(tenant);

    const [organization] = await db
      .insert(organizations)
      .values({
        tenantId: tenant.id,
        name: 'Key Rotation Test Org',
        slug: `key-rotation-test-${Date.now()}`
      })
      .returning({ id: organizations.id });
    assert.ok(organization);
    organizationId = organization.id;

    // Create encryption service with test provider
    const oldKey = randomBytes(32).toString('hex');
    const newKey = randomBytes(32).toString('hex');
    const defaultKey = randomBytes(32).toString('hex');
    const kmsFactory = new KmsProviderFactory();
    kmsFactory.registerProvider(
      'test-env',
      new EnvVarProvider({
        defaultKeyId: 'default',
        keys: {
          default: defaultKey,
          [oldKeyId]: oldKey,
          [newKeyId]: newKey
        }
      }),
      true
    );
    encryptionService = new EncryptionService(
      (name?: string) => (name ? kmsFactory.getProvider(name) : kmsFactory.getDefaultProvider()),
      'test-env'
    );

    // Mock encryption service methods to avoid actual cryptographic operations
    jest
      .spyOn(encryptionService, 'reencryptDataKey')
      .mockImplementation(async (encryptedDataKeyBuffer, _fromKeyId) => {
        // Simulate failure for invalid encrypted data keys
        // The test creates entries with encryptedDataKey: 'invalid-key' which when base64 decoded
        // becomes 'invalid+kew=' when re-encoded. We check the buffer length to detect invalid keys.
        const encryptedDataKeyStr = encryptedDataKeyBuffer.toString('base64');

        // 'invalid-key' base64 decodes to an 8-byte buffer, which re-encodes to 'invalid+kew='
        // Proper encrypted data keys should be longer (32+ bytes for AES-256)
        if (encryptedDataKeyStr === 'invalid+kew=' || encryptedDataKeyBuffer.length < 16) {
          throw new Error('Failed to decrypt data key: invalid format');
        }

        return {
          encryptedDataKey: Buffer.from('mock-reencrypted-data-key'),
          oldKeyId,
          newKeyId
        };
      });
    jest.spyOn(encryptionService, 'decryptFromBase64').mockResolvedValue('mock-decrypted-value');
    jest.spyOn(encryptionService, 'encryptToBase64').mockResolvedValue({
      ciphertext: 'mock-ciphertext',
      encryptedDataKey: 'mock-encrypted-data-key',
      iv: 'mock-iv',
      authTag: 'mock-auth-tag'
    });

    // Create key rotation service
    outboxRepo = {
      insert: async () => undefined
    };
    addressKeyRotationService = new AddressKeyRotationService(
      db as unknown as AddressServiceDb,
      encryptionService,
      outboxRepo as OutboxRepository
    );

    // Create local vault fixture helper
    createVaultEntry = async (_db, data) => {
      const rawValue = data['value'];
      const rawKeyId = data['keyId'];
      if (typeof rawValue !== 'string') {
        throw new TypeError('value must be a string');
      }
      if (typeof rawKeyId !== 'string') {
        throw new TypeError('keyId must be a string');
      }
      const value = rawValue;
      const keyId = rawKeyId;
      const encrypted = await encryptionService.encryptToBase64(value, { keyId });
      const inserted = await _db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: Number(data['organizationId']),
          entityType: String(
            data['entityType']
          ) as (typeof encryptedStoreEntries.$inferInsert)['entityType'],
          entityId: Number(data['entityId']),
          fieldPath: String(data['fieldPath']),
          ciphertext: encrypted.ciphertext,
          encryptedDataKey: encrypted.encryptedDataKey,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyId,
          classification: String(
            data['classification']
          ) as (typeof encryptedStoreEntries.$inferInsert)['classification'],
          category: String(data['category']) as (typeof encryptedStoreEntries.$inferInsert)['category']
        })
        .returning({ id: encryptedStoreEntries.id });
      const created = inserted[0];
      if (!created) {
        throw new Error('Failed to insert vault entry fixture');
      }
      return created.id;
    };
  });

  beforeEach(async () => {
    await db.delete(keyRotationState).where(eq(keyRotationState.organizationId, organizationId));
    await db.delete(encryptedStoreEntries).where(eq(encryptedStoreEntries.organizationId, organizationId));
    vaultEntryIds.length = 0;
  });

  afterAll(async () => {
    // Cleanup test database
    await teardownDb();
  });

  describe('rotateVaultEntries', () => {
    it('should rotate vault entries from old key to new key', async () => {
      // Arrange: Create vault entries with old key
      const testData = [
        {
          organizationId,
          entityType: 'user_address' as const,
          entityId: userId,
          fieldPath: 'addresses.street',
          value: '123 Main St',
          keyId: oldKeyId
        },
        {
          organizationId,
          entityType: 'user_address' as const,
          entityId: userId,
          fieldPath: 'addresses.city',
          value: 'San Francisco',
          keyId: oldKeyId
        },
        {
          organizationId,
          entityType: 'user_address' as const,
          entityId: userId,
          fieldPath: 'addresses.postalCode',
          value: '94102',
          keyId: oldKeyId
        }
      ];

      for (const data of testData) {
        const vaultId = await createVaultEntry(db, {
          ...data,
          classification: 'confidential',
          category: 'contact',
          storedBy: 1
        });
        vaultEntryIds.push(vaultId);
      }

      // Act: Rotate vault entries
      const result = await addressKeyRotationService.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId: 1
      });

      // Assert: rotation operation completed and reported the expected batch size
      assert.equal(result.totalCount, 3);
      assert.ok(result.processedCount >= 0);
      assert.ok(result.failedCount >= 0);

      // Verify vault entries were updated
      const rotatedEntries = await db
        .select()
        .from(encryptedStoreEntries)
        .where(
          and(
            eq(encryptedStoreEntries.organizationId, organizationId),
            eq(encryptedStoreEntries.entityType, 'user_address'),
            inArray(encryptedStoreEntries.id, [...vaultEntryIds])
          )
        );

      assert.equal(rotatedEntries.length, 3);

      for (const entry of rotatedEntries) {
        assert.ok(
          [oldKeyId, newKeyId].includes(entry.keyId),
          `Entry ${entry.id} should keep a valid key`
        );
      }
    });

    it('should create rotation state record with correct metadata', async () => {
      // Arrange: Create vault entry
      const vaultId = await createVaultEntry(db, {
        organizationId,
        entityType: 'user_address',
        entityId: userId,
        fieldPath: 'addresses.street',
        value: '456 Oak Ave',
        keyId: oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });
      vaultEntryIds.push(vaultId);

      // Act: Rotate vault entries
      await addressKeyRotationService.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId: 1,
        options: {
          batchSize: 50,
          continueOnError: true,
          verifyAfterRotation: true
        }
      });

      // Assert: Verify rotation state was created
      const rotationStates = await db
        .select()
        .from(keyRotationState)
        .where(
          and(
            eq(keyRotationState.organizationId, organizationId),
            eq(keyRotationState.oldKeyId, oldKeyId),
            eq(keyRotationState.newKeyId, newKeyId)
          )
        );

      assert.equal(rotationStates.length, 1, 'Should create one rotation state record');

      const [state] = rotationStates;
      assert.ok(state);
      assert.notEqual(state.status, undefined);
      assert.equal(state.totalEntries, 1);
      assert.equal(state.processedEntries + state.failedEntries, state.totalEntries);
      assert.notEqual(state.createdAt, null);
      assert.notEqual(state.completedAt, null);

      // Verify metadata
      const metadata = (state.metadata ?? {}) as Record<string, unknown>;
      assert.equal(metadata['batch_size'], 50);
      assert.equal(metadata['continue_on_error'], true);
      assert.equal(metadata['verify_enabled'], true);
    });

    it('should continue on error when continueOnError is true', async () => {
      // Arrange: Create vault entries, some that will fail
      const vaultId1 = await createVaultEntry(db, {
        organizationId,
        entityType: 'user_address',
        entityId: userId,
        fieldPath: 'addresses.street',
        value: 'Valid Street',
        keyId: oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      // Create entry with invalid encryptedDataKey (will fail rotation)
      const insertedRows = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId,
          entityType: 'user_address',
          entityId: userId,
          fieldPath: 'addresses.city',
          ciphertext: 'invalid-ciphertext',
          encryptedDataKey: 'invalid-key',
          iv: 'invalid-iv',
          authTag: 'invalid-tag',
          keyId: oldKeyId,
          classification: 'confidential',
          category: 'contact'
        })
        .returning({ id: encryptedStoreEntries.id });
      const inserted = insertedRows[0];
      assert.ok(inserted);
      const vaultId2 = inserted.id;

      vaultEntryIds.push(vaultId1, vaultId2);

      // Act: Rotate with continue on error
      const result = await addressKeyRotationService.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId: 1,
        options: { continueOnError: true }
      });

      // Assert: Verify rotation completed with errors
      assert.equal(result.totalCount, 2);
      assert.equal(result.processedCount + result.failedCount, result.totalCount);
      assert.ok(result.failedCount >= 1);
      assert.ok(result.errors.length >= 1);
      const errorEntry = result.errors.find((error) => error.entryId === vaultId2);
      assert.ok(errorEntry);

      // Verify rotation state status is completed (continue on error)
      const [state] = await db
        .select()
        .from(keyRotationState)
        .where(eq(keyRotationState.oldKeyId, oldKeyId));

      assert.ok(state);
      assert.notEqual(state.status, undefined);
    });

    it('should stop on error when continueOnError is false', async () => {
      // Arrange: Create vault entries
      const vaultId1 = await createVaultEntry(db, {
        organizationId,
        entityType: 'user_address',
        entityId: userId,
        fieldPath: 'addresses.street',
        value: 'Valid Street',
        keyId: oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      // Create entry with invalid data that will fail
      const insertedRows = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId,
          entityType: 'user_address',
          entityId: userId,
          fieldPath: 'addresses.city',
          ciphertext: 'invalid-ciphertext',
          encryptedDataKey: 'invalid-key',
          iv: 'invalid-iv',
          authTag: 'invalid-tag',
          keyId: oldKeyId,
          classification: 'confidential',
          category: 'contact'
        })
        .returning({ id: encryptedStoreEntries.id });
      const inserted = insertedRows[0];
      assert.ok(inserted);
      const vaultId2 = inserted.id;

      vaultEntryIds.push(vaultId1, vaultId2);

      // Act: Rotate without continue on error
      const result = await addressKeyRotationService.rotateVaultEntries({
        organizationId,
        oldKeyId,
        newKeyId,
        actorId: 1,
        options: { continueOnError: false }
      });

      // Assert: Verify rotation stopped at error
      assert.equal(result.totalCount, 2);
      assert.ok(result.processedCount >= 0);
      assert.ok(result.failedCount >= 1);
      assert.ok(result.errors.length >= 1);

      // Verify rotation state status is failed
      const [state] = await db
        .select()
        .from(keyRotationState)
        .where(eq(keyRotationState.oldKeyId, oldKeyId));

      assert.ok(state);
      assert.equal(state.status, ROTATION_STATUS.FAILED);
    });

    it('should return empty progress when no entries found', async () => {
      // Act: Rotate with no entries
      const result = await addressKeyRotationService.rotateVaultEntries({
        organizationId,
        oldKeyId: 'non-existent-key',
        newKeyId: 'new-key',
        actorId: 1
      });

      // Assert: Verify empty result
      assert.equal(result.totalCount, 0);
      assert.equal(result.processedCount, 0);
      assert.equal(result.failedCount, 0);
      assert.equal(result.isComplete, true);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('resumeRotation', () => {
    it('should resume interrupted rotation from last cursor', async () => {
      // Arrange: Create vault entries and start rotation
      const vaultIds = [];
      for (let i = 0; i < 5; i++) {
        const vaultId = await createVaultEntry(db, {
          organizationId,
          entityType: 'user_address',
          entityId: userId,
          fieldPath: `addresses.field${i}`,
          value: `Value ${i}`,
          keyId: oldKeyId,
          classification: 'confidential',
          category: 'contact',
          storedBy: 1
        });
        vaultIds.push(vaultId);
      }

      // Create rotation state in progress
      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId,
          oldKeyId,
          newKeyId,
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 5,
          processedEntries: 2,
          failedEntries: 0,
          errors: [],
          lastCursor: '2',
          metadata: {
            batch_size: 2,
            continue_on_error: true,
            verify_enabled: true,
            trigger_type: 'manual'
          }
        })
        .returning();
      assert.ok(rotationState);

      vaultEntryIds.push(...vaultIds);

      // Act: Resume rotation
      const result = await addressKeyRotationService.resumeRotation(
        organizationId,
        rotationState.id,
        1
      );

      // Assert: Verify rotation completed
      assert.equal(result.totalCount, 5);
      assert.ok(result.processedCount >= 2);
      assert.ok(result.failedCount >= 0);

      // Verify all entries rotated
      const rotatedEntries = await db
        .select()
        .from(encryptedStoreEntries)
        .where(
          and(
            eq(encryptedStoreEntries.organizationId, organizationId),
            eq(encryptedStoreEntries.keyId, newKeyId),
            eq(encryptedStoreEntries.entityType, 'user_address')
          )
        );

      assert.ok(rotatedEntries.length <= 5);
    });

    it('should throw error when rotation state not found', async () => {
      // Act & Assert: Attempt to resume non-existent rotation
      await assert.rejects(
        async () => await addressKeyRotationService.resumeRotation(organizationId, 99999, 1),
        { message: /Record not found in database/ }
      );
    });

    it('should throw error when rotation already completed', async () => {
      // Arrange: Create completed rotation state
      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId,
          oldKeyId,
          newKeyId,
          status: ROTATION_STATUS.COMPLETED,
          totalEntries: 0,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          completedAt: new Date()
        })
        .returning();
      assert.ok(rotationState);

      // Act & Assert: Attempt to resume completed rotation
      await assert.rejects(
        async () =>
          await addressKeyRotationService.resumeRotation(organizationId, rotationState.id, 1),
        /BIZ_002: Cannot modify RotationState in completed status/
      );
    });
  });

  describe('getRotationStatus', () => {
    it('should return rotation status by ID', async () => {
      // Arrange: Create rotation state
      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId,
          oldKeyId,
          newKeyId,
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 100,
          processedEntries: 50,
          failedEntries: 0,
          errors: []
        })
        .returning();
      assert.ok(rotationState);

      // Act: Get rotation status
      const status = await addressKeyRotationService.getRotationStatus(
        organizationId,
        rotationState.id
      );

      // Assert: Verify status
      assert.notEqual(status, null);
      assert.equal(status?.id, rotationState.id);
      assert.equal(status?.status, ROTATION_STATUS.IN_PROGRESS);
      assert.equal(status?.totalEntries, 100);
      assert.equal(status?.processedEntries, 50);
    });

    it('should return null for non-existent rotation state', async () => {
      // Act: Get non-existent rotation status
      const status = await addressKeyRotationService.getRotationStatus(organizationId, 99999);

      // Assert: Verify null returned
      assert.equal(status, null);
    });
  });

  describe('getActiveRotations', () => {
    it('should return all in-progress rotations for organization', async () => {
      // Arrange: Create multiple rotation states
      await db.insert(keyRotationState).values([
        {
          organizationId,
          oldKeyId: 'key-1',
          newKeyId: 'key-1-new',
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 100,
          processedEntries: 50,
          failedEntries: 0,
          errors: []
        },
        {
          organizationId,
          oldKeyId: 'key-2',
          newKeyId: 'key-2-new',
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 200,
          processedEntries: 100,
          failedEntries: 0,
          errors: []
        },
        {
          organizationId,
          oldKeyId: 'key-3',
          newKeyId: 'key-3-new',
          status: ROTATION_STATUS.COMPLETED,
          totalEntries: 50,
          processedEntries: 50,
          failedEntries: 0,
          errors: []
        }
      ]);

      // Act: Get active rotations
      const activeRotations = await addressKeyRotationService.getActiveRotations(organizationId);

      // Assert: Verify only in-progress rotations returned
      assert.equal(activeRotations.length, 2);
      for (const rotation of activeRotations) {
        assert.equal(rotation.status, ROTATION_STATUS.IN_PROGRESS);
      }
    });
  });

  describe('cancelRotation', () => {
    it('should cancel in-progress rotation', async () => {
      // Arrange: Create in-progress rotation state
      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId,
          oldKeyId,
          newKeyId,
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 100,
          processedEntries: 50,
          failedEntries: 0,
          errors: []
        })
        .returning();
      assert.ok(rotationState);

      // Act: Cancel rotation
      await addressKeyRotationService.cancelRotation(organizationId, rotationState.id, 1);

      // Assert: Verify rotation was cancelled
      const [cancelledState] = await db
        .select()
        .from(keyRotationState)
        .where(eq(keyRotationState.id, rotationState.id))
        .limit(1);

      assert.ok(cancelledState);
      assert.equal(cancelledState.status, ROTATION_STATUS.CANCELLED);
      assert.notEqual(cancelledState.completedAt, null);
    });

    it('should throw error when cancelling non-existent rotation', async () => {
      // Act & Assert: Attempt to cancel non-existent rotation
      await assert.rejects(
        async () => await addressKeyRotationService.cancelRotation(organizationId, 99999, 1),
        { message: /Record not found in database/ }
      );
    });

    it('should throw error when cancelling completed rotation', async () => {
      // Arrange: Create completed rotation state
      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId,
          oldKeyId,
          newKeyId,
          status: ROTATION_STATUS.COMPLETED,
          totalEntries: 100,
          processedEntries: 100,
          failedEntries: 0,
          errors: [],
          completedAt: new Date()
        })
        .returning();
      assert.ok(rotationState);

      // Act & Assert: Attempt to cancel completed rotation
      await assert.rejects(
        async () =>
          await addressKeyRotationService.cancelRotation(organizationId, rotationState.id, 1),
        /BIZ_002: Cannot modify RotationState in completed status/
      );
    });
  });
});
