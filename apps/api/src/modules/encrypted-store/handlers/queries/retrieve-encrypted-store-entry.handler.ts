import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { RetrieveEncryptedStoreEntryQuery } from '../../queries';
import { EncryptedStoreService } from '../../encrypted-store.service';

/**
 * Handler for RetrieveEncryptedStoreEntryQuery
 *
 * Retrieves and decrypts PII data from the vault.
 */
@QueryHandler(RetrieveEncryptedStoreEntryQuery)
export class RetrieveEncryptedStoreEntryHandler implements IQueryHandler<RetrieveEncryptedStoreEntryQuery> {
  constructor(private readonly encryptedStoreService: EncryptedStoreService) {}

  async execute(query: RetrieveEncryptedStoreEntryQuery): Promise<string> {
    return this.encryptedStoreService.retrieve({
      tenantId: query.tenantId,
      entityType: query.entityType,
      entityId: query.entityId,
      fieldPath: query.fieldPath,
      requestedBy: query.actorId,
      requestId: query.requestId,
      correlationId: query.correlationId,
      causationId: query.causationId,
      emitAuditEvent: true
    });
  }
}
