import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EmailWebhookProviderRegistry } from '@package/email/webhooks';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { IngestEmailWebhookEventCommand } from '../../commands';
import { EmailWebhookEventRepository } from '../../repositories';
import { EmailWebhookProcessingService } from '../../services';

import type { IngestEmailWebhookEventResult } from '../../types/email-webhook.types';
import type { EmailWebhookEvent, NodePgDatabase } from '@package/db-core';
import type { IEmailWebhookProvider, VerifiedEmailWebhookEvent } from '@package/email/webhooks';

@Injectable()
@CommandHandler(IngestEmailWebhookEventCommand)
export class IngestEmailWebhookEventHandler implements ICommandHandler<
  IngestEmailWebhookEventCommand,
  IngestEmailWebhookEventResult
> {
  constructor(
    private readonly emailWebhookProviderRegistry: EmailWebhookProviderRegistry,
    private readonly emailWebhookEventRepository: EmailWebhookEventRepository,
    private readonly emailWebhookProcessingService: EmailWebhookProcessingService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: IngestEmailWebhookEventCommand): Promise<IngestEmailWebhookEventResult> {
    const provider = normalizeRequiredString(command.provider, 'provider');
    const { verifiedEvent, webhookProvider } = await this.verifyWebhook(provider, command);
    const receivedAt = new Date();
    const persisted: { event: EmailWebhookEvent; duplicate: boolean } = await this.db.transaction(
      async (tx) => {
        const existing = await this.emailWebhookEventRepository.findByDedupeKeyWithDatabase(
          tx,
          verifiedEvent.dedupeKey
        );

        if (existing) {
          return { event: existing, duplicate: true };
        }

        const rawPayload = isRecord(verifiedEvent.rawEvent)
          ? (verifiedEvent.rawEvent as Record<string, unknown>)
          : null;
        const created = await this.emailWebhookEventRepository.createIfAbsentWithDatabase(tx, {
          provider,
          dedupeKey: verifiedEvent.dedupeKey,
          providerEventId: verifiedEvent.providerEventId,
          providerDeliveryId: verifiedEvent.providerDeliveryId,
          providerMessageId: verifiedEvent.providerMessageId,
          providerEventType: verifiedEvent.providerEventType,
          normalizedEventType: verifiedEvent.normalizedEventType,
          verificationStatus: 'verified',
          processingStatus: 'persisted',
          attemptCount: 1,
          rawHeadersJson: webhookProvider.projectStoredHeaders(command.headers),
          tagsJson: verifiedEvent.tags,
          safeMetadataJson: verifiedEvent.safeMetadata,
          rawBody: command.rawBody,
          rawPayloadJson: rawPayload,
          contentType: command.contentType,
          occurredAt: normalizeOptionalDate(verifiedEvent.occurredAt),
          receivedAt,
          processedAt: null,
          requestId: command.requestId,
          correlationId: command.correlationId,
          causationId: command.causationId,
          createdAt: receivedAt,
          updatedAt: receivedAt
        });

        if (created) {
          return { event: created, duplicate: false };
        }

        const duplicate = await this.emailWebhookEventRepository.findByDedupeKeyWithDatabase(
          tx,
          verifiedEvent.dedupeKey
        );

        if (!duplicate) {
          throw new Error('Webhook event insert did not return a row and duplicate lookup failed');
        }

        return { event: duplicate, duplicate: true };
      }
    );

    if (persisted.duplicate && !isRetryableProcessingStatus(persisted.event.processingStatus)) {
      return this.buildDuplicateResult(persisted.event);
    }

    const processableEvent: EmailWebhookEvent | null = persisted.duplicate
      ? await this.claimDuplicateProcessableEvent(persisted.event.id)
      : persisted.event;

    if (!processableEvent) {
      const current = await this.emailWebhookEventRepository.findById(persisted.event.id);
      if (!current) {
        throw new Error(`Webhook event ${persisted.event.id} disappeared before reprocessing`);
      }

      return this.buildDuplicateResult(current);
    }

    try {
      const processed = await this.db.transaction((tx) =>
        this.emailWebhookProcessingService.processWithDatabase(
          tx,
          {
            id: processableEvent.id,
            provider: processableEvent.provider,
            providerEventId: processableEvent.providerEventId,
            providerDeliveryId: processableEvent.providerDeliveryId,
            providerMessageId: processableEvent.providerMessageId,
            normalizedEventType: processableEvent.normalizedEventType,
            tagsJson: processableEvent.tagsJson,
            occurredAt: processableEvent.occurredAt,
            verificationStatus: processableEvent.verificationStatus,
            providerEventType: processableEvent.providerEventType
          },
          receivedAt
        )
      );

      return {
        webhookEventId: processed.id,
        duplicate: persisted.duplicate,
        processingStatus: processed.processingStatus,
        verificationStatus: processed.verificationStatus,
        provider: processed.provider,
        providerEventType: processed.providerEventType,
        normalizedEventType: processed.normalizedEventType
      };
    } catch (error) {
      const failed = await this.db.transaction((tx) =>
        this.emailWebhookEventRepository.markFailedWithDatabase(tx, processableEvent.id, {
          processingError: this.emailWebhookProcessingService.sanitizeProcessingError(error),
          processedAt: receivedAt
        })
      );

      return {
        webhookEventId: failed.id,
        duplicate: persisted.duplicate,
        processingStatus: failed.processingStatus,
        verificationStatus: failed.verificationStatus,
        provider: failed.provider,
        providerEventType: failed.providerEventType,
        normalizedEventType: failed.normalizedEventType
      };
    }
  }

  private buildDuplicateResult(
    event: Pick<
      IngestEmailWebhookEventResult,
      'verificationStatus' | 'provider' | 'providerEventType' | 'normalizedEventType'
    > & { id: number }
  ): IngestEmailWebhookEventResult {
    return {
      webhookEventId: event.id,
      duplicate: true,
      processingStatus: 'duplicate',
      verificationStatus: event.verificationStatus,
      provider: event.provider,
      providerEventType: event.providerEventType,
      normalizedEventType: event.normalizedEventType
    };
  }

  private async claimDuplicateProcessableEvent(
    webhookEventId: number
  ): Promise<EmailWebhookEvent | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prepared = await this.db.transaction((tx) =>
        this.emailWebhookEventRepository.prepareForReprocessWithDatabase(tx, webhookEventId)
      );
      if (prepared) {
        return prepared;
      }

      const current = await this.emailWebhookEventRepository.findById(webhookEventId);
      if (!current) {
        throw new Error(`Webhook event ${webhookEventId} disappeared before reprocessing`);
      }

      if (!isRetryableProcessingStatus(current.processingStatus)) {
        return null;
      }
    }

    return null;
  }

  private async verifyWebhook(
    provider: string,
    command: IngestEmailWebhookEventCommand
  ): Promise<{
    verifiedEvent: VerifiedEmailWebhookEvent;
    webhookProvider: IEmailWebhookProvider;
  }> {
    const webhookProvider = this.emailWebhookProviderRegistry.get(provider);
    if (!webhookProvider) {
      throw Errors.validationinvalidValueFor002({
        field: 'provider',
        expectedType: 'supported email webhook provider'
      });
    }

    const result = await webhookProvider.verifyAndNormalizeWebhook({
      rawBody: command.rawBody,
      headers: command.headers
    });

    return {
      verifiedEvent: result.event,
      webhookProvider
    };
  }
}

function normalizeRequiredString(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    throw Errors.validationinvalidValueFor002({
      field,
      expectedType: 'non-empty string'
    });
  }

  return normalized;
}

function normalizeOptionalDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetryableProcessingStatus(
  status: IngestEmailWebhookEventResult['processingStatus']
): boolean {
  return status === 'failed' || status === 'persisted' || status === 'unmatched';
}
