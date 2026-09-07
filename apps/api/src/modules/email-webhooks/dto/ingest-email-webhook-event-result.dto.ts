import { ApiProperty } from '@nestjs/swagger';

import type { IngestEmailWebhookEventResult } from '../types/email-webhook.types';

export class IngestEmailWebhookEventResultDto implements IngestEmailWebhookEventResult {
  @ApiProperty()
  webhookEventId!: number;

  @ApiProperty()
  duplicate!: boolean;

  @ApiProperty({ example: 'persisted' })
  processingStatus!: IngestEmailWebhookEventResult['processingStatus'];

  @ApiProperty({ example: 'verified' })
  verificationStatus!: IngestEmailWebhookEventResult['verificationStatus'];

  @ApiProperty({ example: 'resend' })
  provider!: string;

  @ApiProperty({ example: 'email.delivered' })
  providerEventType!: string;

  @ApiProperty({ example: 'delivered' })
  normalizedEventType!: string;
}
