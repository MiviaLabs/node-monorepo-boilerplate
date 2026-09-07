import type { IEvent } from '@package/types';

/**
 * Tenant created event
 *
 * Published when a new tenant is created in the system.
 */
export class TenantCreatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: number; // System tenant ID
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly tenantIdCreated: number; // ID of the newly created tenant
  readonly createdAt: Date;
  readonly occurredAt: Date;
  readonly version = 1;

  constructor(props: {
    tenantId: number;
    tenantName: string;
    tenantSlug: string;
    tenantIdCreated: number;
  }) {
    this.aggregateId = String(props.tenantIdCreated);
    this.tenantId = props.tenantId;
    this.tenantName = props.tenantName;
    this.tenantSlug = props.tenantSlug;
    this.tenantIdCreated = props.tenantIdCreated;
    this.createdAt = new Date();
    this.occurredAt = new Date();
  }
}
