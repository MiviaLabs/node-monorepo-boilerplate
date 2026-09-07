import type { IQuery } from '@package/types';

/**
 * Validate token query
 *
 * Validates an access token
 */
export class ValidateTokenQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: string;
  readonly token: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    token: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
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
