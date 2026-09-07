import type { ICommand } from '@package/types';

export interface UpdateMyAvatarCommandProps {
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly fileId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
}

export class UpdateMyAvatarCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly fileId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
  readonly createdAt: Date;

  constructor(props: UpdateMyAvatarCommandProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
    this.fileId = props.fileId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    if (props.email !== undefined) {
      this.email = props.email;
    }
    if (props.name !== undefined) {
      this.name = props.name;
    }
    if (props.username !== undefined) {
      this.username = props.username;
    }
    this.createdAt = new Date();
  }
}
