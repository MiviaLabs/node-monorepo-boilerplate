import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { RemoveMyAvatarCommand } from '../../commands/remove-my-avatar.command';
import { UserProfileResponseDto } from '../../dto';
import {
  AuthEventSchemaVersion,
  AuthEventType,
  buildAuthAuditEvent,
  type UserProfileUpdatedData
} from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { UserProfileViewService } from '../../services/user-profile-view.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import {
  DetachedFileCleanupService,
  DetachedFileCleanupStatus
} from '@/modules/storage/services/detached-file-cleanup.service';

@CommandHandler(RemoveMyAvatarCommand)
@Injectable()
export class RemoveMyAvatarHandler implements ICommandHandler<RemoveMyAvatarCommand> {
  private readonly logger = new Logger(RemoveMyAvatarHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly detachedFileCleanupService: DetachedFileCleanupService,
    private readonly userProfileViewService: UserProfileViewService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: RemoveMyAvatarCommand): Promise<UserProfileResponseDto> {
    const userIdNum = Number(command.userId);
    if (Number.isNaN(userIdNum) || userIdNum <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    const updatedUser = await this.db.transaction(async (tx) => {
      const { user, previousAvatarFileId, changed } =
        await this.authRepository.clearMyAvatarFileWithDatabase(tx, command.tenantId, userIdNum);

      let cleanupStatus = DetachedFileCleanupStatus.Noop;
      if (changed && previousAvatarFileId !== null) {
        const cleanup = await this.detachedFileCleanupService.softDeleteDetachedFileWithDatabase(
          tx,
          Number.parseInt(command.tenantId, 10),
          command.actorId,
          previousAvatarFileId,
          {
            requestId: command.requestId,
            correlationId: command.correlationId,
            causationId: command.causationId
          },
          { expectedPurpose: 'user_avatar' }
        );
        cleanupStatus = cleanup.cleanupStatus;
      }

      if (changed) {
        const eventPayload: UserProfileUpdatedData = {
          tenantId: command.tenantId,
          userId: command.userId,
          actorId: command.actorId,
          changedFields: ['avatarFileId'],
          timestamp: new Date().toISOString()
        };

        await this.outboxRepo.insert(tx, {
          eventId: randomUUID(),
          eventType: AuthEventType.USER_PROFILE_UPDATED,
          aggregateId: command.userId,
          aggregateVersion: '1',
          payload: eventPayload,
          correlationId: command.correlationId,
          causationId: command.causationId,
          tenantId: command.tenantId,
          schemaVersion: AuthEventSchemaVersion.V1_0
        });

        await this.auditOutbox.insert(
          tx,
          buildAuthAuditEvent({
            eventType: 'auth.profile.avatar.removed.audit',
            tenantId: command.tenantId,
            actorId: command.actorId,
            requestId: command.requestId,
            aggregateId: command.userId,
            action: 'REMOVE_AVATAR',
            target: {
              entityType: 'user',
              entityId: command.userId
            },
            details: {
              previousFileId: previousAvatarFileId,
              cleanupTriggered: previousAvatarFileId !== null,
              cleanupStatus
            },
            correlationId: command.correlationId,
            causationId: command.causationId
          })
        );
      }

      return user;
    });

    this.logger.log(`Removed avatar for user ${command.userId}`);

    return this.userProfileViewService.build({
      tenantId: command.tenantId,
      userId: command.userId,
      actorId: command.actorId,
      email: command.email,
      name: command.name,
      username: command.username,
      user: updatedUser
    });
  }
}
