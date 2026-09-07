import type { VerifiedEmailWebhookEvent } from './email-webhook.types';

export interface EmailWebhookVerificationRequest {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface EmailWebhookStoredHeaders {
  [key: string]: string | string[] | undefined;
}

export interface IVerifyAndNormalizeEmailWebhookResult {
  event: VerifiedEmailWebhookEvent;
}
