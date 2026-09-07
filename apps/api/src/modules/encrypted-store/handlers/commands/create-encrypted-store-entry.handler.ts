import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { commandSuccess, ICommandResult } from '@package/types';

import { CreateEncryptedStoreEntryCommand, CreateEncryptedStoreEntryResult } from '../../commands';
import { EncryptedStoreService } from '../../encrypted-store.service';

/**
 * Handler for CreateEncryptedStoreEntryCommand
 *
 * Creates a new vault entry with encrypted PII data using envelope encryption.
 */
@CommandHandler(CreateEncryptedStoreEntryCommand)
export class CreateEncryptedStoreEntryHandler implements ICommandHandler<CreateEncryptedStoreEntryCommand> {
  constructor(private readonly encryptedStoreService: EncryptedStoreService) {}

  async execute(command: CreateEncryptedStoreEntryCommand): Promise<ICommandResult<CreateEncryptedStoreEntryResult>> {
    const vaultEntryId = await this.encryptedStoreService.store({
      tenantId: command.tenantId,
      entityType: command.entityType,
      entityId: command.entityId,
      fieldPath: command.fieldPath,
      value: command.value,
      storedBy: command.actorId,
      classification: command.classification,
      requestId: command.requestId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      emitAuditEvent: true
    });

    return commandSuccess({
      vaultEntryId
    });
  }
}
