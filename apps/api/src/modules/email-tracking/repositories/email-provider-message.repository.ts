import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  emailMessages,
  emailProviderMessages,
  eq,
  isNull,
  lte,
  or,
  type EmailProviderMessage,
  type NewEmailProviderMessage,
  type NodePgDatabase
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

@Injectable()
export class EmailProviderMessageRepository extends BaseRepository<
  EmailProviderMessage,
  NewEmailProviderMessage,
  Partial<NewEmailProviderMessage>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof emailProviderMessages {
    return emailProviderMessages;
  }

  protected getIdColumn(): typeof emailProviderMessages.id {
    return emailProviderMessages.id;
  }

  protected getTenantColumn(): typeof emailProviderMessages.organizationId {
    return emailProviderMessages.organizationId;
  }

  protected getEntityName(): string {
    return 'EmailProviderMessage';
  }

  async findByProviderMessageId(
    provider: string,
    providerMessageId: string
  ): Promise<EmailProviderMessage | null> {
    return this.findByProviderMessageIdWithDatabase(this.db, provider, providerMessageId);
  }

  async findByProviderMessageIdWithDatabase(
    database: NodePgDatabase,
    provider: string,
    providerMessageId: string
  ): Promise<EmailProviderMessage | null> {
    const [providerMessage] = await database
      .select()
      .from(emailProviderMessages)
      .where(
        and(
          eq(emailProviderMessages.provider, provider),
          eq(emailProviderMessages.providerMessageId, providerMessageId)
        )
      )
      .limit(1);

    return providerMessage ?? null;
  }

  async findByProviderDeliveryIdWithDatabase(
    database: NodePgDatabase,
    provider: string,
    providerDeliveryId: string
  ): Promise<EmailProviderMessage | null> {
    const [providerMessage] = await database
      .select()
      .from(emailProviderMessages)
      .where(
        and(
          eq(emailProviderMessages.provider, provider),
          eq(emailProviderMessages.providerDeliveryId, providerDeliveryId)
        )
      )
      .orderBy(desc(emailProviderMessages.updatedAt), desc(emailProviderMessages.id))
      .limit(1);

    return providerMessage ?? null;
  }

  async findByProviderEventIdWithDatabase(
    database: NodePgDatabase,
    provider: string,
    providerEventId: string
  ): Promise<EmailProviderMessage | null> {
    const [providerMessage] = await database
      .select()
      .from(emailProviderMessages)
      .where(
        and(
          eq(emailProviderMessages.provider, provider),
          eq(emailProviderMessages.providerEventId, providerEventId)
        )
      )
      .orderBy(desc(emailProviderMessages.updatedAt), desc(emailProviderMessages.id))
      .limit(1);

    return providerMessage ?? null;
  }

  async findCorrelatableByEmailMessagePublicIdWithDatabase(
    database: NodePgDatabase,
    provider: string,
    emailMessagePublicId: string
  ): Promise<EmailProviderMessage | null> {
    const providerMessages = await database
      .select({ providerMessage: emailProviderMessages })
      .from(emailProviderMessages)
      .innerJoin(emailMessages, eq(emailMessages.id, emailProviderMessages.emailMessageId))
      .where(
        and(
          eq(emailProviderMessages.provider, provider),
          eq(emailMessages.publicId, emailMessagePublicId)
        )
      )
      .orderBy(desc(emailProviderMessages.attemptNumber), desc(emailProviderMessages.id))
      .limit(2);

    return providerMessages.length === 1 ? (providerMessages[0]?.providerMessage ?? null) : null;
  }

  async findByEmailMessagePublicIdAndAttemptNumberWithDatabase(
    database: NodePgDatabase,
    provider: string,
    emailMessagePublicId: string,
    attemptNumber: number
  ): Promise<EmailProviderMessage | null> {
    const [providerMessage] = await database
      .select({ providerMessage: emailProviderMessages })
      .from(emailProviderMessages)
      .innerJoin(emailMessages, eq(emailMessages.id, emailProviderMessages.emailMessageId))
      .where(
        and(
          eq(emailProviderMessages.provider, provider),
          eq(emailMessages.publicId, emailMessagePublicId),
          eq(emailProviderMessages.attemptNumber, attemptNumber)
        )
      )
      .limit(1);

    return providerMessage?.providerMessage ?? null;
  }

  async touchWebhookReceiptWithDatabase(
    database: NodePgDatabase,
    id: number,
    update: {
      providerStatus?: string;
      normalizedStatus?: string;
      providerDeliveryId?: string;
      providerEventId?: string;
      lastWebhookOccurredAt: Date;
      lastWebhookAt: Date;
    }
  ): Promise<EmailProviderMessage> {
    const [updated] = await database
      .update(emailProviderMessages)
      .set({
        providerStatus: update.providerStatus,
        normalizedStatus: update.normalizedStatus,
        providerDeliveryId: update.providerDeliveryId,
        providerEventId: update.providerEventId,
        lastWebhookOccurredAt: update.lastWebhookOccurredAt,
        lastWebhookAt: update.lastWebhookAt,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(emailProviderMessages.id, id),
          or(
            isNull(emailProviderMessages.lastWebhookOccurredAt),
            lte(emailProviderMessages.lastWebhookOccurredAt, update.lastWebhookOccurredAt)
          )
        )
      )
      .returning();

    if (updated) {
      return updated;
    }

    const [existing] = await database
      .select()
      .from(emailProviderMessages)
      .where(eq(emailProviderMessages.id, id))
      .limit(1);

    if (!existing) {
      throw Errors.databaserecordNotFound004({ entity: 'EmailProviderMessage' });
    }

    return existing;
  }
}
