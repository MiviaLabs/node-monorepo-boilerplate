import type { ICommand } from '@package/types';

/**
 * Delete Account Command Props
 *
 * Properties for account deletion command
 */
export interface DeleteAccountCommandProps {
  /**
   * Tenant ID (organization ID)
   */
  readonly tenantId: string;

  /**
   * User ID of the actor performing the deletion
   * (could be admin or the user themselves)
   */
  readonly actorId: string;

  /**
   * User ID of the account to delete
   */
  readonly targetUserId: string;

  /**
   * Reason for deletion (e.g., GDPR request, voluntary)
   */
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * Delete Account Command
 *
 * Handles user account deletion with the following logic:
 * - If user is organization owner: DELETE entire organization + all users
 * - If user is regular user: DELETE only that user
 *
 * Deletion includes:
 * - Database records (users, user_identities, etc.)
 * - GCP Identity Platform user(s)
 * - Publishes events to outbox for audit logging
 *
 * Uses transactions for atomicity.
 */
export class DeleteAccountCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly actorId: string;
  readonly targetUserId: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly createdAt: Date;

  constructor(props: DeleteAccountCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.targetUserId = props.targetUserId;
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
