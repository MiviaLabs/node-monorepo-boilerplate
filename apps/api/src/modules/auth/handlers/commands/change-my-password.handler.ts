import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { ChangeMyPasswordCommand } from '../../commands/change-my-password.command';
import { buildAuthAuditEvent } from '../../events';
import { AuthService } from '../../services/auth.service';

import type { NodePgDatabase } from '@package/db-core';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@CommandHandler(ChangeMyPasswordCommand)
@Injectable()
export class ChangeMyPasswordHandler implements ICommandHandler<ChangeMyPasswordCommand> {
  constructor(
    private readonly authService: AuthService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: ChangeMyPasswordCommand): Promise<void> {
    const userIdNum = Number(command.userId);
    if (Number.isNaN(userIdNum) || userIdNum <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'positive integer'
      });
    }

    const currentPassword = command.currentPassword.trim();
    const newPassword = command.newPassword.trim();
    const email = command.email?.trim();

    if (!currentPassword || !newPassword || !email) {
      throw Errors.validationinvalidValueFor002({
        field: 'password/email',
        expectedType: 'non-empty string'
      });
    }

    await this.authService.changeMyPassword(
      command.tenantId,
      userIdNum,
      email,
      currentPassword,
      newPassword
    );

    await this.auditOutbox.insert(
      this.db,
      buildAuthAuditEvent({
        eventType: 'auth.password.changed.audit',
        tenantId: command.tenantId,
        actorId: command.actorId,
        requestId: command.requestId,
        aggregateId: command.userId,
        action: 'CHANGE_PASSWORD',
        target: {
          entityType: 'user',
          entityId: command.userId
        },
        details: {
          passwordChangeMethod: 'authenticated_self_service'
        },
        correlationId: command.correlationId,
        causationId: command.causationId
      })
    );
  }
}
