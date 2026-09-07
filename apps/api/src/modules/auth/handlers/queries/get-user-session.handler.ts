import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { GetUserSessionQuery } from '../../queries/get-user-session.query';
import { AuthSessionStoreService } from '../../services/auth-session-store.service';

import type { SessionEntity } from '../../dto/session.dto';

/**
 * Get user session query handler
 *
 * Retrieves active sessions for a user
 */
@QueryHandler(GetUserSessionQuery)
export class GetUserSessionHandler implements IQueryHandler<GetUserSessionQuery> {
  constructor(private readonly authSessionStore: AuthSessionStoreService) {}

  async execute(query: GetUserSessionQuery): Promise<SessionEntity[]> {
    const sessions = await this.authSessionStore.listUserSessions(
      query.tenantId,
      String(query.userId)
    );

    return sessions.map((session) => ({
      id: session.sessionId,
      userId: Number(session.userId),
      tenantId: session.tenantId,
      tokenId: session.tokenId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity,
      active: session.active
    }));
  }
}
