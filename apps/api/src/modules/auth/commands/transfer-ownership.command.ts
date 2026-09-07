import type { ICommand } from '@package/types';

/**
 * Transfer Ownership Command Props
 *
 * Properties for transferring organization ownership to another user
 */
export interface TransferOwnershipCommandProps {
  /**
   * Tenant ID (organization ID)
   */
  readonly tenantId: string;

  /**
   * User ID of the current owner initiating the transfer
   */
  readonly actorId: string;

  /**
   * User ID of the new owner
   */
  readonly newOwnerId: string;

  /**
   * Reason for ownership transfer (optional)
   */
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * Transfer Ownership Command
 *
 * Transfers organization ownership from current owner to a new owner.
 *
 * **Business Rules:**
 * - Only current owner can transfer ownership
 * - New owner must be an existing member of the organization
 * - New owner must be active (not soft-deleted)
 * - Transfer is atomic (uses transaction)
 *
 * **Use Cases:**
 * - Owner wants to leave the organization
 * - Owner account compromise - transfer to trusted admin
 * - Organizational restructuring
 *
 * @example
 * ```typescript
 * const command = new TransferOwnershipCommand({
 *   tenantId: 'org-123',
 *   actorId: 'owner-user-id',
 *   newOwnerId: 'new-owner-user-id',
 *   reason: 'Organizational restructuring'
 * });
 * await commandBus.execute(command);
 * ```
 */
export class TransferOwnershipCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly actorId: string;
  readonly newOwnerId: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly createdAt: Date;

  constructor(props: TransferOwnershipCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.newOwnerId = props.newOwnerId;
    if (props.reason !== undefined) {
      this.reason = props.reason;
    }
    if (props.requestId !== undefined) {
      this.requestId = props.requestId;
    }
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
    this.createdAt = new Date();
  }
}
