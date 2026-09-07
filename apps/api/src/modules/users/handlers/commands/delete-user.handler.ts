import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RoleService } from '@package/auth';
import { SYSTEM_ROLE } from '@package/constants';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AuthRepository } from '../../../auth/repositories/auth.repository';
import { DeleteUserCommand } from '../../commands/delete-user.command';
import {
  UserEventType,
  UserEventSchemaVersion,
  DeletionType,
  type UserDeletedData
} from '../../events';
import { buildUserAuditEvent } from '../../events/user-audit-event';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Delete user command handler
 *
 * Deletes a user within tenant scope and publishes outbox event
 * Wraps deletion in transaction for atomicity
 */
@CommandHandler(DeleteUserCommand)
export class DeleteUserHandler implements ICommandHandler<DeleteUserCommand> {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly roleService: RoleService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    return this.db.transaction(async (tx) => {
      if (command.actorId === command.id) {
        throw new ForbiddenException('You cannot delete your own account from admin');
      }

      const [actorSystemRoles, targetSystemRoles] = await Promise.all([
        this.roleService.getSystemRoles(command.actorId),
        this.roleService.getSystemRoles(command.id)
      ]);

      if (
        targetSystemRoles.includes(SYSTEM_ROLE.OWNER) &&
        !actorSystemRoles.includes(SYSTEM_ROLE.OWNER)
      ) {
        throw new ForbiddenException('Only system owners can delete system owners');
      }

      // Soft delete user within transaction to preserve audit and recovery posture.
      await this.authRepository.softDeleteWithTransaction(String(command.tenantId), tx, command.id);

      // Create event payload using typed schema
      const eventData: UserDeletedData = {
        tenantId: String(command.tenantId),
        userId: String(command.id),
        deletionType: DeletionType.Soft,
        deletedBy: String(command.actorId),
        timestamp: new Date().toISOString()
      };

      // Insert outbox record for user.deleted event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: UserEventType.USER_DELETED,
        aggregateId: String(command.id),
        aggregateVersion: '3',
        payload: eventData,
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(command.tenantId),
        schemaVersion: UserEventSchemaVersion.V1_0
      });

      await this.auditOutbox.insert(
        tx,
        buildUserAuditEvent({
          eventType: 'user.deleted.audit',
          tenantId: command.tenantId,
          actorId: String(command.actorId),
          requestId: command.requestId,
          aggregateId: command.id,
          action: 'DELETE_USER',
          target: {
            entityType: 'user',
            entityId: String(command.id)
          },
          details: {
            deletionMode: DeletionType.Soft
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });
  }
}
