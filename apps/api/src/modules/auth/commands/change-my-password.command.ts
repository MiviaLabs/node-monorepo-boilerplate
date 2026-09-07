import type { ICommand } from '@package/types';

export interface ChangeMyPasswordCommandProps {
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export class ChangeMyPasswordCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly createdAt: Date;

  constructor(props: ChangeMyPasswordCommandProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    if (props.email !== undefined) {
      this.email = props.email;
    }
    this.currentPassword = props.currentPassword;
    this.newPassword = props.newPassword;
    this.createdAt = new Date();
  }
}
