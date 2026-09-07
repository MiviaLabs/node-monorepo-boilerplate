import type { ICommand } from '@package/types';

/**
 * Properties for rotating vault encryption keys
 */
export interface RotateVaultKeyCommandProps {
  /** Tenant ID for multi-tenancy scoping */
  readonly tenantId: number;
  /** Actor ID of the user performing the operation */
  readonly actorId: number;
  /** Old key ID to rotate from */
  readonly oldKeyId: string;
  /** New key ID to rotate to */
  readonly newKeyId: string;
  /** Request-scoped trace identifier */
  readonly requestId?: string;
  /** Workflow-scoped trace identifier */
  readonly correlationId?: string;
  /** Direct-cause trace identifier */
  readonly causationId?: string;
}

/**
 * Command to rotate encryption keys for vault entries
 *
 * This command initiates key rotation for all vault entries belonging to a tenant.
 * It re-encrypts all data with a new key in batches.
 *
 * @see EncryptedStoreService.rotateKey for implementation
 */
export class RotateEncryptedStoreKeyCommand implements ICommand {
  /** @internal Command branding for CQRS type safety */
  readonly _brand?: 'command';

  /** Tenant ID for multi-tenancy scoping */
  readonly tenantId: number;
  /** Actor ID of the user performing the operation */
  readonly actorId: number;
  /** Old key ID to rotate from */
  readonly oldKeyId: string;
  /** New key ID to rotate to */
  readonly newKeyId: string;
  /** Request-scoped trace identifier */
  readonly requestId?: string;
  /** Workflow-scoped trace identifier */
  readonly correlationId?: string;
  /** Direct-cause trace identifier */
  readonly causationId?: string;
  /** Timestamp when command was created */
  readonly createdAt: Date;

  constructor(props: RotateVaultKeyCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.oldKeyId = props.oldKeyId;
    this.newKeyId = props.newKeyId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.createdAt = new Date();
  }
}

/**
 * Result returned after key rotation
 */
export type RotateEncryptedStoreKeyResult = {
  /** Number of vault entries rotated */
  readonly rotatedEntries: number;
};
