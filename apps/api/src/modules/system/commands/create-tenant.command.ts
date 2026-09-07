import type { ICommand } from '@package/types';

/**
 * Create tenant command
 *
 * Creates a new tenant in the system.
 * This is a system-wide operation that requires elevated permissions.
 */
export class CreateTenantCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID (usually 0 or special system tenant)
  readonly actorId: string; // User ID performing the action (from JWT)
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: string;
    name: string;
    slug: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.name = props.name;
    this.slug = props.slug;
    this.createdAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
