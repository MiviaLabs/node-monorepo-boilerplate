import type { ICommand } from '@package/types';

export interface GenerateInvitationLinkCommandProps {
  tenantId: string;
  actorId?: string;
  invitationId: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Generate invitation link command
 *
 * Rotates a pending invitation token for the current tenant and returns the raw token.
 */
export class GenerateInvitationLinkCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly invitationId: string;
  readonly createdAt: Date;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GenerateInvitationLinkCommandProps) {
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
