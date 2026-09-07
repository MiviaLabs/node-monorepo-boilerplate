import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { buildAuthAuditEvent } from '../../events';
import { ValidateTokenQuery } from '../../queries/validate-token.query';
import { AuthService } from '../../services/auth.service';

import type { UserInfo } from '../../auth.types';
import type { NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { measurePhase0 } from '@/common/services/phase-zero-diagnostics.service';

/**
 * Validate token query handler
 *
 * Validates an access token
 */
@QueryHandler(ValidateTokenQuery)
export class ValidateTokenHandler implements IQueryHandler<ValidateTokenQuery> {
  constructor(
    private readonly authService: AuthService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: ValidateTokenQuery): Promise<UserInfo> {
    return measurePhase0(
      'api.auth.validate_token.handler',
      {
        tenantIdPresent: Boolean(query.tenantId),
        requestId: query.requestId,
        correlationId: query.correlationId,
        causationId: query.causationId
      },
      async () => {
        const userInfo = await this.authService.validateToken(query.tenantId, query.token);

        await measurePhase0(
          'api.auth.validate_token.audit_outbox',
          {
            requestId: query.requestId,
            correlationId: query.correlationId,
            causationId: query.causationId,
            requestIdPresent: Boolean(query.requestId),
            correlationIdPresent: Boolean(query.correlationId),
            causationIdPresent: Boolean(query.causationId)
          },
          () =>
            this.auditOutbox.insert(
              this.db,
              buildAuthAuditEvent({
                eventType: 'auth.token.validated.audit',
                tenantId: userInfo.tenantId ?? query.tenantId,
                actorId: userInfo.userId,
                requestId: query.requestId,
                aggregateId: userInfo.userId ?? 'anonymous',
                action: 'VALIDATE_AUTH_TOKEN',
                target: {
                  entityType: 'user',
                  entityId: userInfo.userId ?? 'anonymous'
                },
                details: {
                  roleCount: userInfo.roles?.length ?? 0,
                  permissionCount: userInfo.permissions?.length ?? 0
                },
                correlationId: query.correlationId,
                causationId: query.causationId
              })
            )
        );

        return userInfo;
      }
    );
  }
}
