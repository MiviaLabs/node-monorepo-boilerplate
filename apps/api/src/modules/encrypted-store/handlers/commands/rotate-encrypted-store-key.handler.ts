import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { commandSuccess, ICommandResult } from '@package/types';

import { RotateEncryptedStoreKeyCommand, RotateEncryptedStoreKeyResult } from '../../commands';
import { buildEncryptedStoreAuditEvent } from '../../events';
import { RotationTriggerSource } from '../../jobs/encrypted-store-key-rotation.job';
import { KmsRotationOrchestratorService } from '../../services/kms-rotation-orchestrator.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for RotateEncryptedStoreKeyCommand
 *
 * Rotates encryption keys for all vault entries belonging to a tenant.
 * This is a long-running operation that re-encrypts all data with a new key.
 */
@CommandHandler(RotateEncryptedStoreKeyCommand)
export class RotateEncryptedStoreKeyHandler implements ICommandHandler<RotateEncryptedStoreKeyCommand> {
  constructor(
    private readonly kmsRotationOrchestrator: KmsRotationOrchestratorService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: RotateEncryptedStoreKeyCommand): Promise<ICommandResult<RotateEncryptedStoreKeyResult>> {
    await this.kmsRotationOrchestrator.queueTenantRotation({
      tenantId: command.tenantId,
      oldKeyId: command.oldKeyId,
      newKeyId: command.newKeyId,
      actorId: command.actorId,
      requestId: command.requestId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      triggerSource: RotationTriggerSource.Manual
    });

    await this.auditOutbox.insert(
      this.db,
      buildEncryptedStoreAuditEvent({
        eventType: 'vault.key.rotation.requested.audit',
        tenantId: command.tenantId,
        actorId: String(command.actorId),
        requestId: command.requestId,
        aggregateId: command.tenantId,
        action: 'REQUEST_VAULT_KEY_ROTATION',
        target: {
          entityType: 'vault_tenant',
          entityId: String(command.tenantId)
        },
        details: {
          triggerSource: 'manual',
          executionMode: 'async',
          queued: true
        },
        correlationId: command.correlationId,
        causationId: command.causationId
      })
    );

    // Note: The vault service handles rotation state internally
    // For now, we return success with 0 entries as the service handles
    // the actual count internally via rotation state
    return commandSuccess({
      rotatedEntries: 0
    });
  }
}
