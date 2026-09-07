import type { IEmailWebhookProvider } from '../../email-webhook-provider.interface';
import type {
  NormalizedEmailEventType,
  VerifiedEmailWebhookEvent
} from '../../email-webhook.types';
import type {
  EmailWebhookStoredHeaders,
  EmailWebhookVerificationRequest,
  IVerifyAndNormalizeEmailWebhookResult
} from '../../interfaces';

type MockWebhookPayload = {
  event: string;
  eventId: string;
  messageId?: string;
  occurredAt?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export class MockWebhookProvider implements IEmailWebhookProvider {
  readonly provider = 'mock-provider' as const;

  constructor(private readonly secret: string) {}

  async verifyAndNormalizeWebhook(
    request: EmailWebhookVerificationRequest
  ): Promise<IVerifyAndNormalizeEmailWebhookResult> {
    const signature = getSingleHeader(request.headers, 'x-mock-signature');
    if (signature !== this.secret) {
      throw new Error('Invalid mock webhook signature');
    }

    const payload = parsePayload(request.rawBody);
    return {
      event: this.normalizePayload(payload)
    };
  }

  projectStoredHeaders(
    headers: Record<string, string | string[] | undefined>
  ): EmailWebhookStoredHeaders {
    const storedHeaders: EmailWebhookStoredHeaders = {};
    const allowedHeaders = ['content-type', 'x-mock-request-id'];

    for (const headerName of allowedHeaders) {
      const value = getSingleHeader(headers, headerName);
      if (value) {
        storedHeaders[headerName] = value;
      }
    }

    return storedHeaders;
  }

  private normalizePayload(payload: MockWebhookPayload): VerifiedEmailWebhookEvent {
    const normalizedEventType: NormalizedEmailEventType =
      payload.event === 'message.delivered' ? 'delivered' : 'unknown';

    return {
      provider: this.provider,
      providerEventType: payload.event,
      normalizedEventType,
      dedupeKey: `${this.provider}:event:${payload.eventId}`,
      providerEventId: payload.eventId,
      providerMessageId: payload.messageId,
      occurredAt: payload.occurredAt,
      tags: payload.tags,
      safeMetadata: extractSafeMetadata(payload.metadata),
      rawEvent: payload
    };
  }
}

export function createMockWebhookRequest(
  payload: MockWebhookPayload,
  secret: string
): EmailWebhookVerificationRequest {
  return {
    rawBody: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
      'x-mock-signature': secret,
      'x-mock-request-id': payload.eventId
    }
  };
}

function parsePayload(rawBody: string | Buffer): MockWebhookPayload {
  const parsed = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
  if (
    !isRecord(parsed) ||
    typeof parsed['event'] !== 'string' ||
    typeof parsed['eventId'] !== 'string'
  ) {
    throw new Error('Mock webhook payload is missing required event fields');
  }

  const tags =
    isRecord(parsed['tags']) &&
    Object.values(parsed['tags']).every((value) => typeof value === 'string')
      ? (parsed['tags'] as Record<string, string>)
      : undefined;

  return {
    event: parsed['event'],
    eventId: parsed['eventId'],
    messageId: typeof parsed['messageId'] === 'string' ? parsed['messageId'] : undefined,
    occurredAt: typeof parsed['occurredAt'] === 'string' ? parsed['occurredAt'] : undefined,
    tags,
    metadata: isRecord(parsed['metadata']) ? parsed['metadata'] : undefined
  };
}

function extractSafeMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) {
    return undefined;
  }

  const safeMetadata = Object.entries(metadata).reduce<
    Record<string, string | number | boolean | null>
  >((acc, [key, value]) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      acc[key] = value;
    }

    return acc;
  }, {});

  return Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined;
}

function getSingleHeader(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
