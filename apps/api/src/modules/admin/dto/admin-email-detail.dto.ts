import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdminEmailItemDto } from './admin-emails-overview.dto';

export class AdminEmailProviderAttemptDto {
  @ApiProperty({ example: 41 })
  declare id: number;

  @ApiProperty({ example: 'resend' })
  declare provider: string;

  @ApiProperty({ example: 1 })
  declare attemptNumber: number;

  @ApiPropertyOptional({ example: 'msg_123' })
  declare providerMessageId?: string;

  @ApiPropertyOptional({ example: 'delivery_123' })
  declare providerDeliveryId?: string;

  @ApiPropertyOptional({ example: 'evt_123' })
  declare providerEventId?: string;

  @ApiPropertyOptional({ example: 'delivered' })
  declare providerStatus?: string;

  @ApiPropertyOptional({ example: 'delivered' })
  declare normalizedProviderStatus?: string;

  @ApiPropertyOptional({ example: 'corr-123' })
  declare correlationId?: string;

  @ApiPropertyOptional({ example: '2026-03-17T09:58:00.000Z' })
  declare acceptedAt?: string;

  @ApiPropertyOptional({ example: '2026-03-17T09:59:01.000Z' })
  declare lastWebhookOccurredAt?: string;

  @ApiPropertyOptional({ example: '2026-03-17T09:59:02.000Z' })
  declare lastWebhookAt?: string;

  @ApiProperty({ example: '2026-03-17T09:58:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-17T09:59:02.000Z' })
  declare updatedAt: string;
}

export class AdminEmailRelatedWebhookEventDto {
  @ApiProperty({ example: 88 })
  declare id: number;

  @ApiProperty({ example: 'resend' })
  declare provider: string;

  @ApiProperty({ example: 'email.delivered' })
  declare providerEventType: string;

  @ApiProperty({ example: 'delivered' })
  declare normalizedEventType: string;

  @ApiProperty({ example: 'verified' })
  declare verificationStatus: string;

  @ApiProperty({ example: 'applied' })
  declare processingStatus: string;

  @ApiPropertyOptional({ example: 'msg_123' })
  declare providerMessageId?: string;

  @ApiPropertyOptional({ example: 'delivery_123' })
  declare providerDeliveryId?: string;

  @ApiPropertyOptional({ example: 'evt_123' })
  declare providerEventId?: string;

  @ApiPropertyOptional({ example: 41 })
  declare emailProviderMessageId?: number;

  @ApiProperty({ example: 1 })
  declare attemptCount: number;

  @ApiPropertyOptional({ example: 'Correlation failed' })
  declare processingError?: string;

  @ApiPropertyOptional({ example: '2026-03-17T09:59:01.000Z' })
  declare occurredAt?: string;

  @ApiProperty({ example: '2026-03-17T09:59:02.000Z' })
  declare receivedAt: string;

  @ApiPropertyOptional({ example: '2026-03-17T09:59:03.000Z' })
  declare processedAt?: string;
}

export class AdminEmailDetailDto {
  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminEmailItemDto })
  declare item: AdminEmailItemDto;

  @ApiProperty({ type: AdminEmailProviderAttemptDto, isArray: true })
  declare providerAttempts: AdminEmailProviderAttemptDto[];

  @ApiProperty({ type: AdminEmailRelatedWebhookEventDto, isArray: true })
  declare relatedWebhookEvents: AdminEmailRelatedWebhookEventDto[];
}
