import type { InviteMemberDto } from '../dto';
import type { ICommand } from '@package/types';

/**
 * Invite member command
 *
 * Invites a user to join the current tenant
 */
export class InviteMemberCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly invitation: InviteMemberDto;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    invitation: InviteMemberDto;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.invitation = props.invitation;
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
