import type { ICommand } from '@package/types';

export interface RevokeInvitationCommandProps {
  tenantId: string;
  actorId?: string;
  invitationId: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Revoke invitation command
 *
 * Cancels a pending invitation for the current tenant.
 */
export class RevokeInvitationCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly invitationId: string;
  readonly createdAt: Date;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: RevokeInvitationCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.invitationId = props.invitationId;
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
