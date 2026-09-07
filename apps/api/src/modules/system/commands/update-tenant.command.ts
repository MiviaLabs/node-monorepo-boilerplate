import type { ICommand } from '@package/types';

// eslint-disable-next-line local-rules/prefer-const-enum
type TenantStatus = 'active' | 'suspended' | 'deleted';

/**
 * Update tenant command
 *
 * Updates an existing tenant in the system.
 * This is a system-wide operation that requires elevated permissions.
 */
export class UpdateTenantCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID
  readonly actorId: string; // User ID performing the action (from JWT)
  readonly targetTenantId: string; // ID of the tenant to update
  readonly name?: string;
  readonly slug?: string;
  readonly status?: TenantStatus;
  readonly updatedAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: string;
    targetTenantId: string;
    name?: string;
    slug?: string;
    status?: TenantStatus;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.targetTenantId = props.targetTenantId;
    if (props.name !== undefined) {
      this.name = props.name;
    }
    if (props.slug !== undefined) {
      this.slug = props.slug;
    }
    if (props.status !== undefined) {
      this.status = props.status;
    }
    this.updatedAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
