import type { IQuery } from '@package/types';

/**
 * Validate password reset token query
 *
 * Checks if a password reset token is valid, expired, used, or not found.
 * Used to validate tokens before allowing password reset.
 */
export class ValidatePasswordResetTokenQuery implements IQuery {
  readonly readonly = true;
  readonly token: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    token: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.token = props.token;
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
