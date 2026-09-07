import { Resend } from 'resend';
import { createHash } from 'crypto';

import type { IEmailWebhookProvider } from '../email-webhook-provider.interface';
import type { NormalizedEmailEventType, VerifiedEmailWebhookEvent } from '../email-webhook.types';
import type {
  EmailWebhookStoredHeaders,
  EmailWebhookVerificationRequest,
  IVerifyAndNormalizeEmailWebhookResult
} from '../interfaces';

type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type ResendWebhookProviderConfig = {
  webhookSecret: string;
};

type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

type ResendEmailEventData = {
  email_id?: string;
  created_at?: string;
  tags?: Record<string, string>;
  broadcast_id?: string;
  template_id?: string;
  bounce?: {
    type?: string;
    subType?: string;
    message?: string;
  };
  failed?: {
    reason?: string;
  };
  suppressed?: {
    type?: string;
    message?: string;
  };
  click?: {
    timestamp?: string;
  };
  attachments?: unknown[];
  [key: string]: unknown;
};

const RESEND_EVENT_TYPE_MAP: Record<string, NormalizedEmailEventType> = {
  'email.scheduled': 'queued',
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.received': 'received',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.suppressed': 'suppressed'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const directValue = headers[key];
  if (typeof directValue === 'string') {
    return directValue;
  }

  if (Array.isArray(directValue)) {
    return directValue[0];
  }

  const lowerKey = key.toLowerCase();
  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (headerKey.toLowerCase() !== lowerKey) {
      continue;
    }

    if (typeof headerValue === 'string') {
      return headerValue;
    }

    if (Array.isArray(headerValue)) {
      return headerValue[0];
    }
  }

  return undefined;
}

function extractSvixHeaders(
  headers: Record<string, string | string[] | undefined>
): ResendWebhookHeaders {
  const svixId = getHeaderValue(headers, 'svix-id');
  const svixTimestamp = getHeaderValue(headers, 'svix-timestamp');
  const svixSignature = getHeaderValue(headers, 'svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error('Missing required Resend webhook signature headers');
  }

  return {
    id: svixId,
    timestamp: svixTimestamp,
    signature: svixSignature
  };
}

function parseWebhookPayload(payload: unknown): ResendWebhookPayload {
  if (!isRecord(payload) || typeof payload['type'] !== 'string') {
    throw new Error('Resend webhook payload is missing a string event type');
  }

  const type = payload['type'];
  const data = isRecord(payload['data']) ? payload['data'] : undefined;
  const createdAt = typeof payload['created_at'] === 'string' ? payload['created_at'] : undefined;

  return {
    ...payload,
    type,
    created_at: createdAt,
    data
  };
}

function extractSafeMetadata(
  providerEventType: string,
  data: ResendEmailEventData | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!data) {
    return undefined;
  }

  const safeMetadata: Record<string, string | number | boolean | null> = {};

  if (typeof data.broadcast_id === 'string') {
    safeMetadata['broadcastId'] = data.broadcast_id;
  }

  if (typeof data.template_id === 'string') {
    safeMetadata['templateId'] = data.template_id;
  }

  if (providerEventType === 'email.bounced' && isRecord(data.bounce)) {
    if (typeof data.bounce.type === 'string') {
      safeMetadata['bounceType'] = data.bounce.type;
    }

    if (typeof data.bounce.subType === 'string') {
      safeMetadata['bounceSubType'] = data.bounce.subType;
    }
  }

  if (providerEventType === 'email.failed' && isRecord(data.failed)) {
    if (typeof data.failed.reason === 'string') {
      safeMetadata['failureReason'] = data.failed.reason;
    }
  }

  if (providerEventType === 'email.suppressed' && isRecord(data.suppressed)) {
    if (typeof data.suppressed.type === 'string') {
      safeMetadata['suppressionType'] = data.suppressed.type;
    }
  }

  if (providerEventType === 'email.received' && Array.isArray(data.attachments)) {
    safeMetadata['attachmentCount'] = data.attachments.length;
  }

  return Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined;
}

function extractAttributes(
  providerEventType: string,
  data: ResendEmailEventData | undefined
): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  if (providerEventType === 'email.clicked' && isRecord(data.click)) {
    const clickTimestamp =
      typeof data.click.timestamp === 'string' ? data.click.timestamp : undefined;
    return clickTimestamp ? { clickTimestamp } : undefined;
  }

  return undefined;
}

function extractProviderMessageId(data: ResendEmailEventData | undefined): string | undefined {
  if (!data || typeof data.email_id !== 'string' || data.email_id.length === 0) {
    return undefined;
  }

  return data.email_id;
}

function extractTags(data: ResendEmailEventData | undefined): Record<string, string> | undefined {
  if (!data || !isRecord(data.tags)) {
    return undefined;
  }

  const tags = Object.entries(data.tags).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') {
      acc[key] = value;
    }

    return acc;
  }, {});

  return Object.keys(tags).length > 0 ? tags : undefined;
}

export class ResendWebhookProvider implements IEmailWebhookProvider {
  readonly provider = 'resend' as const;
  private readonly resendClient: Resend;
  private readonly webhookSecret: string;

  constructor(config: ResendWebhookProviderConfig) {
    if (!config.webhookSecret || config.webhookSecret.trim().length === 0) {
      throw new Error('Resend webhook secret is required');
    }

    this.webhookSecret = config.webhookSecret;
    this.resendClient = new Resend('re_webhook_verifier');
  }

  async verifyAndNormalizeWebhook(
    request: EmailWebhookVerificationRequest
  ): Promise<IVerifyAndNormalizeEmailWebhookResult> {
    const signatureHeaders = extractSvixHeaders(request.headers);
    const verifiedPayload = this.resendClient.webhooks.verify({
      payload:
        typeof request.rawBody === 'string' ? request.rawBody : request.rawBody.toString('utf8'),
      headers: signatureHeaders,
      webhookSecret: this.webhookSecret
    });
    const parsedPayload = parseWebhookPayload(verifiedPayload);
    const providerDeliveryId = signatureHeaders.id;
    if (!providerDeliveryId) {
      throw new Error('Missing required Resend webhook event identifier');
    }

    return {
      event: this.normalizePayload(parsedPayload, providerDeliveryId)
    };
  }

  projectStoredHeaders(
    headers: Record<string, string | string[] | undefined>
  ): EmailWebhookStoredHeaders {
    const storedHeaders: EmailWebhookStoredHeaders = {};
    const allowedHeaders = ['content-type', 'user-agent', 'svix-id', 'svix-timestamp'];

    for (const headerName of allowedHeaders) {
      const headerValue = getHeaderValue(headers, headerName);
      if (headerValue) {
        storedHeaders[headerName] = headerValue;
      }
    }

    return storedHeaders;
  }

  private normalizePayload(
    payload: ResendWebhookPayload,
    providerDeliveryId: string
  ): VerifiedEmailWebhookEvent {
    const data = payload.data as ResendEmailEventData | undefined;
    const providerMessageId = extractProviderMessageId(data);
    const occurredAt =
      payload.created_at ??
      (data && typeof data.created_at === 'string' ? data.created_at : undefined);

    return {
      provider: this.provider,
      providerEventType: payload.type,
      normalizedEventType: RESEND_EVENT_TYPE_MAP[payload.type] ?? 'unknown',
      dedupeKey: buildDedupeKey(payload),
      providerDeliveryId,
      providerMessageId,
      occurredAt,
      attributes: extractAttributes(payload.type, data),
      tags: extractTags(data),
      safeMetadata: extractSafeMetadata(payload.type, data),
      rawEvent: payload
    };
  }
}

function buildDedupeKey(payload: ResendWebhookPayload): string {
  const canonicalPayload = canonicalizeValue(payload);
  const digest = createHash('sha256').update(canonicalPayload).digest('hex');
  return `resend:event:${digest}`;
}

function canonicalizeValue(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeValue(record[key])}`);

  return `{${entries.join(',')}}`;
}
