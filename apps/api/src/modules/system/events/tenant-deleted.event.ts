import type { IEvent } from '@package/types';

/**
 * Tenant deleted event
 *
 * Published when a tenant is deleted from the system.
 * This is a critical event that should trigger cleanup of all tenant data.
 */
export class TenantDeletedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: number; // System tenant ID
  readonly targetTenantId: string; // ID of the deleted tenant
  readonly deletedBy: string; // User ID who performed the deletion (from JWT)
  readonly deletedAt: Date;
  readonly occurredAt: Date;
  readonly version = 1;

  constructor(props: { tenantId: number; targetTenantId: string; deletedBy: string }) {
    this.aggregateId = props.targetTenantId;
    this.tenantId = props.tenantId;
    this.targetTenantId = props.targetTenantId;
    this.deletedBy = props.deletedBy;
    this.deletedAt = new Date();
    this.occurredAt = new Date();
  }
}
