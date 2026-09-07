export type EmailWebhookProviderName = 'resend' | 'sendgrid' | 'mailgun' | 'ses' | (string & {});

// String union on purpose: this is a serialized wire type crossing service
// boundaries; a const enum would break under single-file transpilers (swc/tsx).
// eslint-disable-next-line local-rules/prefer-const-enum
export type NormalizedEmailEventType =
  | 'queued'
  | 'processed'
  | 'sent'
  | 'delivered'
  | 'deferred'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'failed'
  | 'dropped'
  | 'rejected'
  | 'received'
  | 'suppressed'
  | 'unknown';

export type SafeMetadataValue = string | number | boolean | null;

export interface VerifiedEmailWebhookEvent {
  provider: EmailWebhookProviderName;
  providerEventType: string;
  normalizedEventType: NormalizedEmailEventType;
  dedupeKey: string;
  providerEventId?: string;
  providerDeliveryId?: string;
  providerMessageId?: string;
  occurredAt?: string;
  attributes?: Record<string, unknown>;
  tags?: Record<string, string>;
  headers?: Record<string, string>;
  safeMetadata?: Record<string, SafeMetadataValue>;
  rawEvent: unknown;
}
