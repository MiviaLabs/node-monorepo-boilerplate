import type { ICommand } from '@package/types';

/**
 * Update My Profile Command Props
 */
export interface UpdateMyProfileCommandProps {
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly phoneNumber?: string;
}

/**
 * Update My Profile Command
 *
 * Updates only the authenticated subject user's profile fields.
 */
export class UpdateMyProfileCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly phoneNumber?: string;
  readonly createdAt: Date;

  constructor(props: UpdateMyProfileCommandProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
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
    if (props.displayName !== undefined) {
      this.displayName = props.displayName;
    }
    if (props.phoneNumber !== undefined) {
      this.phoneNumber = props.phoneNumber;
    }
    this.createdAt = new Date();
  }
}
