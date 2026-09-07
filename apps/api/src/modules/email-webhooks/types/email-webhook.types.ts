import type {
  EmailWebhookProcessingStatus,
  EmailWebhookVerificationStatus,
  IEmailWebhookHeaders
} from '@package/db-core';

export interface IngestEmailWebhookEventInput {
  provider: string;
  dedupeKey: string;
  providerEventType: string;
  normalizedEventType: string;
  providerEventId?: string;
  providerDeliveryId?: string;
  providerMessageId?: string;
  occurredAt?: Date;
  receivedAt?: Date;
  headers?: IEmailWebhookHeaders;
  safeMetadata?: Record<string, unknown>;
  rawBody: Buffer;
  rawPayload?: Record<string, unknown>;
  contentType?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface IngestEmailWebhookEventResult {
  webhookEventId: number;
  duplicate: boolean;
  processingStatus: EmailWebhookProcessingStatus;
  verificationStatus: EmailWebhookVerificationStatus;
  provider: string;
  providerEventType: string;
  normalizedEventType: string;
}
