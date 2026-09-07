import { BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { ReprocessEmailWebhookEventCommand } from '../../commands';
import { EmailWebhookEventRepository } from '../../repositories';
import { EmailWebhookProcessingService } from '../../services';

import type { ReprocessEmailWebhookEventResultDto } from '../../dto/email-webhook-operations.dto';
import type { EmailWebhookEvent, NodePgDatabase } from '@package/db-core';

const REPROCESSABLE_STATUSES = new Set(['failed', 'unmatched', 'persisted']);

@CommandHandler(ReprocessEmailWebhookEventCommand)
export class ReprocessEmailWebhookEventHandler implements ICommandHandler<
  ReprocessEmailWebhookEventCommand,
  ReprocessEmailWebhookEventResultDto
> {
  constructor(
    private readonly emailWebhookEventRepository: EmailWebhookEventRepository,
    private readonly emailWebhookProcessingService: EmailWebhookProcessingService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    command: ReprocessEmailWebhookEventCommand
  ): Promise<ReprocessEmailWebhookEventResultDto> {
    const existing = await this.emailWebhookEventRepository.findById(command.webhookEventId);
    if (!existing) {
      throw new NotFoundException(`Email webhook event ${command.webhookEventId} not found`);
    }

    if (existing.verificationStatus !== 'verified') {
      throw new BadRequestException('Only verified webhook events can be reprocessed');
    }

    if (!REPROCESSABLE_STATUSES.has(existing.processingStatus)) {
      throw new BadRequestException(
        `Webhook event ${command.webhookEventId} is not eligible for reprocessing`
      );
    }

    let prepared = await this.db.transaction((tx) =>
      this.emailWebhookEventRepository.prepareForReprocessWithDatabase(tx, existing.id)
    );
    if (!prepared) {
      const current = await this.reclaimIfRetryable(command.webhookEventId);
      if (!current) {
        throw new NotFoundException(`Email webhook event ${command.webhookEventId} not found`);
      }

      if (current.processingStatus === 'received') {
        prepared = current;
      } else {
        if (current.verificationStatus !== 'verified') {
          throw new BadRequestException('Only verified webhook events can be reprocessed');
        }

        if (REPROCESSABLE_STATUSES.has(current.processingStatus)) {
          throw new BadRequestException(
            `Webhook event ${command.webhookEventId} is currently being reprocessed`
          );
        }

        throw new BadRequestException(
          `Webhook event ${command.webhookEventId} is not eligible for reprocessing`
        );
      }
    }

    const processedAt = new Date();

    try {
      const finalRecord = await this.db.transaction((tx) =>
        this.emailWebhookProcessingService.processWithDatabase(
          tx,
          {
            id: prepared.id,
            provider: prepared.provider,
            providerEventId: prepared.providerEventId,
            providerDeliveryId: prepared.providerDeliveryId,
            providerMessageId: prepared.providerMessageId,
            normalizedEventType: prepared.normalizedEventType,
            tagsJson: prepared.tagsJson,
            occurredAt: prepared.occurredAt,
            verificationStatus: prepared.verificationStatus,
            providerEventType: prepared.providerEventType
          },
          processedAt
        )
      );
      const refreshed = await this.emailWebhookEventRepository.findById(finalRecord.id);

      return {
        webhookEventId: finalRecord.id,
        processingStatus: finalRecord.processingStatus,
        attemptCount: refreshed?.attemptCount ?? prepared.attemptCount,
        reprocessed: true
      };
    } catch (error) {
      const failed = await this.db.transaction((tx) =>
        this.emailWebhookEventRepository.markFailedWithDatabase(tx, prepared.id, {
          processingError: this.emailWebhookProcessingService.sanitizeProcessingError(error),
          processedAt
        })
      );

      return {
        webhookEventId: failed.id,
        processingStatus: failed.processingStatus,
        attemptCount: failed.attemptCount,
        reprocessed: true
      };
    }
  }

  private async reclaimIfRetryable(webhookEventId: number): Promise<EmailWebhookEvent | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.emailWebhookEventRepository.findById(webhookEventId);
      if (current?.verificationStatus !== 'verified') {
        return current;
      }

      if (!REPROCESSABLE_STATUSES.has(current.processingStatus)) {
        return current;
      }

      const prepared = await this.db.transaction((tx) =>
        this.emailWebhookEventRepository.prepareForReprocessWithDatabase(tx, webhookEventId)
      );
      if (prepared) {
        return prepared;
      }
    }

    return this.emailWebhookEventRepository.findById(webhookEventId);
  }
}
