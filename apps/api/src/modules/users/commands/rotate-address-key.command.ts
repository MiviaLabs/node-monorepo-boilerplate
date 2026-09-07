import type { ICommand } from '@package/types';

/**
 * Rotate address key command
 *
 * Initiates key rotation for user address encrypted-store entries within a tenant.
 * Requires CRYPTO_KEY_ROTATE permission for security.
 */
export class RotateAddressKeyCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId: number;
  readonly oldKeyId: string;
  readonly newKeyId: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: number;
    oldKeyId: string;
    newKeyId: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.oldKeyId = props.oldKeyId;
    this.newKeyId = props.newKeyId;
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
