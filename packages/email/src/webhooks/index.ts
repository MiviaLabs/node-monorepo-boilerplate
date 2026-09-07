export type { IEmailWebhookProvider } from './email-webhook-provider.interface';
export type {
  EmailWebhookStoredHeaders,
  EmailWebhookVerificationRequest,
  IVerifyAndNormalizeEmailWebhookResult
} from './interfaces';
export type {
  EmailWebhookProviderName,
  NormalizedEmailEventType,
  SafeMetadataValue,
  VerifiedEmailWebhookEvent
} from './email-webhook.types';

export { EmailWebhookProviderRegistry } from './provider-registry';
export { ResendWebhookProvider } from './providers/resend-webhook-provider';
