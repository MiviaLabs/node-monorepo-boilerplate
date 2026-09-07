import type { IQuery } from '@package/types';

/**
 * Get user session query
 *
 * Retrieves active sessions for a user
 */
export class GetUserSessionQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: string;
  readonly userId: number;
  readonly sessionId?: string;

  constructor(props: { tenantId: string; userId: number; sessionId?: string }) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    if (props.sessionId !== undefined) {
      this.sessionId = props.sessionId;
    }
  }
}
