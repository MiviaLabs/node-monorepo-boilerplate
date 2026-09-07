import type { ICommand } from '@package/types';

/**
 * Resume address key rotation command
 *
 * Resumes a previously interrupted key rotation operation.
 * Requires CRYPTO_KEY_ROTATE permission for security.
 */
export class ResumeRotationCommand implements ICommand {
  /** @internal Command branding for CQRS type safety */
  readonly _brand?: 'command';

  readonly tenantId: number;
  readonly actorId: number;
  readonly rotationStateId: number;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: number;
    rotationStateId: number;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.rotationStateId = props.rotationStateId;
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
