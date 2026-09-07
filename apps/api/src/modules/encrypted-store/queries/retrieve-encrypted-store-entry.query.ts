import type { IQuery } from '@package/types';

/**
 * Properties for retrieving a vault entry
 */
export interface RetrieveVaultEntryQueryProps {
  /** Tenant ID for multi-tenancy scoping */
  readonly tenantId: number;
  /** Actor ID of the user performing the operation */
  readonly actorId: number;
  /** Type of entity (e.g., 'user_address') */
  readonly entityType: string;
  /** ID of the entity */
  readonly entityId: number;
  /** Path to the field within the entity */
  readonly fieldPath: string;
  /** Request-scoped trace identifier */
  readonly requestId?: string;
  /** Workflow-scoped trace identifier */
  readonly correlationId?: string;
  /** Direct-cause trace identifier */
  readonly causationId?: string;
}

/**
 * Query to retrieve decrypted PII data from the vault
 *
 * This query retrieves and decrypts sensitive data from the PII vault.
 * All access is logged for compliance (SOC2, GDPR).
 */
export class RetrieveEncryptedStoreEntryQuery implements IQuery {
  /** @internal Query branding for CQRS type safety */
  readonly _brand?: 'query';

  /** Tenant ID for multi-tenancy scoping */
  readonly tenantId: number;
  /** Actor ID of the user performing the operation */
  readonly actorId: number;
  /** Type of entity (e.g., 'user_address') */
  readonly entityType: string;
  /** ID of the entity */
  readonly entityId: number;
  /** Path to the field within the entity */
  readonly fieldPath: string;
  /** Request-scoped trace identifier */
  readonly requestId?: string;
  /** Workflow-scoped trace identifier */
  readonly correlationId?: string;
  /** Direct-cause trace identifier */
  readonly causationId?: string;

  constructor(props: RetrieveVaultEntryQueryProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.fieldPath = props.fieldPath;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
