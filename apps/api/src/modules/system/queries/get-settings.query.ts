import type { IQuery } from '@package/types';

/**
 * Get system settings query
 *
 * Retrieves system-wide configuration settings.
 * This is a system-wide operation that requires elevated permissions.
 */
export class GetSettingsQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
