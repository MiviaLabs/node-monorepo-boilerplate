import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AddressResponseDto } from '../../dto';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { GetDefaultAddressQuery } from '../../queries/get-default-address.query';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Get default address query handler
 *
 * Returns the default address for a user within tenant scope.
 * Throws USER_001 if no default address exists.
 * Address components are decrypted from encrypted-store for authorized reads.
 */
@QueryHandler(GetDefaultAddressQuery)
export class GetDefaultAddressHandler implements IQueryHandler<GetDefaultAddressQuery> {
  constructor(
    private readonly repository: UserAddressRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetDefaultAddressQuery): Promise<AddressResponseDto | null> {
    const defaultAddress = await this.repository.findDefaultByUser(query.tenantId, query.userId);

    if (!defaultAddress) {
      await this.auditOutbox.insert(
        this.db,
        buildUserAuditEvent({
          eventType: 'user.address.default.viewed.audit',
          tenantId: query.tenantId,
          actorId: String(query.actorId),
          requestId: query.requestId,
          aggregateId: query.userId,
          action: 'VIEW_DEFAULT_USER_ADDRESS',
          target: {
            entityType: 'user',
            entityId: String(query.userId)
          },
          details: {
            result: 'none'
          },
          correlationId: query.correlationId,
          causationId: query.causationId
        })
      );
      return null;
    }

    const address = await this.repository.findWithVault(
      query.tenantId,
      defaultAddress.id,
      query.actorId
    );

    await this.auditOutbox.insert(
      this.db,
      buildUserAuditEvent({
        eventType: 'user.address.default.viewed.audit',
        tenantId: query.tenantId,
        actorId: String(query.actorId),
        requestId: query.requestId,
        aggregateId: defaultAddress.id,
        action: 'VIEW_DEFAULT_USER_ADDRESS',
        target: {
          entityType: 'user_address',
          entityId: String(defaultAddress.id)
        },
        details: {
          ownerUserId: String(query.userId),
          result: 'found',
          includesDecryptedComponents: Boolean(address?.decrypted),
          includesencryptedStoreRefs: true
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return AddressResponseDto.fromEntity(address ?? defaultAddress);
  }
}
