import { Inject, Injectable } from '@nestjs/common';
import { AccessLogAction, and, eq, sql, type NodePgDatabase, encryptedStoreEntries } from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

type EncryptedStoreEntry = typeof encryptedStoreEntries.$inferSelect;
type NewEncryptedStoreEntry = typeof encryptedStoreEntries.$inferInsert;

/**
 * Vault entry repository
 *
 * Handles data access for vault_entries table with tenant scoping.
 * Extends BaseRepository with number-based tenant IDs (serial/bigint).
 *
 * Vault entries store encrypted PII using envelope encryption format.
 * Each entry includes ciphertext, encrypted data key, IV, auth tag, and KMS key ID.
 *
 * Multi-tenancy: All queries are scoped to organization_id (tenant).
 */
@Injectable()
export class EncryptedStoreEntryRepository extends BaseRepository<
  EncryptedStoreEntry,
  Omit<NewEncryptedStoreEntry, 'id' | 'createdAt' | 'updatedAt'>,
  Partial<Omit<NewEncryptedStoreEntry, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  /**
   * Get the vault_entries table
   */
  protected override getTable(): typeof encryptedStoreEntries {
    return encryptedStoreEntries;
  }

  /**
   * Get the ID column for queries
   */
  protected override getIdColumn(): typeof encryptedStoreEntries.id {
    return encryptedStoreEntries.id;
  }

  /**
   * Get the tenant column for scoping (organization_id)
   */
  protected override getTenantColumn(): typeof encryptedStoreEntries.organizationId {
    return encryptedStoreEntries.organizationId;
  }

  /**
   * Get the entity name for error messages
   */
  protected override getEntityName(): string {
    return 'EncryptedStoreEntry';
  }

  /**
   * Find vault entry by entity and field path
   *
   * This is the primary lookup method for retrieving encrypted PII from the vault.
   * Uses composite index (organization_id, entity_type, entity_id, field_path) for efficient queries.
   *
   * @param tenantId - Tenant ID (organization ID)
   * @param entityType - Entity type (e.g., 'user', 'organization')
   * @param entityId - Entity ID (e.g., user.id)
   * @param fieldPath - Field path within entity (e.g., 'profile.ssn')
   * @returns Vault entry or null if not found
   */
  async findByEntityAndField(
    tenantId: number,
    entityType: string,
    entityId: number,
    fieldPath: string
  ): Promise<EncryptedStoreEntry | null> {
    const [entry] = await this.db
      .select()
      .from(encryptedStoreEntries)
      .where(
        and(
          eq(encryptedStoreEntries.organizationId, tenantId),
          eq(
            encryptedStoreEntries.entityType,
            entityType as 'user' | 'organization' | 'payment_method' | 'document' | 'custom'
          ),
          eq(encryptedStoreEntries.entityId, entityId),
          eq(encryptedStoreEntries.fieldPath, fieldPath)
        )
      )
      .limit(1);

    return entry ?? null;
  }

  /**
   * Find all vault entries for a tenant
   *
   * Used for key rotation, tenant cleanup, and audit reports.
   *
   * @param tenantId - Tenant ID (organization ID)
   * @returns Array of vault entries for the tenant
   */
  async findByTenant(tenantId: number): Promise<EncryptedStoreEntry[]> {
    return this.db.select().from(encryptedStoreEntries).where(eq(encryptedStoreEntries.organizationId, tenantId));
  }

  /**
   * Find vault entries by classification level
   *
   * Used for compliance reports and security audits.
   *
   * @param tenantId - Tenant ID (organization ID)
   * @param classification - Classification level (public, internal, confidential, restricted)
   * @returns Array of vault entries with specified classification
   */
  async findByClassification(tenantId: number, classification: string): Promise<EncryptedStoreEntry[]> {
    return this.db
      .select()
      .from(encryptedStoreEntries)
      .where(
        and(
          eq(encryptedStoreEntries.organizationId, tenantId),
          eq(
            encryptedStoreEntries.classification,
            classification as 'public' | 'internal' | 'confidential' | 'restricted'
          )
        )
      );
  }

  /**
   * Count vault entries for a tenant
   *
   * Used for metrics, billing, and monitoring.
   *
   * @param tenantId - Tenant ID (organization ID)
   * @returns Count of vault entries for the tenant
   */
  async countByTenant(tenantId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(encryptedStoreEntries)
      .where(eq(encryptedStoreEntries.organizationId, tenantId));

    return result?.count ?? 0;
  }

  /**
   * Create vault entry within a transaction
   *
   * Used for atomic operations with outbox event publishing.
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID)
   * @param data - Vault entry data to insert
   * @returns Created vault entry
   */
  async createWithTransaction(
    tenantId: number,
    tx: NodePgDatabase,
    data: Omit<NewEncryptedStoreEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<EncryptedStoreEntry> {
    const [entry] = await tx
      .insert(encryptedStoreEntries)
      .values({ ...data, organizationId: tenantId })
      .returning();

    if (!entry) {
      throw new Error('Failed to create vault entry');
    }

    return entry;
  }

  /**
   * Update access log within a transaction
   *
   * Appends new access log entry atomically.
   *
   * For JSONB arrays, we use the || operator to concatenate arrays.
   * If access_log is null, we initialize it as a new array.
   *
   * @param tx - Database transaction
   * @param entryId - Vault entry ID
   * @param accessLogEntry - New access log entry to append
   */
  async updateAccessLogWithTransaction(
    tx: NodePgDatabase,
    entryId: number,
    accessLogEntry: {
      timestamp: string; // ISO string format to match schema
      accessedBy: number;
      action: AccessLogAction;
      ipAddress?: string;
    }
  ): Promise<void> {
    // Use COALESCE to handle NULL access_log (initial case)
    // Use || operator to append JSONB entry to the array
    await tx
      .update(encryptedStoreEntries)
      .set({
        accessLog: sql`COALESCE(${encryptedStoreEntries.accessLog}, '[]'::jsonb) || ${JSON.stringify(accessLogEntry)}::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(encryptedStoreEntries.id, entryId));
  }

  /**
   * Update encryption data during key rotation
   *
   * Updates ciphertext, encryptedDataKey, iv, authTag, keyId atomically.
   *
   * @param tx - Database transaction
   * @param entryId - Vault entry ID
   * @param encryptionData - New encryption data
   */
  async updateEncryptionWithTransaction(
    tx: NodePgDatabase,
    entryId: number,
    encryptionData: {
      ciphertext: string;
      encryptedDataKey: string;
      iv: string;
      authTag: string;
      keyId: string;
    }
  ): Promise<void> {
    await tx
      .update(encryptedStoreEntries)
      .set({
        ...encryptionData,
        rotatedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(encryptedStoreEntries.id, entryId));
  }
}
