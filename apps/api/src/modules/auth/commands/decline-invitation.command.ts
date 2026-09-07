import type { ICommand } from '@package/types';

export class DeclineInvitationCommand implements ICommand {
  readonly readonly = true;
  readonly actorId: string;
  readonly actorEmail?: string;
  readonly tenantId?: string;
  readonly invitationToken: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    actorId: string;
    actorEmail?: string;
    tenantId?: string;
    invitationToken: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.actorId = props.actorId;
    if (props.actorEmail !== undefined) {
      this.actorEmail = props.actorEmail;
    }
    if (props.tenantId !== undefined) {
      this.tenantId = props.tenantId;
    }
    this.invitationToken = props.invitationToken;
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
