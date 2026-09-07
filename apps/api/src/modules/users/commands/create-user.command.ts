import type { ICommand } from '@package/types';

/**
 * Create user command
 *
 * Creates a new user within the tenant scope
 */
export class CreateUserCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId: number;
  readonly organizationId: number;
  readonly isActive?: boolean;
  readonly isVerified?: boolean;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: number;
    organizationId: number;
    isActive?: boolean;
    isVerified?: boolean;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.organizationId = props.organizationId;
    this.isActive = props.isActive ?? true;
    this.isVerified = props.isVerified ?? false;
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
