import { ApiProperty } from '@nestjs/swagger';

import {
  AdminEmailMetricDto,
  AdminEmailOverviewSummaryDto
} from './admin-email-summary.dto';
import { AdminPaginationDto } from './admin-pagination.dto';

export const ADMIN_EMAIL_WEBHOOK_ATTENTION_STATE_VALUES = ['clear', 'attention'] as const;

export class AdminEmailSafeMetadataSummaryDto {
  @ApiProperty({ example: 'tenant.invitation', required: false })
  declare templateKey?: string;

  @ApiProperty({ example: 2, required: false })
  declare tagCount?: number;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['x-request-id', 'x-correlation-id']
  })
  declare headerKeys?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    example: ['region', 'templateVersion']
  })
  declare providerHintKeys?: string[];
}

export class AdminEmailItemDto {
  @ApiProperty({ example: 77 })
  declare emailMessageId: number;

  @ApiProperty({ example: 'c8d20397-8c39-4c8d-a4e2-eaf7af90ff64' })
  declare publicId: string;

  @ApiProperty({ example: 12 })
  declare organizationId: number;

  @ApiProperty({ example: 'Acme Corp' })
  declare organizationName: string;

  @ApiProperty({ example: 'invitation', required: false })
  declare referenceType?: string;

  @ApiProperty({ example: 'invite-123', required: false })
  declare referenceId?: string;

  @ApiProperty({ example: 'You were invited to Acme Corp', required: false })
  declare subject?: string;

  @ApiProperty({ example: 'delivered' })
  declare messageStatus: string;

  @ApiProperty({ example: 'resend', required: false })
  declare provider?: string;

  @ApiProperty({ example: 1, required: false })
  declare attemptNumber?: number;

  @ApiProperty({ example: 'msg_123', required: false })
  declare providerMessageId?: string;

  @ApiProperty({ example: 'delivery_123', required: false })
  declare providerDeliveryId?: string;

  @ApiProperty({ example: 'evt_123', required: false })
  declare providerEventId?: string;

  @ApiProperty({ example: 'delivered', required: false })
  declare providerStatus?: string;

  @ApiProperty({ example: 'delivered', required: false })
  declare normalizedProviderStatus?: string;

  @ApiProperty({ example: '2026-03-17T09:58:00.000Z', required: false })
  declare acceptedAt?: string;

  @ApiProperty({ example: '2026-03-17T09:59:00.000Z', required: false })
  declare deliveredAt?: string;

  @ApiProperty({ example: '2026-03-17T09:59:30.000Z', required: false })
  declare failedAt?: string;

  @ApiProperty({ example: '2026-03-17T09:59:31.000Z', required: false })
  declare lastWebhookOccurredAt?: string;

  @ApiProperty({ example: '2026-03-17T09:59:32.000Z', required: false })
  declare lastWebhookAt?: string;

  @ApiProperty({ example: 1 })
  declare failedWebhookCount: number;

  @ApiProperty({ example: 0 })
  declare unmatchedWebhookCount: number;

  @ApiProperty({ example: 'failed', required: false })
  declare latestWebhookProcessingStatus?: string;

  @ApiProperty({
    enum: ADMIN_EMAIL_WEBHOOK_ATTENTION_STATE_VALUES,
    example: 'attention'
  })
  declare webhookAttentionState: (typeof ADMIN_EMAIL_WEBHOOK_ATTENTION_STATE_VALUES)[number];

  @ApiProperty({ example: 'corr-123', required: false })
  declare correlationId?: string;

  @ApiProperty({ type: AdminEmailSafeMetadataSummaryDto, required: false })
  declare safeMetadataSummary?: AdminEmailSafeMetadataSummaryDto;
}

export class AdminEmailsOverviewDto {
  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminEmailMetricDto, isArray: true })
  declare metrics: AdminEmailMetricDto[];

  @ApiProperty({ type: AdminEmailOverviewSummaryDto })
  declare summary: AdminEmailOverviewSummaryDto;

  @ApiProperty({ type: AdminEmailItemDto, isArray: true })
  declare items: AdminEmailItemDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare pagination: AdminPaginationDto;
}
