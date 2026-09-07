import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  isNull,
  sql,
  type NewUserAddress,
  type NodePgDatabase,
  type UpdateUserAddress,
  type UserAddress,
  userAddresses
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';
import { EncryptedStoreService } from '../../../modules/encrypted-store/encrypted-store.service';

/**
 * Address components stored in vault
 */
interface AddressComponents {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Vault field mappings for address components
 */
const VAULT_FIELD_MAPPING = {
  street: 'streetEncryptedStoreId',
  street2: 'street2EncryptedStoreId',
  city: 'cityEncryptedStoreId',
  state: 'stateEncryptedStoreId',
  postalCode: 'postalCodeEncryptedStoreId',
  country: 'countryEncryptedStoreId'
} as const satisfies Record<keyof AddressComponents, keyof UserAddress>;

/**
 * Entity type for user addresses in vault
 */
const VAULT_ENTITY_TYPE = 'user_address';

/**
 * Vault entry ID for address component (null = not stored in vault)
 */
type VaultEntryId = number | null;

/**
 * Decrypted address with PII values from vault
 */
export interface DecryptedUserAddress extends UserAddress {
  decrypted?: AddressComponents;
}

@Injectable()
export class UserAddressRepository extends BaseRepository<
  UserAddress,
  NewUserAddress,
  UpdateUserAddress,
  number
> {
  private readonly logger = new Logger(UserAddressRepository.name);

  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase,
    private readonly vault: EncryptedStoreService
  ) {
    super(db);
  }

  protected getTable(): typeof userAddresses {
    return userAddresses;
  }

  protected getIdColumn(): typeof userAddresses.id {
    return userAddresses.id;
  }

  protected getTenantColumn(): typeof userAddresses.organizationId {
    return userAddresses.organizationId;
  }

  protected getEntityName(): string {
    return 'UserAddress';
  }

  override async findById(tenantId: number, id: number): Promise<UserAddress | null> {
    const [address] = await this.db
      .select()
      .from(userAddresses)
      .where(
        and(
          eq(userAddresses.organizationId, tenantId),
          eq(userAddresses.id, id),
          isNull(userAddresses.deletedAt)
        )
      )
      .limit(1);

    return address ?? null;
  }

  async findByUser(tenantId: number, userId: number): Promise<UserAddress[]> {
    return this.db
      .select()
      .from(userAddresses)
      .where(
        and(
          eq(userAddresses.organizationId, tenantId),
          eq(userAddresses.userId, userId),
          isNull(userAddresses.deletedAt)
        )
      )
      .orderBy(desc(userAddresses.isDefault), desc(userAddresses.updatedAt));
  }

  async findDefaultByUser(tenantId: number, userId: number): Promise<UserAddress | null> {
    const [address] = await this.db
      .select()
      .from(userAddresses)
      .where(
        and(
          eq(userAddresses.organizationId, tenantId),
          eq(userAddresses.userId, userId),
          eq(userAddresses.isDefault, true),
          isNull(userAddresses.deletedAt)
        )
      )
      .limit(1);

    return address ?? null;
  }

  override async create(
    tenantId: number,
    data: Omit<NewUserAddress, 'organizationId'>
  ): Promise<UserAddress> {
    return this.createInDatabase(tenantId, this.db, data);
  }

  async createWithTransaction(
    tenantId: number,
    tx: NodePgDatabase,
    data: Omit<NewUserAddress, 'organizationId'>
  ): Promise<UserAddress> {
    return this.createInDatabase(tenantId, tx, data);
  }

  override async update(
    tenantId: number,
    id: number,
    data: UpdateUserAddress
  ): Promise<UserAddress> {
    return this.updateInDatabase(tenantId, this.db, id, data);
  }

  async updateWithTransaction(
    tenantId: number,
    tx: NodePgDatabase,
    id: number,
    data: UpdateUserAddress
  ): Promise<UserAddress> {
    return this.updateInDatabase(tenantId, tx, id, data);
  }

  override async delete(tenantId: number, id: number): Promise<void> {
    await this.softDelete(tenantId, id);
  }

  async softDelete(tenantId: number, id: number, tx?: NodePgDatabase): Promise<void> {
    const database = tx ?? this.db;

    await database
      .update(userAddresses)
      .set({
        deletedAt: new Date(),
        isDefault: false,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(userAddresses.organizationId, tenantId),
          eq(userAddresses.id, id),
          isNull(userAddresses.deletedAt)
        )
      );
  }

  async setDefault(
    tenantId: number,
    userId: number,
    addressId: number,
    tx?: NodePgDatabase
  ): Promise<UserAddress> {
    if (tx) {
      return this.setDefaultInDatabase(tenantId, tx, userId, addressId);
    }

    return this.db.transaction(async (transaction) =>
      this.setDefaultInDatabase(tenantId, transaction, userId, addressId)
    );
  }

  private async createInDatabase(
    tenantId: number,
    db: NodePgDatabase,
    data: Omit<NewUserAddress, 'organizationId'>
  ): Promise<UserAddress> {
    const [address] = await db
      .insert(userAddresses)
      .values({
        ...data,
        organizationId: tenantId
      })
      .returning();

    if (!address) {
      throw Errors.databasedatabaseQueryFailed005({
        query: 'create user address'
      });
    }

    return address;
  }

  private async updateInDatabase(
    tenantId: number,
    db: NodePgDatabase,
    id: number,
    data: UpdateUserAddress
  ): Promise<UserAddress> {
    const [address] = await db
      .update(userAddresses)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(userAddresses.organizationId, tenantId),
          eq(userAddresses.id, id),
          isNull(userAddresses.deletedAt)
        )
      )
      .returning();

    if (!address) {
      throw Errors.databaserecordNotFound004({
        entity: 'UserAddress'
      });
    }

    return address;
  }

  private async setDefaultInDatabase(
    tenantId: number,
    db: NodePgDatabase,
    userId: number,
    addressId: number
  ): Promise<UserAddress> {
    const result = await db.execute<UserAddress>(sql`
      WITH updated AS (
        UPDATE user_addresses
        SET
          is_default = CASE WHEN id = ${addressId} THEN true ELSE false END,
          updated_at = NOW()
        WHERE organization_id = ${tenantId}
          AND user_id = ${userId}
          AND deleted_at IS NULL
        RETURNING *
      )
      SELECT
        id,
        organization_id AS "organizationId",
        user_id AS "userId",
        address_type AS "addressType",
        label,
        street_vault_id AS "streetEncryptedStoreId",
        street2_vault_id AS "street2EncryptedStoreId",
        city_vault_id AS "cityEncryptedStoreId",
        state_vault_id AS "stateEncryptedStoreId",
        postal_code_vault_id AS "postalCodeEncryptedStoreId",
        country_vault_id AS "countryEncryptedStoreId",
        country_code AS "countryCode",
        is_default AS "isDefault",
        is_verified AS "isVerified",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM updated
      WHERE id = ${addressId}
    `);

    const [defaultAddress] = result.rows;

    if (!defaultAddress) {
      throw Errors.databasedatabaseQueryFailed005({
        query: 'set default user address'
      });
    }

    return defaultAddress;
  }

  // ============================================================================
  // VAULT LIFECYCLE METHODS
  // ============================================================================

  /**
   * Store address components in vault and create address with vault references.
   * Transactional operation that stores all PII in vault before creating address.
   *
   * BUG-002 fix: Entire operation is now wrapped in a transaction to ensure atomicity.
   * Vault entries, address creation, and vault entity ID updates all happen within
   * the same transaction. If any step fails, everything rolls back preventing orphaned
   * vault entries.
   *
   * @param tenantId - Tenant ID for vault scoping
   * @param userId - User ID for ownership
   * @param components - Address PII components to store in vault
   * @param actorId - ID of user performing the action (for audit logging)
   * @param tx - Optional transaction context
   * @returns Created user address with vault references
   */
  async createWithVault(
    tenantId: number,
    userId: number,
    components: AddressComponents,
    actorId: number,
    tx?: NodePgDatabase,
    metadata?: {
      addressType?: NewUserAddress['addressType'];
      label?: NewUserAddress['label'];
      countryCode?: NewUserAddress['countryCode'];
    }
  ): Promise<UserAddress> {
    this.logger.debug(`Creating vault-backed address for user ${userId} in tenant ${tenantId}`);

    // BUG-002 fix: If external transaction provided, use it directly; otherwise create new transaction
    const executeInTransaction = async (transaction: NodePgDatabase): Promise<UserAddress> => {
      // Step 1: Store all non-empty components in vault and collect vault entry IDs
      const vaultEntryIds: Record<string, VaultEntryId> = {};
      const nonEmptyComponents = Object.entries(components).filter(([_, value]) => {
        return typeof value === 'string' && value.trim().length > 0;
      }) as Array<[string, string]>;

      if (nonEmptyComponents.length === 0) {
        throw Errors.validationvalidationFailedField001({
          field: 'components'
        });
      }

      // BUG-002 fix: Store each component in vault WITHIN the transaction
      // Pass the transaction to vault.store() to ensure atomicity
      for (const [field, value] of nonEmptyComponents) {
        const fieldPath = `addresses.${field}`;
        // PERF-001 fix: Capture returned vault entry ID instead of separate SELECT query
        const vaultId = await this.vault.store({
          tenantId,
          entityType: VAULT_ENTITY_TYPE,
          entityId: userId, // Temporary entityId, will be updated to addressId
          fieldPath,
          value: value as string,
          storedBy: actorId,
          classification: 'confidential', // All address PII is Class-C
          tx: transaction // BUG-002 fix: Pass transaction for atomicity
        });

        vaultEntryIds[field] = vaultId;
      }

      // Step 2: Create address with vault references (within same transaction)
      const insertData: NewUserAddress = {
        organizationId: tenantId,
        userId,
        addressType: metadata?.addressType ?? 'primary',
        label: metadata?.label ?? null,
        countryCode: metadata?.countryCode ?? null,
        isDefault: false,
        isVerified: false,
        // Map vault entry IDs to respective columns
        ...Object.fromEntries(
          Object.entries(vaultEntryIds).map(([field, vaultId]) => [
            VAULT_FIELD_MAPPING[field as keyof AddressComponents],
            vaultId
          ])
        )
      };

      const [address] = await transaction.insert(userAddresses).values(insertData).returning();

      if (!address) {
        throw Errors.databasedatabaseQueryFailed005({
          query: 'create user address with vault'
        });
      }

      // Step 3: Update vault entries with correct address entity ID (within same transaction)
      for (const [, vaultId] of Object.entries(vaultEntryIds)) {
        if (vaultId) {
          await transaction.execute(sql`
            UPDATE vault_entries
            SET entity_id = ${address.id}
            WHERE id = ${vaultId}
          `);
        }
      }

      this.logger.log(`Created vault-backed address ${address.id} for user ${userId}`);

      return address;
    };

    // BUG-002 fix: Use external transaction if provided, otherwise create new transaction
    // This ensures atomicity across vault storage, address creation, and vault updates
    return tx ? executeInTransaction(tx) : this.db.transaction(executeInTransaction);
  }

  /**
   * Retrieve address components from vault in batch (optimized to avoid N+1).
   * Fetches all vault entries in one query, then decrypts in parallel using vault service.
   *
   * @param tenantId - Tenant ID for vault scoping
   * @param addresses - Addresses with vault references
   * @param requestedBy - ID of user requesting the data (for audit logging)
   * @returns Addresses with decrypted PII components
   */
  async retrieveVaultComponentsBatch(
    tenantId: number,
    addresses: UserAddress[],
    requestedBy: number
  ): Promise<Map<number, DecryptedUserAddress>> {
    if (addresses.length === 0) {
      return new Map();
    }

    this.logger.debug(
      `Retrieving vault components for ${addresses.length} addresses in tenant ${tenantId}`
    );

    // Collect all unique (entityId, fieldPath) pairs for batch retrieval
    const retrievalTasks = new Map<
      string,
      { addressId: number; component: keyof AddressComponents; vaultId: number }
    >();

    for (const address of addresses) {
      for (const [component, column] of Object.entries(VAULT_FIELD_MAPPING)) {
        const vaultId = address[column];
        if (vaultId) {
          const key = `${address.id}:${component}:${vaultId}`;
          retrievalTasks.set(key, {
            addressId: address.id,
            component: component as keyof AddressComponents,
            vaultId
          });
        }
      }
    }

    if (retrievalTasks.size === 0) {
      // No vault entries for these addresses, return as-is
      return new Map(addresses.map((a) => [a.id, { ...a, decrypted: {} }]));
    }

    // Batch retrieve: parallel vault service calls for all components across all addresses
    const decryptPromises = Array.from(retrievalTasks.values()).map(
      async ({ addressId, component, vaultId }) => {
        try {
          const value = await this.vault.retrieveById({
            tenantId,
            vaultEntryId: vaultId,
            requestedBy
          });

          return { addressId, component, value, error: null };
        } catch {
          this.logger.error(
            `Failed to retrieve vault component for address ${addressId}, component ${component}`
          );
          return { addressId, component, value: null, error: new Error('Retrieval failed') };
        }
      }
    );

    const decryptedComponents = await Promise.all(decryptPromises);

    // Build result map with decrypted components
    const result = new Map<number, DecryptedUserAddress>();

    for (const address of addresses) {
      const decrypted: Partial<AddressComponents> = {};

      // Find all decrypted components for this address
      for (const item of decryptedComponents) {
        if (item.addressId === address.id && item.value) {
          decrypted[item.component] = item.value;
        }
      }

      result.set(address.id, {
        ...address,
        decrypted
      });
    }

    return result;
  }

  /**
   * Update a single address field with vault rotation.
   * Stores new value in vault and updates reference, handling old vault entry cleanup.
   *
   * @param tenantId - Tenant ID for vault scoping
   * @param addressId - Address ID to update
   * @param field - Address component field to update
   * @param value - New value (empty string to clear the field)
   * @param actorId - ID of user performing the action (for audit logging)
   * @param tx - Optional transaction context
   * @returns Updated address
   */
  async updateVaultField(
    tenantId: number,
    addressId: number,
    field: keyof AddressComponents,
    value: string,
    actorId: number,
    tx?: NodePgDatabase
  ): Promise<UserAddress> {
    this.logger.debug(
      `Updating vault field ${field} for address ${addressId} in tenant ${tenantId}`
    );

    const database = tx ?? this.db;

    // Verify address exists and belongs to tenant
    const address = await this.findByIdOrThrow(tenantId, addressId);

    const column = VAULT_FIELD_MAPPING[field];
    const oldVaultId = address[column];

    return database.transaction(async (tx) => {
      // Step 1: If clearing field, null out the reference
      if (!value || value.trim() === '') {
        if (oldVaultId) {
          // Note: We don't delete old vault entry for audit trail
          // Just remove the reference
          await tx
            .update(userAddresses)
            .set({
              [column]: null,
              updatedAt: new Date()
            })
            .where(
              and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId))
            );
        }

        const [updated] = await tx
          .select()
          .from(userAddresses)
          .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)))
          .limit(1);

        return updated as UserAddress;
      }

      // Step 2: Store new value in vault
      const fieldPath = `addresses.${field}`;
      // PERF-001 fix: Capture returned vault entry ID instead of separate SELECT query
      // BUG-002 fix: Pass transaction for atomicity
      const newVaultId = await this.vault.store({
        tenantId,
        entityType: VAULT_ENTITY_TYPE,
        entityId: addressId,
        fieldPath,
        value,
        storedBy: actorId,
        classification: 'confidential',
        tx: tx // BUG-002 fix: Pass transaction for atomicity
      });

      // Step 3: Update address with new vault reference
      await tx
        .update(userAddresses)
        .set({
          [column]: newVaultId,
          updatedAt: new Date()
        })
        .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)));

      const [updated] = await tx
        .select()
        .from(userAddresses)
        .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)))
        .limit(1);

      this.logger.log(
        `Updated vault field ${field} for address ${addressId}, rotated vault ID from ${oldVaultId} to ${newVaultId}`
      );

      return updated as UserAddress;
    });
  }

  /**
   * Internal method: Update a single address field with vault rotation within an existing transaction.
   * This method does NOT create its own transaction - it uses the provided one.
   *
   * @param tenantId - Tenant ID for vault scoping
   * @param addressId - Address ID to update
   * @param field - Address component field to update
   * @param value - New value (empty string to clear the field)
   * @param actorId - ID of user performing the action (for audit logging)
   * @param tx - REQUIRED transaction context
   * @returns Updated address
   */
  private async updateVaultFieldWithinTransaction(
    tenantId: number,
    addressId: number,
    field: keyof AddressComponents,
    value: string,
    actorId: number,
    tx: NodePgDatabase
  ): Promise<UserAddress> {
    this.logger.debug(
      `Updating vault field ${field} for address ${addressId} in tenant ${tenantId} (within transaction)`
    );

    // Verify address exists and belongs to tenant
    const address = await this.findByIdOrThrow(tenantId, addressId);

    const column = VAULT_FIELD_MAPPING[field];
    const oldVaultId = address[column];

    // Step 1: If clearing field, null out the reference
    if (!value || value.trim() === '') {
      if (oldVaultId) {
        // Note: We don't delete old vault entry for audit trail
        // Just remove the reference
        await tx
          .update(userAddresses)
          .set({
            [column]: null,
            updatedAt: new Date()
          })
          .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)));
      }

      const [updated] = await tx
        .select()
        .from(userAddresses)
        .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)))
        .limit(1);

      return updated as UserAddress;
    }

    // Step 2: Store new value in vault
    const fieldPath = `addresses.${field}`;
    // PERF-001 fix: Capture returned vault entry ID instead of separate SELECT query
    // BUG-002 fix: Pass transaction for atomicity
    const newVaultId = await this.vault.store({
      tenantId,
      entityType: VAULT_ENTITY_TYPE,
      entityId: addressId,
      fieldPath,
      value,
      storedBy: actorId,
      classification: 'confidential',
      tx: tx // BUG-002 fix: Pass transaction for atomicity
    });

    // Step 3: Update address with new vault reference
    await tx
      .update(userAddresses)
      .set({
        [column]: newVaultId,
        updatedAt: new Date()
      })
      .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)));

    const [updated] = await tx
      .select()
      .from(userAddresses)
      .where(and(eq(userAddresses.organizationId, tenantId), eq(userAddresses.id, addressId)))
      .limit(1);

    this.logger.log(
      `Updated vault field ${field} for address ${addressId}, rotated vault ID from ${oldVaultId} to ${newVaultId}`
    );

    return updated as UserAddress;
  }

  /**
   * Update multiple address fields atomically with vault rotation.
   * All fields are updated in a single transaction with new vault entries.
   *
   * @param tenantId - Tenant ID for vault scoping
   * @param addressId - Address ID to update
   * @param components - Address components to update
   * @param actorId - ID of user performing the action (for audit logging)
   * @param tx - Optional transaction context
   * @returns Updated address
   */
  async updateVaultFields(
    tenantId: number,
    addressId: number,
    components: Partial<AddressComponents>,
    actorId: number,
    tx?: NodePgDatabase
  ): Promise<UserAddress> {
    const fields = Object.keys(components);
    if (fields.length === 0) {
      return this.findByIdOrThrow(tenantId, addressId);
    }

    this.logger.debug(
      `Updating ${fields.length} vault fields for address ${addressId} in tenant ${tenantId}`
    );

    const database = tx ?? this.db;

    return database.transaction(async (tx) => {
      let updated = await this.findByIdOrThrow(tenantId, addressId);

      // Update each field sequentially (they share the transaction)
      // Use internal method that accepts transaction to avoid nested transactions
      for (const [field, value] of Object.entries(components)) {
        updated = await this.updateVaultFieldWithinTransaction(
          tenantId,
          addressId,
          field as keyof AddressComponents,
          value ?? '',
          actorId,
          tx
        );
      }

      return updated;
    });
  }

  /**
   * Retrieve single address with decrypted vault components.
   *
   * @param tenantId - Tenant ID for scoping
   * @param addressId - Address ID
   * @param requestedBy - ID of user requesting the data (for audit logging)
   * @returns Address with decrypted PII or null if not found
   */
  async findWithVault(
    tenantId: number,
    addressId: number,
    requestedBy: number
  ): Promise<DecryptedUserAddress | null> {
    const address = await this.findById(tenantId, addressId);
    if (!address) {
      return null;
    }

    const results = await this.retrieveVaultComponentsBatch(tenantId, [address], requestedBy);
    return results.get(addressId) ?? null;
  }

  /**
   * Retrieve all user addresses with decrypted vault components.
   *
   * @param tenantId - Tenant ID for scoping
   * @param userId - User ID
   * @param requestedBy - ID of user requesting the data (for audit logging)
   * @returns Addresses with decrypted PII
   */
  async findByUserWithVault(
    tenantId: number,
    userId: number,
    requestedBy: number
  ): Promise<DecryptedUserAddress[]> {
    const addresses = await this.findByUser(tenantId, userId);
    const results = await this.retrieveVaultComponentsBatch(tenantId, addresses, requestedBy);

    return Array.from(results.values());
  }
}
