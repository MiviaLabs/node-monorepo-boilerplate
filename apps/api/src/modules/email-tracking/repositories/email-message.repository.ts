import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  emailMessages,
  eq,
  type EmailMessage,
  type EmailMessageStatus,
  type NewEmailMessage,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

@Injectable()
export class EmailMessageRepository extends BaseRepository<
  EmailMessage,
  NewEmailMessage,
  Partial<NewEmailMessage>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof emailMessages {
    return emailMessages;
  }

  protected getIdColumn(): typeof emailMessages.id {
    return emailMessages.id;
  }

  protected getTenantColumn(): typeof emailMessages.organizationId {
    return emailMessages.organizationId;
  }

  protected getEntityName(): string {
    return 'EmailMessage';
  }

  async updateStatus(
    organizationId: number,
    emailMessageId: number,
    status: EmailMessageStatus,
    occurredAt: Date
  ): Promise<EmailMessage> {
    return this.updateStatusWithDatabase(
      this.db,
      organizationId,
      emailMessageId,
      status,
      occurredAt
    );
  }

  async updateStatusWithDatabase(
    database: NodePgDatabase,
    organizationId: number,
    emailMessageId: number,
    status: EmailMessageStatus,
    occurredAt: Date
  ): Promise<EmailMessage> {
    const current = await this.findByIdOrThrowWithDatabase(
      database,
      organizationId,
      emailMessageId
    );
    const nextStatus = getNextWebhookStatus(current.status, status);

    if (!nextStatus) {
      return current;
    }

    const updatePayload: Partial<NewEmailMessage> = {
      status: nextStatus,
      updatedAt: new Date()
    };

    if (nextStatus === 'accepted' && !current.acceptedAt) {
      updatePayload.acceptedAt = occurredAt;
    }

    if (nextStatus === 'delivered') {
      if (!current.acceptedAt) {
        updatePayload.acceptedAt = occurredAt;
      }
      if (!current.deliveredAt) {
        updatePayload.deliveredAt = occurredAt;
      }
    }

    if (
      (nextStatus === 'failed' || nextStatus === 'bounced' || nextStatus === 'complained') &&
      !current.failedAt
    ) {
      updatePayload.failedAt = occurredAt;
    }

    const [updated] = await database
      .update(emailMessages)
      .set(updatePayload)
      .where(
        and(eq(emailMessages.organizationId, organizationId), eq(emailMessages.id, emailMessageId))
      )
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'EmailMessage' });
    }

    return updated;
  }

  private async findByIdOrThrowWithDatabase(
    database: NodePgDatabase,
    organizationId: number,
    emailMessageId: number
  ): Promise<EmailMessage> {
    const [entity] = await database
      .select()
      .from(emailMessages)
      .where(
        and(eq(emailMessages.organizationId, organizationId), eq(emailMessages.id, emailMessageId))
      )
      .limit(1);

    if (!entity) {
      throw Errors.databaserecordNotFound004({ entity: this.getEntityName() });
    }

    return entity;
  }
}

// eslint-disable-next-line complexity
function getNextWebhookStatus(
  currentStatus: EmailMessageStatus,
  incomingStatus: EmailMessageStatus
): EmailMessageStatus | null {
  switch (incomingStatus) {
    case 'accepted':
      return currentStatus === 'pending' ? 'accepted' : null;
    case 'delivered':
      return currentStatus === 'pending' || currentStatus === 'accepted' ? 'delivered' : null;
    case 'bounced':
      return currentStatus === 'pending' || currentStatus === 'accepted' ? 'bounced' : null;
    case 'complained':
      return currentStatus === 'pending' ||
        currentStatus === 'accepted' ||
        currentStatus === 'delivered'
        ? 'complained'
        : null;
    case 'failed':
      return currentStatus === 'pending' || currentStatus === 'accepted' ? 'failed' : null;
    default:
      return null;
  }
}
