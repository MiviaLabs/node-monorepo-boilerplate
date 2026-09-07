import type { ICommand } from '@package/types';

/**
 * Update user command
 *
 * Updates an existing user within the tenant scope
 */
export class UpdateUserCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId: number;
  readonly id: number;
  readonly organizationId?: number;
  readonly isActive?: boolean;
  readonly isVerified?: boolean;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly updatedAt: Date;

  constructor(props: {
    tenantId: number;
    actorId: number;
    id: number;
    organizationId?: number;
    isActive?: boolean;
    isVerified?: boolean;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.id = props.id;
    if (props.organizationId !== undefined) {
      this.organizationId = props.organizationId;
    }
    if (props.isActive !== undefined) {
      this.isActive = props.isActive;
    }
    if (props.isVerified !== undefined) {
      this.isVerified = props.isVerified;
    }
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
    this.updatedAt = new Date();
  }
}
