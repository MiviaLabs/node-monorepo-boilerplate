import type { IEvent } from '@package/types';

// eslint-disable-next-line local-rules/prefer-const-enum
type TenantStatus = 'active' | 'suspended' | 'deleted';

/**
 * Tenant updated event
 *
 * Published when a tenant is updated in the system.
 */
export class TenantUpdatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: number; // System tenant ID
  readonly targetTenantId: string; // ID of the updated tenant
  readonly changes: {
    name?: string;
    slug?: string;
    status?: TenantStatus;
  };
  readonly updatedAt: Date;
  readonly occurredAt: Date;
  readonly version = 1;

  constructor(props: {
    tenantId: number;
    targetTenantId: string;
    changes: {
      name?: string;
      slug?: string;
      status?: TenantStatus;
    };
  }) {
    this.aggregateId = props.targetTenantId;
    this.tenantId = props.tenantId;
    this.targetTenantId = props.targetTenantId;
    this.changes = props.changes;
    this.updatedAt = new Date();
    this.occurredAt = new Date();
  }
}
