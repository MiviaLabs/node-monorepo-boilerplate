import type { ICommand } from '@package/types';

/**
 * Properties for creating a vault entry
 */
export interface CreateVaultEntryCommandProps {
  /** Tenant ID for multi-tenancy scoping */
  readonly tenantId: number;
  /** Actor ID of the user performing the operation */
  readonly actorId: number;
  /** Type of entity (e.g., 'user_address') */
  readonly entityType: string;
  /** ID of the entity */
  readonly entityId: number;
  /** Path to the field being stored */
  readonly fieldPath: string;
  /** Plaintext value to encrypt and store */
  readonly value: string;
  /** Optional data classification level */
  readonly classification?: string;
  /** Request-scoped trace identifier */
  readonly requestId?: string;
  /** Workflow-scoped trace identifier */
  readonly correlationId?: string;
  /** Direct-cause trace identifier */
  readonly causationId?: string;
}

/**
 * Command to create a new vault entry with encrypted PII data
 *
 * This command encapsulates all data needed to store sensitive information
 * in the vault using envelope encryption.
 *
 * @see EncryptedStoreService.store() for implementation
 */
export class CreateEncryptedStoreEntryCommand implements ICommand {
  /** @internal Command branding for CQRS type safety */
  readonly _brand?: 'command';

  /** Tenant ID for multi-tenancy scoping */
  readonly tenantId: number;
  /** Actor ID of the user performing the operation */
  readonly actorId: number;
  /** Type of entity (e.g., 'user_address') */
  readonly entityType: string;
  /** ID of the entity */
  readonly entityId: number;
  /** Path to the field being stored */
  readonly fieldPath: string;
  /** Plaintext value to encrypt and store */
  readonly value: string;
  /** Optional data classification level */
  readonly classification?: string;
  /** Request-scoped trace identifier */
  readonly requestId?: string;
  /** Workflow-scoped trace identifier */
  readonly correlationId?: string;
  /** Direct-cause trace identifier */
  readonly causationId?: string;
  /** Timestamp when command was created */
  readonly createdAt: Date;

  constructor(props: CreateVaultEntryCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.fieldPath = props.fieldPath;
    this.value = props.value;
    this.classification = props.classification;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.createdAt = new Date();
  }
}

/**
 * Result returned after successfully creating a vault entry
 */
export type CreateEncryptedStoreEntryResult = {
  /** ID of the created vault entry */
  readonly vaultEntryId: number;
};
