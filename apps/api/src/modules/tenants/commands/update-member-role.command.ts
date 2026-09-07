import type { ICommand } from '@package/types';

/**
 * Update member role command
 *
 * Updates a tenant member's role
 */
export class UpdateMemberRoleCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly memberId: string;
  readonly role: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    memberId: string;
    role: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.memberId = props.memberId;
    this.role = props.role;
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
