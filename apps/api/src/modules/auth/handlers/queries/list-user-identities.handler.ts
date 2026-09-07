import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { buildAuthAuditEvent } from '../../events';
import { ListUserIdentitiesQuery } from '../../queries/list-user-identities.query';
import { AuthRepository } from '../../repositories/auth.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';

import type { NodePgDatabase, UserIdentity } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * List user identities query handler
 *
 * Retrieves all identities for a user.
 * Validates that the user belongs to the same tenant before returning identities.
 */
@QueryHandler(ListUserIdentitiesQuery)
export class ListUserIdentitiesHandler implements IQueryHandler<ListUserIdentitiesQuery> {
  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly userIdentityRepository: UserIdentityRepository,
    private readonly authRepository: AuthRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: ListUserIdentitiesQuery): Promise<UserIdentity[]> {
    // Step 1: Get user to verify tenant ownership
    const user = await this.authRepository.findById(query.tenantId, query.userId);

    if (!user) {
      throw Errors.useruserWithId001({ userId: String(query.userId) });
    }

    // Step 2: Verify user belongs to the same tenant (critical tenant isolation check)
    if (user.organizationId?.toString() !== query.tenantId) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'users:list-identities-cross-tenant'
      });
    }

    // Step 3: Return identities for the validated user
    const identities = await this.userIdentityRepository.findByUserId(user.id);

    await this.auditOutbox.insert(
      this.db,
      buildAuthAuditEvent({
        eventType: 'auth.identities.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: user.id,
        action: 'VIEW_USER_IDENTITIES',
        target: {
          entityType: 'user',
          entityId: String(user.id)
        },
        details: {
          identityCount: identities.length,
          providers: [...new Set(identities.map((identity) => String(identity.provider)).sort())]
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return identities;
  }
}
