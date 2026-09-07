import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UpdateUserCommand } from '../../commands/update-user.command';
import { UserResponseDto } from '../../dto';
import { UserEventType, UserEventSchemaVersion, type UserUpdatedData } from '../../events';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { UserRepository } from '../../repositories/user.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Update user command handler
 *
 * Updates an existing user within tenant scope
 * Uses transaction to ensure atomicity of user update and outbox event insertion
 */
@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    private readonly repository: UserRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateUserCommand): Promise<UserResponseDto> {
    // Build update data with only provided fields
    const updateData: {
      isActive?: boolean;
      isVerified?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: command.updatedAt
    };

    if (command.isActive !== undefined) {
      updateData.isActive = command.isActive;
    }
    if (command.isVerified !== undefined) {
      updateData.isVerified = command.isVerified;
    }

    return this.db.transaction(async (tx) => {
      // Delegate to repository for all data access
      const user = await this.repository.updateWithTransaction(
        command.tenantId,
        tx,
        command.id,
        updateData
      );

      // Build updated fields payload for event
      const updatedFields: Record<string, unknown> = {
        updatedAt: command.updatedAt
      };

      if (command.isActive !== undefined) {
        updatedFields['isActive'] = command.isActive;
      }
      if (command.isVerified !== undefined) {
        updatedFields['isVerified'] = command.isVerified;
      }

      // Create event payload using typed schema
      const eventData: UserUpdatedData = {
        tenantId: String(command.tenantId),
        userId: String(user.id),
        changes: updatedFields,
        updatedBy: String(command.actorId),
        timestamp: new Date().toISOString()
      };

      // Insert outbox record for user.updated event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: UserEventType.USER_UPDATED,
        aggregateId: String(user.id),
        aggregateVersion: '2',
        payload: eventData,
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(command.tenantId),
        schemaVersion: UserEventSchemaVersion.V1_0
      });

      await this.auditOutbox.insert(
        tx,
        buildUserAuditEvent({
          eventType: 'user.updated.audit',
          tenantId: command.tenantId,
          actorId: String(command.actorId),
          requestId: command.requestId,
          aggregateId: user.id,
          action: 'UPDATE_USER',
          target: {
            entityType: 'user',
            entityId: String(user.id)
          },
          details: {
            changedFields: Object.keys(updatedFields).sort()
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return UserResponseDto.fromEntity(user);
    });
  }
}
