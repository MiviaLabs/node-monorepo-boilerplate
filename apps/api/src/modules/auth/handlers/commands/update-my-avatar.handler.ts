import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UpdateMyAvatarCommand } from '../../commands/update-my-avatar.command';
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
import { FileRepository } from '@/modules/storage/repositories/file.repository';
import {
  DetachedFileCleanupService,
  DetachedFileCleanupStatus
} from '@/modules/storage/services/detached-file-cleanup.service';

@CommandHandler(UpdateMyAvatarCommand)
@Injectable()
export class UpdateMyAvatarHandler implements ICommandHandler<UpdateMyAvatarCommand> {
  private readonly logger = new Logger(UpdateMyAvatarHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly fileRepository: FileRepository,
    private readonly detachedFileCleanupService: DetachedFileCleanupService,
    private readonly userProfileViewService: UserProfileViewService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateMyAvatarCommand): Promise<UserProfileResponseDto> {
    const userIdNum = Number(command.userId);
    if (Number.isNaN(userIdNum) || userIdNum <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    if (!Number.isInteger(command.fileId) || command.fileId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'fileId',
        expectedType: 'positive integer'
      });
    }

    const updatedUser = await this.db.transaction(async (tx) => {
      const file = await this.fileRepository.findByIdWithDatabase(
        tx,
        Number.parseInt(command.tenantId, 10),
        command.fileId
      );
      if (!file) {
        throw Errors.filefileNotFound004({ filename: String(command.fileId) });
      }
      if (file.status !== 'ready') {
        throw Errors.validationinvalidValueFor002({
          field: 'fileId',
          expectedType: 'ready avatar file'
        });
      }
      if (file.purpose !== 'user_avatar') {
        throw Errors.validationinvalidValueFor002({
          field: 'fileId',
          expectedType: 'user avatar file'
        });
      }
      if (file.uploadedByUserId !== userIdNum) {
        throw Errors.validationinvalidValueFor002({
          field: 'fileId',
          expectedType: 'avatar uploaded by current user'
        });
      }

      const {
        user: profile,
        previousAvatarFileId,
        changed
      } = await this.authRepository.replaceMyAvatarFileWithDatabase(
        tx,
        command.tenantId,
        userIdNum,
        command.fileId
      );

      let cleanupStatus = DetachedFileCleanupStatus.Noop;
      if (changed && previousAvatarFileId !== null && previousAvatarFileId !== command.fileId) {
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
            eventType: 'auth.profile.avatar.updated.audit',
            tenantId: command.tenantId,
            actorId: command.actorId,
            requestId: command.requestId,
            aggregateId: command.userId,
            action: 'UPDATE_AVATAR',
            target: {
              entityType: 'user',
              entityId: command.userId
            },
            details: {
              fileId: command.fileId,
              newFileId: command.fileId,
              previousFileId: previousAvatarFileId,
              cleanupTriggered:
                previousAvatarFileId !== null && previousAvatarFileId !== command.fileId,
              cleanupStatus
            },
            correlationId: command.correlationId,
            causationId: command.causationId
          })
        );
      }

      return profile;
    });

    this.logger.log(`Updated avatar for user ${command.userId}`);

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
