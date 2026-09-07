import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UpdateMyProfileCommand } from '../../commands/update-my-profile.command';
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

@CommandHandler(UpdateMyProfileCommand)
@Injectable()
export class UpdateMyProfileHandler implements ICommandHandler<UpdateMyProfileCommand> {
  private readonly logger = new Logger(UpdateMyProfileHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userProfileViewService: UserProfileViewService,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateMyProfileCommand): Promise<UserProfileResponseDto> {
    const userIdNum = Number(command.userId);
    if (Number.isNaN(userIdNum) || userIdNum <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    const normalizedDisplayName = command.displayName?.trim();
    const phoneNumberProvided = command.phoneNumber !== undefined;
    const normalizedPhoneNumber = command.phoneNumber?.trim() ?? undefined;

    if (!normalizedDisplayName && !phoneNumberProvided) {
      throw Errors.validationinvalidValueFor002({
        field: 'profile',
        expectedType: 'at least one updatable field'
      });
    }

    const changedFields = [
      ...(normalizedDisplayName ? ['displayName'] : []),
      ...(phoneNumberProvided ? ['phoneNumber'] : [])
    ] as const;

    const updatedUser = await this.db.transaction(async (tx) => {
      const profile = await this.authRepository.updateMyProfile(
        command.tenantId,
        userIdNum,
        {
          displayName: normalizedDisplayName,
          phoneNumber: phoneNumberProvided ? (normalizedPhoneNumber ?? '') : undefined
        },
        tx
      );

      const eventPayload: UserProfileUpdatedData = {
        tenantId: command.tenantId,
        userId: command.userId,
        actorId: command.actorId,
        changedFields,
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
          eventType: 'auth.profile.updated.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: command.userId,
          action: 'UPDATE_PROFILE',
          target: {
            entityType: 'user',
            entityId: command.userId
          },
          details: {
            changedFields: [...changedFields],
            phoneNumberProvided
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return profile;
    });

    this.logger.log(`Updated profile for user ${command.userId}`);

    return this.userProfileViewService.build({
      userId: command.userId,
      tenantId: command.tenantId,
      actorId: command.actorId,
      email: command.email,
      name: command.name,
      username: command.username,
      user: updatedUser
    });
  }
}
