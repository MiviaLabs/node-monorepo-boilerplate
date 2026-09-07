import { randomUUID } from 'node:crypto';

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OutboxRepository } from '@package/events';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { CreateUserCommand } from '../../commands/create-user.command';
import { UserResponseDto } from '../../dto';
import { UserEventType, UserEventSchemaVersion, type UserCreatedData } from '../../events';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { UserRepository } from '../../repositories/user.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly repository: UserRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: CreateUserCommand): Promise<UserResponseDto> {
    const emailHash = hashEmail(
      'user-' + String(command.organizationId) + '-' + String(Date.now()) + '@example.com'
    );

    return this.db.transaction(async (tx) => {
      const user = await this.repository.createWithTransaction(tx, {
        organizationId: command.tenantId,
        emailHash,
        isActive: command.isActive,
        isVerified: command.isVerified
      });

      // Create event payload using typed schema
      const eventData: UserCreatedData = {
        tenantId: String(command.tenantId),
        userId: String(user.id),
        organizationId: String(command.tenantId),
        emailHash,
        createdAt: user.createdAt.toISOString(),
        timestamp: new Date().toISOString()
      };

      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: UserEventType.USER_CREATED,
        aggregateId: String(user.id),
        aggregateVersion: '1',
        payload: eventData,
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(command.tenantId),
        schemaVersion: UserEventSchemaVersion.V1_0
      });

      await this.auditOutbox.insert(
        tx,
        buildUserAuditEvent({
          eventType: 'user.created.audit',
          tenantId: command.tenantId,
          actorId: String(command.actorId),
          requestId: command.requestId,
          aggregateId: user.id,
          action: 'CREATE_USER',
          target: {
            entityType: 'user',
            entityId: String(user.id)
          },
          details: {
            targetOrganizationId: String(user.organizationId ?? command.tenantId),
            isActive: user.isActive,
            isVerified: user.isVerified
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return UserResponseDto.fromEntity(user);
    });
  }
}
