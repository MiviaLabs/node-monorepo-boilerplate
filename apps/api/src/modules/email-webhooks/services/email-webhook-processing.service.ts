import { Injectable } from '@nestjs/common';

import {
  EmailMessageRepository,
  EmailProviderMessageRepository
} from '../../email-tracking/repositories';
import { EmailWebhookEventRepository } from '../repositories';

import type { EmailProviderMessage, EmailWebhookEvent, NodePgDatabase } from '@package/db-core';

@Injectable()
export class EmailWebhookProcessingService {
  constructor(
    private readonly emailWebhookEventRepository: EmailWebhookEventRepository,
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly emailProviderMessageRepository: EmailProviderMessageRepository
  ) {}

  async processWithDatabase(
    tx: NodePgDatabase,
    webhookEvent: Pick<
      EmailWebhookEvent,
      | 'id'
      | 'provider'
      | 'providerEventType'
      | 'normalizedEventType'
      | 'verificationStatus'
      | 'providerEventId'
      | 'providerDeliveryId'
      | 'providerMessageId'
      | 'tagsJson'
      | 'occurredAt'
    >,
    processedAt: Date
  ): Promise<EmailWebhookEvent> {
    const providerMessage = await this.resolveProviderMessage(tx, webhookEvent);

    if (!providerMessage) {
      return this.emailWebhookEventRepository.updateProcessingWithDatabase(tx, webhookEvent.id, {
        processingStatus: 'unmatched',
        processedAt,
        processingError: null
      });
    }

    await this.emailProviderMessageRepository.touchWebhookReceiptWithDatabase(
      tx,
      providerMessage.id,
      {
        providerStatus: webhookEvent.providerEventType,
        normalizedStatus: webhookEvent.normalizedEventType,
        providerDeliveryId: webhookEvent.providerDeliveryId ?? undefined,
        providerEventId: webhookEvent.providerEventId ?? undefined,
        lastWebhookOccurredAt: webhookEvent.occurredAt ?? processedAt,
        lastWebhookAt: processedAt
      }
    );

    const nextMessageStatus = mapNormalizedEventToMessageStatus(webhookEvent.normalizedEventType);
    if (nextMessageStatus) {
      await this.emailMessageRepository.updateStatusWithDatabase(
        tx,
        providerMessage.organizationId,
        providerMessage.emailMessageId,
        nextMessageStatus,
        webhookEvent.occurredAt ?? processedAt
      );
    }

    return this.emailWebhookEventRepository.updateProcessingWithDatabase(tx, webhookEvent.id, {
      organizationId: providerMessage.organizationId,
      emailMessageId: providerMessage.emailMessageId,
      emailProviderMessageId: providerMessage.id,
      processingStatus: 'applied',
      processedAt,
      processingError: null
    });
  }

  sanitizeProcessingError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    return message.slice(0, 512);
  }

  private async resolveProviderMessage(
    tx: NodePgDatabase,
    webhookEvent: Pick<
      EmailWebhookEvent,
      'provider' | 'providerEventId' | 'providerDeliveryId' | 'providerMessageId' | 'tagsJson'
    >
  ): Promise<EmailProviderMessage | null> {
    if (webhookEvent.providerMessageId) {
      const providerMessage =
        await this.emailProviderMessageRepository.findByProviderMessageIdWithDatabase(
          tx,
          webhookEvent.provider,
          webhookEvent.providerMessageId
        );
      if (providerMessage) {
        return providerMessage;
      }
    }

    if (webhookEvent.providerDeliveryId) {
      const providerMessage =
        await this.emailProviderMessageRepository.findByProviderDeliveryIdWithDatabase(
          tx,
          webhookEvent.provider,
          webhookEvent.providerDeliveryId
        );
      if (providerMessage) {
        return providerMessage;
      }
    }

    if (webhookEvent.providerEventId) {
      const providerMessage =
        await this.emailProviderMessageRepository.findByProviderEventIdWithDatabase(
          tx,
          webhookEvent.provider,
          webhookEvent.providerEventId
        );
      if (providerMessage) {
        return providerMessage;
      }
    }

    const emailMessagePublicId = extractEmailMessagePublicId(webhookEvent.tagsJson);
    if (emailMessagePublicId) {
      const providerAttemptNumber = extractProviderAttemptNumber(webhookEvent.tagsJson);
      if (providerAttemptNumber) {
        const providerMessage =
          await this.emailProviderMessageRepository.findByEmailMessagePublicIdAndAttemptNumberWithDatabase(
            tx,
            webhookEvent.provider,
            emailMessagePublicId,
            providerAttemptNumber
          );
        if (providerMessage) {
          return providerMessage;
        }
      }

      return this.emailProviderMessageRepository.findCorrelatableByEmailMessagePublicIdWithDatabase(
        tx,
        webhookEvent.provider,
        emailMessagePublicId
      );
    }

    return null;
  }
}

function mapNormalizedEventToMessageStatus(
  normalizedEventType: string
): 'accepted' | 'delivered' | 'bounced' | 'complained' | 'failed' | null {
  switch (normalizedEventType) {
    case 'sent':
      return 'accepted';
    case 'delivered':
      return 'delivered';
    case 'bounced':
      return 'bounced';
    case 'complained':
      return 'complained';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

function extractEmailMessagePublicId(
  tags: Record<string, string> | null | undefined
): string | undefined {
  const emailMessageId = tags?.['email_message_id'];
  return typeof emailMessageId === 'string' && emailMessageId.length > 0
    ? emailMessageId
    : undefined;
}

function extractProviderAttemptNumber(
  tags: Record<string, string> | null | undefined
): number | undefined {
  const attempt = tags?.['email_provider_attempt'];
  if (!attempt) {
    return undefined;
  }

  const parsed = Number.parseInt(attempt, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
