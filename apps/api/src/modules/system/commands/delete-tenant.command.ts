import type { ICommand } from '@package/types';

/**
 * Delete tenant command
 *
 * Permanently deletes a tenant from the system.
 * This is a dangerous operation that requires elevated permissions.
 * Should include confirmation/validation to prevent accidental deletion.
 */
export class DeleteTenantCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID
  readonly actorId: string; // User ID performing the action (from JWT)
  readonly targetTenantId: string; // ID of the tenant to delete
  readonly deletedAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: string;
    targetTenantId: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.targetTenantId = props.targetTenantId;
    this.deletedAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
