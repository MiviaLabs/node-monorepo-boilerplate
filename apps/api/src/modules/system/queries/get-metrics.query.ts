import type { IQuery } from '@package/types';

/**
 * Get system metrics query
 *
 * Retrieves system-wide monitoring and usage metrics.
 * This is a system-wide operation that requires elevated permissions.
 */
export class GetMetricsQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly emitAuditEvent: boolean;

  constructor(props: {
    tenantId: number;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    emitAuditEvent?: boolean;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.emitAuditEvent = props.emitAuditEvent ?? true;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
