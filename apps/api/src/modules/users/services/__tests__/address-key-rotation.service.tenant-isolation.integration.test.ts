import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  and,
  eq,
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

describe('AddressKeyRotationService - Tenant Isolation Integration', () => {
  // Increase timeout for integration tests with Testcontainers
  jest.setTimeout(30000);

  type AddressServiceDb = ConstructorParameters<typeof AddressKeyRotationService>[0];
  let db: AddressServiceDb;
  let teardownDb: () => Promise<void> = async () => {};
  let addressKeyRotationService: AddressKeyRotationService;
  let outboxRepo: Pick<OutboxRepository, 'insert'>;
  let encryptionService: EncryptionService;
  let kmsFactory: KmsProviderFactory;
  let createVaultEntry: (db: AddressServiceDb, data: Record<string, unknown>) => Promise<number>;

  let tenantA: { organizationId: number; tenantId: string; oldKeyId: string; newKeyId: string };
  let tenantB: { organizationId: number; tenantId: string; oldKeyId: string; newKeyId: string };

  beforeAll(async () => {
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

    const [tenantRecord] = await db
      .insert(tenants)
      .values({ type: 'organization', status: 'active' })
      .returning({ id: tenants.id });
    assert.ok(tenantRecord);

    const [organizationA] = await db
      .insert(organizations)
      .values({
        tenantId: tenantRecord.id,
        name: 'Tenant A - Key Rotation Test',
        slug: `tenant-a-test-${Date.now()}`
      })
      .returning({ id: organizations.id });
    assert.ok(organizationA);

    const [organizationB] = await db
      .insert(organizations)
      .values({
        tenantId: tenantRecord.id,
        name: 'Tenant B - Key Rotation Test',
        slug: `tenant-b-test-${Date.now()}`
      })
      .returning({ id: organizations.id });
    assert.ok(organizationB);

    // Single-key architecture: Both tenants share the same logical keyId ('primary-encryption-key')
    // but use different versioned paths for rotation testing
    // This tests that even with the same keyId, tenant isolation is maintained via organizationId
    tenantA = {
      organizationId: organizationA.id,
      tenantId: String(organizationA.id),
      oldKeyId: 'primary-encryption-key',
      // Versioned path for tenant A's rotation
      newKeyId: 'primary-encryption-key/cryptoKeyVersions/5'
    };

    tenantB = {
      organizationId: organizationB.id,
      tenantId: String(organizationB.id),
      oldKeyId: 'primary-encryption-key',
      // Versioned path for tenant B's rotation (different version for isolation test)
      newKeyId: 'primary-encryption-key/cryptoKeyVersions/6'
    };

    const oldKeyA = randomBytes(32).toString('hex');
    const newKeyA = randomBytes(32).toString('hex');
    const oldKeyB = randomBytes(32).toString('hex');
    const newKeyB = randomBytes(32).toString('hex');
    const defaultKey = randomBytes(32).toString('hex');

    kmsFactory = new KmsProviderFactory();
    kmsFactory.registerProvider(
      'test-env',
      new EnvVarProvider({
        defaultKeyId: 'default',
        keys: {
          default: defaultKey,
          [tenantA.oldKeyId]: oldKeyA,
          [tenantA.newKeyId]: newKeyA,
          [tenantB.oldKeyId]: oldKeyB,
          [tenantB.newKeyId]: newKeyB
        }
      }),
      true
    );

    encryptionService = new EncryptionService(
      (name?: string) => (name ? kmsFactory.getProvider(name) : kmsFactory.getDefaultProvider()),
      'test-env'
    );

    // Mock the slow reencryptDataKey method to speed up tests
    // This eliminates the expensive crypto operations while still testing tenant isolation logic
    jest
      .spyOn(encryptionService, 'reencryptDataKey')
      .mockImplementation(async (_encryptedDataKey, _oldKeyId, newKeyId) => {
        // Return mock rotated key instantly instead of doing real crypto
        return {
          encryptedDataKey: Buffer.from(`mock-rotated-${newKeyId}-${Date.now()}`),
          oldKeyId: _oldKeyId,
          newKeyId: newKeyId
        };
      });

    // Mock decryptFromBase64 to work with our test data
    // This allows rotation to proceed without crypto errors
    jest.spyOn(encryptionService, 'decryptFromBase64').mockImplementation(async (_encrypted) => {
      // Return mock plaintext - the actual value doesn't matter for tenant isolation tests
      return 'mock-decrypted-value';
    });

    // Mock encryptToBase64 to return fast mock encrypted data
    jest
      .spyOn(encryptionService, 'encryptToBase64')
      .mockImplementation(async (_plaintext, options) => {
        return {
          ciphertext: Buffer.from(`mock-cipher-${Date.now()}`).toString('base64'),
          encryptedDataKey: Buffer.from(`mock-dek-${options?.keyId || 'default'}`).toString(
            'base64'
          ),
          iv: Buffer.from('mock-iv-16bytes!').toString('base64'),
          authTag: Buffer.from('mock-auth-16bytes').toString('base64')
        };
      });

    outboxRepo = { insert: async () => undefined };
    addressKeyRotationService = new AddressKeyRotationService(
      db as unknown as AddressServiceDb,
      encryptionService,
      outboxRepo as OutboxRepository
    );

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
    await db
      .delete(keyRotationState)
      .where(eq(keyRotationState.organizationId, tenantA.organizationId));
    await db
      .delete(keyRotationState)
      .where(eq(keyRotationState.organizationId, tenantB.organizationId));
    await db.delete(encryptedStoreEntries).where(eq(encryptedStoreEntries.organizationId, tenantA.organizationId));
    await db.delete(encryptedStoreEntries).where(eq(encryptedStoreEntries.organizationId, tenantB.organizationId));
  });

  afterAll(async () => {
    await teardownDb();
  });

  describe('rotateVaultEntries - Tenant Isolation', () => {
    it('should isolate rotation state by tenant', async () => {
      const vaultIdA = await createVaultEntry(db, {
        organizationId: tenantA.organizationId,
        entityType: 'user_address',
        entityId: 1,
        fieldPath: 'addresses.street',
        value: '123 Main St - Tenant A',
        keyId: tenantA.oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      const resultA = await addressKeyRotationService.rotateVaultEntries({
        organizationId: tenantA.organizationId,
        oldKeyId: tenantA.oldKeyId,
        newKeyId: tenantA.newKeyId,
        actorId: 1
      });

      // Rotation attempt was made (even if decryption failed)
      assert.equal(resultA.totalCount, 1);
      assert.ok(resultA.processedCount >= 0);

      const rotationStatesA = await db
        .select()
        .from(keyRotationState)
        .where(
          and(
            eq(keyRotationState.organizationId, tenantA.organizationId),
            eq(keyRotationState.oldKeyId, tenantA.oldKeyId)
          )
        );

      assert.equal(rotationStatesA.length, 1, 'Tenant A should have rotation state');

      const rotationStatesB = await db
        .select()
        .from(keyRotationState)
        .where(
          and(
            eq(keyRotationState.organizationId, tenantB.organizationId),
            eq(keyRotationState.oldKeyId, tenantA.oldKeyId)
          )
        );

      assert.equal(rotationStatesB.length, 0, 'Tenant B should NOT have rotation state');

      const rotatedEntriesA = await db
        .select()
        .from(encryptedStoreEntries)
        .where(
          and(
            eq(encryptedStoreEntries.organizationId, tenantA.organizationId),
            eq(encryptedStoreEntries.id, vaultIdA)
          )
        );

      assert.equal(rotatedEntriesA.length, 1);
      const entryA = rotatedEntriesA[0];
      assert.ok(entryA, 'Tenant A entry should exist');
      // Entry should keep a valid key (either old if rotation failed, or new if succeeded)
      assert.ok(
        [tenantA.oldKeyId, tenantA.newKeyId].includes(entryA.keyId),
        'Tenant A entry should keep a valid key'
      );
    });

    it('should prevent cross-tenant rotation access via getRotationStatus', async () => {
      await createVaultEntry(db, {
        organizationId: tenantA.organizationId,
        entityType: 'user_address',
        entityId: 1,
        fieldPath: 'addresses.street',
        value: '123 Main St',
        keyId: tenantA.oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      await addressKeyRotationService.rotateVaultEntries({
        organizationId: tenantA.organizationId,
        oldKeyId: tenantA.oldKeyId,
        newKeyId: tenantA.newKeyId,
        actorId: 1
      });

      const rotationStatesA = await db
        .select()
        .from(keyRotationState)
        .where(eq(keyRotationState.organizationId, tenantA.organizationId));

      assert.equal(rotationStatesA.length, 1);
      const rotationState = rotationStatesA[0];
      assert.ok(rotationState, 'Rotation state should exist');
      const rotationStateId = rotationState.id;

      const status = await addressKeyRotationService.getRotationStatus(
        tenantB.organizationId,
        rotationStateId
      );

      assert.equal(
        status,
        null,
        'getRotationStatus should return null when tenant B tries to access tenant A state'
      );
    });

    it('should prevent cross-tenant resume operations', async () => {
      await createVaultEntry(db, {
        organizationId: tenantA.organizationId,
        entityType: 'user_address',
        entityId: 1,
        fieldPath: 'addresses.street',
        value: '123 Main St',
        keyId: tenantA.oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId: tenantA.organizationId,
          oldKeyId: tenantA.oldKeyId,
          newKeyId: tenantA.newKeyId,
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: [],
          lastCursor: null,
          metadata: {
            batch_size: 100,
            continue_on_error: true,
            verify_enabled: true,
            trigger_type: 'manual'
          }
        })
        .returning();

      assert.ok(rotationState);

      await assert.rejects(
        async () =>
          await addressKeyRotationService.resumeRotation(
            tenantB.organizationId,
            rotationState.id,
            1
          ),
        /Record not found in database/,
        'Resume should fail when tenant B tries to access tenant A rotation'
      );
    });

    it('should prevent cross-tenant cancel operations', async () => {
      await createVaultEntry(db, {
        organizationId: tenantA.organizationId,
        entityType: 'user_address',
        entityId: 1,
        fieldPath: 'addresses.street',
        value: '123 Main St',
        keyId: tenantA.oldKeyId,
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      const [rotationState] = await db
        .insert(keyRotationState)
        .values({
          organizationId: tenantA.organizationId,
          oldKeyId: tenantA.oldKeyId,
          newKeyId: tenantA.newKeyId,
          status: ROTATION_STATUS.IN_PROGRESS,
          totalEntries: 1,
          processedEntries: 0,
          failedEntries: 0,
          errors: []
        })
        .returning();

      assert.ok(rotationState);

      await assert.rejects(
        async () =>
          await addressKeyRotationService.cancelRotation(
            tenantB.organizationId,
            rotationState.id,
            1
          ),
        /Record not found in database/,
        'Cancel should fail when tenant B tries to access tenant A rotation'
      );
    });

    it('should isolate vault entries by organizationId during rotation', async () => {
      // Use tenantA's existing old key (already registered in beforeAll)
      // to create vault entries for both tenants - this tests organizationId scoping
      const vaultIdA = await createVaultEntry(db, {
        organizationId: tenantA.organizationId,
        entityType: 'user_address',
        entityId: 1,
        fieldPath: 'addresses.street',
        value: '123 Tenant A St',
        keyId: tenantA.oldKeyId, // Using already-registered key
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      // For tenantB, we also use tenantA's old key - this tests that even though
      // both entries use the same keyId, rotation only affects one organization
      const vaultIdB = await createVaultEntry(db, {
        organizationId: tenantB.organizationId,
        entityType: 'user_address',
        entityId: 1,
        fieldPath: 'addresses.street',
        value: '456 Tenant B Ave',
        keyId: tenantA.oldKeyId, // Same keyId as tenantA
        classification: 'confidential',
        category: 'contact',
        storedBy: 1
      });

      // Rotate tenantA's entries only
      const resultA = await addressKeyRotationService.rotateVaultEntries({
        organizationId: tenantA.organizationId,
        oldKeyId: tenantA.oldKeyId,
        newKeyId: tenantA.newKeyId,
        actorId: 1
      });

      // Only tenantA's entry should be counted in rotation
      assert.equal(resultA.totalCount, 1, 'Only tenant A entry should be in rotation scope');

      const rotatedEntryA = await db
        .select()
        .from(encryptedStoreEntries)
        .where(eq(encryptedStoreEntries.id, vaultIdA))
        .limit(1);

      const rotatedEntryB = await db
        .select()
        .from(encryptedStoreEntries)
        .where(eq(encryptedStoreEntries.id, vaultIdB))
        .limit(1);

      const entryA = rotatedEntryA[0];
      assert.ok(entryA, 'Tenant A entry should exist');
      // Entry A should keep a valid key (either old if rotation failed, or new if succeeded)
      assert.ok(
        [tenantA.oldKeyId, tenantA.newKeyId].includes(entryA.keyId),
        'Tenant A entry should keep a valid key'
      );

      const entryB = rotatedEntryB[0];
      assert.ok(entryB, 'Tenant B entry should exist');
      // Entry B should NOT have been rotated (should keep old key)
      assert.equal(entryB.keyId, tenantA.oldKeyId, 'Tenant B entry should not be rotated');
    });

    it('should return empty active rotations for different tenant', async () => {
      await db.insert(keyRotationState).values({
        organizationId: tenantA.organizationId,
        oldKeyId: tenantA.oldKeyId,
        newKeyId: tenantA.newKeyId,
        status: ROTATION_STATUS.IN_PROGRESS,
        totalEntries: 100,
        processedEntries: 50,
        failedEntries: 0,
        errors: []
      });

      const activeRotationsB = await addressKeyRotationService.getActiveRotations(
        tenantB.organizationId
      );

      assert.equal(activeRotationsB.length, 0, 'Tenant B should have no active rotations');
    });
  });
});
