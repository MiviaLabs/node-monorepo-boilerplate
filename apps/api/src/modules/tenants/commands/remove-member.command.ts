import type { ICommand } from '@package/types';

/**
 * Remove member command
 *
 * Removes a member from the current tenant
 */
export interface RemoveMemberCommandProps {
  tenantId: string;
  actorId: string;
  memberId: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

export class RemoveMemberCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly memberId: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: RemoveMemberCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.memberId = props.memberId;
    this.createdAt = new Date();
    if (props.requestId !== undefined) {
      this.requestId = props.requestId;
    }
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
