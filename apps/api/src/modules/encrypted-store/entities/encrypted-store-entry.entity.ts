import { AggregateRoot } from '@package/types';

import type { IEvent, DataClassification, DataCategory } from '@package/types';

/**
 * Vault entry domain events
 */

/**
 * Published when a new vault entry is created
 */
export interface VaultEntryCreatedData {
  readonly entryId: string;
  readonly tenantId: string;
  readonly category: string;
  readonly classification: DataClassification;
  readonly dataCategory: DataCategory;
  readonly expiresAt: Date | null;
  readonly createdBy: string;
}

export class VaultEntryCreatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly entryId: string;
  readonly category: string;
  readonly classification: DataClassification;
  readonly dataCategory: DataCategory;
  readonly expiresAt: Date | null;
  readonly createdBy: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(data: VaultEntryCreatedData) {
    this.aggregateId = data.entryId;
    this.tenantId = data.tenantId;
    this.entryId = data.entryId;
    this.category = data.category;
    this.classification = data.classification;
    this.dataCategory = data.dataCategory;
    this.expiresAt = data.expiresAt;
    this.createdBy = data.createdBy;
    this.occurredAt = new Date();
    this.version = 1;
  }
}

/**
 * Published when a vault entry is updated
 */
export interface VaultEntryUpdatedData {
  readonly entryId: string;
  readonly tenantId: string;
  readonly category: string | null;
  readonly expiresAt: Date | null;
  readonly updatedBy: string;
  readonly changes: ReadonlyArray<{
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }>;
}

export class VaultEntryUpdatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly entryId: string;
  readonly category: string | null;
  readonly expiresAt: Date | null;
  readonly updatedBy: string;
  readonly changes: ReadonlyArray<{
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }>;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(data: VaultEntryUpdatedData) {
    this.aggregateId = data.entryId;
    this.tenantId = data.tenantId;
    this.entryId = data.entryId;
    this.category = data.category;
    this.expiresAt = data.expiresAt;
    this.updatedBy = data.updatedBy;
    this.changes = data.changes;
    this.occurredAt = new Date();
    this.version = 1;
  }
}

/**
 * Published when a vault entry is accessed
 */
export interface VaultEntryAccessedData {
  readonly entryId: string;
  readonly tenantId: string;
  readonly accessedBy: string;
  readonly accessReason: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export class VaultEntryAccessedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly entryId: string;
  readonly accessedBy: string;
  readonly accessReason: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(data: VaultEntryAccessedData) {
    this.aggregateId = data.entryId;
    this.tenantId = data.tenantId;
    this.entryId = data.entryId;
    this.accessedBy = data.accessedBy;
    this.accessReason = data.accessReason;
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.occurredAt = new Date();
    this.version = 1;
  }
}

/**
 * Published when a vault encryption key is rotated
 */
export interface VaultKeyRotatedData {
  readonly entryId: string;
  readonly tenantId: string;
  readonly rotatedBy: string;
  readonly keyVersion: number;
  readonly previousKeyVersion: number;
  readonly rotationReason: string;
}

export class VaultKeyRotatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly entryId: string;
  readonly rotatedBy: string;
  readonly keyVersion: number;
  readonly previousKeyVersion: number;
  readonly rotationReason: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(data: VaultKeyRotatedData) {
    this.aggregateId = data.entryId;
    this.tenantId = data.tenantId;
    this.entryId = data.entryId;
    this.rotatedBy = data.rotatedBy;
    this.keyVersion = data.keyVersion;
    this.previousKeyVersion = data.previousKeyVersion;
    this.rotationReason = data.rotationReason;
    this.occurredAt = new Date();
    this.version = 1;
  }
}

/**
 * Vault entry state interface
 */
export interface VaultEntryState {
  readonly id: string;
  readonly organizationId: string;
  readonly category: string;
  readonly encryptedData: string;
  readonly dataHash: string;
  readonly encryptionKeyId: string;
  readonly keyVersion: number;
  readonly classification: DataClassification;
  readonly dataCategory: DataCategory;
  readonly expiresAt: Date | null;
  readonly lastAccessedAt: Date | null;
  readonly accessCount: number;
  readonly metadata: Record<string, unknown> | null;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/**
 * Mutable vault entry state for internal use
 */
interface MutableVaultEntryState {
  id: string;
  organizationId: string;
  category: string;
  encryptedData: string;
  dataHash: string;
  encryptionKeyId: string;
  keyVersion: number;
  classification: DataClassification;
  dataCategory: DataCategory;
  expiresAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Vault Entry Aggregate Root
 *
 * Manages PII vault entries as domain aggregates with event sourcing support.
 * Enforces data classification, encryption, and access tracking.
 */
export class EncryptedStoreEntry extends AggregateRoot<VaultEntryState> {
  private _state: MutableVaultEntryState;

  constructor(
    id: string,
    initialState: Partial<VaultEntryState> &
      Pick<
        VaultEntryState,
        | 'organizationId'
        | 'category'
        | 'encryptedData'
        | 'dataHash'
        | 'encryptionKeyId'
        | 'classification'
        | 'dataCategory'
        | 'createdBy'
      >
  ) {
    super(id);
    const now = new Date();
    this._state = {
      id,
      organizationId: initialState.organizationId,
      category: initialState.category,
      encryptedData: initialState.encryptedData,
      dataHash: initialState.dataHash,
      encryptionKeyId: initialState.encryptionKeyId,
      keyVersion: initialState.keyVersion ?? 1,
      classification: initialState.classification,
      dataCategory: initialState.dataCategory,
      expiresAt: initialState.expiresAt ?? null,
      lastAccessedAt: null,
      accessCount: 0,
      metadata: initialState.metadata ?? null,
      createdBy: initialState.createdBy,
      updatedBy: null,
      createdAt: initialState.createdAt ?? now,
      updatedAt: initialState.updatedAt ?? now,
      deletedAt: initialState.deletedAt ?? null
    };
  }

  get state(): VaultEntryState {
    return this._state as VaultEntryState;
  }

  /**
   * Create a new vault entry
   */
  static create(
    id: string,
    props: {
      readonly organizationId: string;
      readonly category: string;
      readonly encryptedData: string;
      readonly dataHash: string;
      readonly encryptionKeyId: string;
      readonly classification: DataClassification;
      readonly dataCategory: DataCategory;
      readonly expiresAt?: Date | null;
      readonly metadata?: Record<string, unknown> | null;
      readonly createdBy: string;
    }
  ): EncryptedStoreEntry {
    const entry = new EncryptedStoreEntry(id, props);
    entry.addEvent(
      new VaultEntryCreatedEvent({
        entryId: id,
        tenantId: props.organizationId,
        category: props.category,
        classification: props.classification,
        dataCategory: props.dataCategory,
        expiresAt: props.expiresAt ?? null,
        createdBy: props.createdBy
      }),
      {
        tenantId: props.organizationId,
        userId: props.createdBy
      }
    );
    return entry;
  }

  /**
   * Update vault entry category or expiration
   */
  update(
    updates: {
      readonly category?: string;
      readonly expiresAt?: Date | null;
      readonly metadata?: Record<string, unknown> | null;
    },
    updatedBy: string
  ): void {
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    if (updates.category !== undefined && updates.category !== this._state.category) {
      changes.push({
        field: 'category',
        oldValue: this._state.category,
        newValue: updates.category
      });
      this._state.category = updates.category;
    }

    if (updates.expiresAt !== undefined && updates.expiresAt !== this._state.expiresAt) {
      changes.push({
        field: 'expiresAt',
        oldValue: this._state.expiresAt,
        newValue: updates.expiresAt
      });
      this._state.expiresAt = updates.expiresAt;
    }

    if (updates.metadata !== undefined && updates.metadata !== this._state.metadata) {
      changes.push({
        field: 'metadata',
        oldValue: this._state.metadata,
        newValue: updates.metadata
      });
      this._state.metadata = updates.metadata;
    }

    if (changes.length > 0) {
      this._state.updatedBy = updatedBy;
      this._state.updatedAt = new Date();

      this.addEvent(
        new VaultEntryUpdatedEvent({
          entryId: this._id,
          tenantId: this._state.organizationId,
          category: updates.category ?? null,
          expiresAt: updates.expiresAt ?? null,
          updatedBy,
          changes
        }),
        {
          tenantId: this._state.organizationId,
          userId: updatedBy
        }
      );
    }
  }

  /**
   * Record access to vault entry (for audit trail)
   */
  recordAccess(
    accessedBy: string,
    accessReason: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): void {
    this._state.lastAccessedAt = new Date();
    this._state.accessCount++;

    this.addEvent(
      new VaultEntryAccessedEvent({
        entryId: this._id,
        tenantId: this._state.organizationId,
        accessedBy,
        accessReason,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null
      }),
      {
        tenantId: this._state.organizationId,
        userId: accessedBy
      }
    );
  }

  /**
   * Rotate encryption key
   */
  rotateKey(newKeyVersion: number, rotatedBy: string, rotationReason: string): void {
    const previousKeyVersion = this._state.keyVersion;

    this._state.keyVersion = newKeyVersion;
    this._state.updatedBy = rotatedBy;
    this._state.updatedAt = new Date();

    this.addEvent(
      new VaultKeyRotatedEvent({
        entryId: this._id,
        tenantId: this._state.organizationId,
        rotatedBy,
        keyVersion: newKeyVersion,
        previousKeyVersion,
        rotationReason
      }),
      {
        tenantId: this._state.organizationId,
        userId: rotatedBy
      }
    );
  }

  /**
   * Mark entry as deleted (soft delete)
   */
  softDelete(deletedBy: string): void {
    this._state.deletedAt = new Date();
    this._state.updatedBy = deletedBy;
    this._state.updatedAt = new Date();
  }

  /**
   * Check if entry is expired
   */
  isExpired(): boolean {
    return this._state.expiresAt !== null && this._state.expiresAt < new Date();
  }

  /**
   * Check if entry is deleted
   */
  isDeleted(): boolean {
    return this._state.deletedAt !== null;
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): VaultEntryState {
    return { ...this._state };
  }

  /**
   * Apply event to aggregate state
   */
  protected override applyEvent(event: IEvent): void {
    super.applyEvent(event);

    if (event instanceof VaultEntryAccessedEvent) {
      this._state.lastAccessedAt = event.occurredAt;
      this._state.accessCount++;
    }
  }
}
