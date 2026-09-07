import { ApiProperty } from '@nestjs/swagger';
import { EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM } from '@package/db-core';

export class EmailWebhookProcessingSummaryDto {
  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ example: 42 })
  declare totalEvents: number;

  @ApiProperty({ example: 30 })
  declare appliedEvents: number;

  @ApiProperty({ example: 5 })
  declare unmatchedEvents: number;

  @ApiProperty({ example: 3 })
  declare failedEvents: number;

  @ApiProperty({ example: 4 })
  declare pendingEvents: number;

  @ApiProperty({ example: 8 })
  declare retryableEvents: number;

  @ApiProperty({ example: '2026-03-17T09:59:59.000Z', required: false })
  declare latestReceivedAt?: string;
}

export class EmailWebhookEventItemDto {
  @ApiProperty({ example: 101 })
  declare id: number;

  @ApiProperty({ example: 'resend' })
  declare provider: string;

  @ApiProperty({ example: 'email.delivered' })
  declare providerEventType: string;

  @ApiProperty({ example: 'delivered' })
  declare normalizedEventType: string;

  @ApiProperty({ enum: EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM, example: 'applied' })
  declare processingStatus: (typeof EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM)[number];

  @ApiProperty({ example: 'verified' })
  declare verificationStatus: string;

  @ApiProperty({ example: 'msg_123', required: false })
  declare providerMessageId?: string;

  @ApiProperty({ example: 'delivery_123', required: false })
  declare providerDeliveryId?: string;

  @ApiProperty({ example: 'event_123', required: false })
  declare providerEventId?: string;

  @ApiProperty({ example: 77, required: false })
  declare organizationId?: number;

  @ApiProperty({ example: 'Acme Corp', required: false })
  declare organizationName?: string;

  @ApiProperty({ example: 55, required: false })
  declare emailMessageId?: number;

  @ApiProperty({ example: 66, required: false })
  declare emailProviderMessageId?: number;

  @ApiProperty({ example: 'delivered', required: false })
  declare messageStatus?: string;

  @ApiProperty({ example: 'delivered', required: false })
  declare latestProviderStatus?: string;

  @ApiProperty({ example: 'delivered', required: false })
  declare latestNormalizedProviderStatus?: string;

  @ApiProperty({ example: 'invitation', required: false })
  declare referenceType?: string;

  @ApiProperty({ example: 'invite-123', required: false })
  declare referenceId?: string;

  @ApiProperty({ example: 2 })
  declare attemptCount: number;

  @ApiProperty({ example: 'Webhook processing failed', required: false })
  declare processingError?: string;

  @ApiProperty({ example: '2026-03-17T09:58:00.000Z', required: false })
  declare occurredAt?: string;

  @ApiProperty({ example: '2026-03-17T09:59:00.000Z' })
  declare receivedAt: string;

  @ApiProperty({ example: '2026-03-17T09:59:01.000Z', required: false })
  declare processedAt?: string;
}

export class EmailWebhookEventListDto {
  @ApiProperty({ example: 1 })
  declare page: number;

  @ApiProperty({ example: 20 })
  declare pageSize: number;

  @ApiProperty({ example: 3 })
  declare total: number;

  @ApiProperty({ type: EmailWebhookEventItemDto, isArray: true })
  declare items: EmailWebhookEventItemDto[];
}

export class ReprocessEmailWebhookEventResultDto {
  @ApiProperty({ example: 101 })
  declare webhookEventId: number;

  @ApiProperty({ enum: EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM, example: 'applied' })
  declare processingStatus: (typeof EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM)[number];

  @ApiProperty({ example: 2 })
  declare attemptCount: number;

  @ApiProperty({ example: true })
  declare reprocessed: boolean;
}
