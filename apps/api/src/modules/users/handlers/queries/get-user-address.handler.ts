import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AddressResponseDto } from '../../dto';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { GetUserAddressQuery } from '../../queries/get-user-address.query';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetUserAddressQuery)
export class GetUserAddressHandler implements IQueryHandler<GetUserAddressQuery> {
  constructor(
    private readonly repository: UserAddressRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetUserAddressQuery): Promise<AddressResponseDto> {
    const addressRecord = await this.repository.findById(query.tenantId, query.addressId);
    const isRequestedUserOwner = addressRecord?.userId === query.userId;
    const address =
      addressRecord && isRequestedUserOwner
        ? await this.repository.findWithVault(query.tenantId, query.addressId, query.actorId)
        : null;

    await this.auditOutbox.insert(
      this.db,
      buildUserAuditEvent({
        eventType: 'user.address.viewed.audit',
        tenantId: query.tenantId,
        actorId: String(query.actorId),
        requestId: query.requestId,
        aggregateId: query.addressId,
        action: 'VIEW_USER_ADDRESS',
        target: {
          entityType: 'user_address',
          entityId: String(query.addressId)
        },
        details: {
          requestedUserId: String(query.userId),
          ownerMatchedRequestedUser: isRequestedUserOwner,
          result: address ? 'found' : 'not_found',
          includesDecryptedComponents: Boolean(address?.decrypted),
          includesencryptedStoreRefs: Boolean(address)
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    if (!address) {
      throw Errors.databaserecordNotFound004({ entity: 'UserAddress' });
    }

    return AddressResponseDto.fromEntity(address);
  }
}
