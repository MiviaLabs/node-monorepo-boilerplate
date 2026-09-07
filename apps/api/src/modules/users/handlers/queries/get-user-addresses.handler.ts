import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AddressResponseDto } from '../../dto';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { GetUserAddressesQuery } from '../../queries/get-user-addresses.query';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Get user addresses query handler
 *
 * Returns all addresses for a user within tenant scope.
 * Results are ordered by isDefault (descending) and updatedAt (descending).
 * Address components are decrypted from encrypted-store for authorized reads.
 */
@QueryHandler(GetUserAddressesQuery)
export class GetUserAddressesHandler implements IQueryHandler<GetUserAddressesQuery> {
  constructor(
    private readonly repository: UserAddressRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetUserAddressesQuery): Promise<AddressResponseDto[]> {
    const addresses = await this.repository.findByUserWithVault(
      query.tenantId,
      query.userId,
      query.actorId
    );

    await this.auditOutbox.insert(
      this.db,
      buildUserAuditEvent({
        eventType: 'user.addresses.listed.audit',
        tenantId: query.tenantId,
        actorId: String(query.actorId),
        requestId: query.requestId,
        aggregateId: query.userId,
        action: 'LIST_USER_ADDRESSES',
        target: {
          entityType: 'user',
          entityId: String(query.userId)
        },
        details: {
          resultCount: addresses.length,
          includesDecryptedComponents: addresses.length > 0,
          includesencryptedStoreRefs: addresses.length > 0
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return AddressResponseDto.fromEntities(addresses);
  }
}
