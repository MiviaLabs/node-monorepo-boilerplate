import { Webhook } from 'svix';
import { createHash } from 'crypto';

import { ResendWebhookProvider } from '../providers/resend-webhook-provider';
import { runWebhookProviderConformanceSuite } from './provider-conformance.shared';

const webhookSecret = `whsec_${Buffer.from('test_secret').toString('base64')}`;
const otherWebhookSecret = `whsec_${Buffer.from('other_secret').toString('base64')}`;

function signPayload(secret: string, payload: string, messageId = 'msg_test_123') {
  const webhook = new Webhook(secret);
  const timestamp = new Date();

  return {
    headers: {
      'svix-id': messageId,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': webhook.sign(messageId, timestamp, payload)
    }
  };
}

runWebhookProviderConformanceSuite({
  name: 'Resend',
  createProvider: () => new ResendWebhookProvider({ webhookSecret }),
  createValidRequest: () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_contract_1'
      }
    });

    return {
      rawBody: payload,
      headers: {
        ...signPayload(webhookSecret, payload, 'msg_contract_valid').headers,
        'content-type': 'application/json',
        'user-agent': 'resend-webhooks/1.0'
      }
    };
  },
  createUnknownEventRequest: () => {
    const payload = JSON.stringify({
      type: 'domain.updated',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_contract_unknown'
      }
    });

    return {
      rawBody: payload,
      headers: {
        ...signPayload(webhookSecret, payload, 'msg_contract_unknown').headers,
        'content-type': 'application/json',
        'user-agent': 'resend-webhooks/1.0'
      }
    };
  },
  createInvalidSignatureRequest: () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_contract_invalid'
      }
    });

    return {
      rawBody: payload,
      headers: {
        ...signPayload(otherWebhookSecret, payload, 'msg_contract_invalid').headers,
        'content-type': 'application/json'
      }
    };
  },
  expected: {
    provider: 'resend',
    providerEventType: 'email.delivered',
    normalizedEventType: 'delivered',
    dedupeKey: hashDedupeKey({
      type: 'email.delivered',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_contract_1'
      }
    }),
    storedHeaders: {
      'content-type': 'application/json',
      'user-agent': 'resend-webhooks/1.0',
      'svix-id': 'msg_contract_valid',
      'svix-timestamp': expect.any(String)
    }
  }
});

describe('ResendWebhookProvider', () => {
  it('verifies and normalizes a delivered event', async () => {
    const provider = new ResendWebhookProvider({ webhookSecret });
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_123',
        created_at: '2026-03-17T09:24:00.000Z',
        from: 'sender@example.com',
        to: ['user@example.com'],
        subject: 'Welcome',
        tags: {
          tenantId: 'tenant_123',
          campaign: 'welcome'
        },
        broadcast_id: 'broadcast_123',
        template_id: 'template_456'
      }
    });
    const { headers } = signPayload(webhookSecret, payload, 'msg_delivered_1');

    const result = await provider.verifyAndNormalizeWebhook({
      rawBody: payload,
      headers
    });

    expect(result.event).toEqual({
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      dedupeKey: hashDedupeKey({
        type: 'email.delivered',
        created_at: '2026-03-17T09:25:00.000Z',
        data: {
          email_id: 'email_123',
          created_at: '2026-03-17T09:24:00.000Z',
          from: 'sender@example.com',
          to: ['user@example.com'],
          subject: 'Welcome',
          tags: {
            tenantId: 'tenant_123',
            campaign: 'welcome'
          },
          broadcast_id: 'broadcast_123',
          template_id: 'template_456'
        }
      }),
      providerDeliveryId: 'msg_delivered_1',
      providerMessageId: 'email_123',
      occurredAt: '2026-03-17T09:25:00.000Z',
      tags: {
        tenantId: 'tenant_123',
        campaign: 'welcome'
      },
      safeMetadata: {
        broadcastId: 'broadcast_123',
        templateId: 'template_456'
      },
      rawEvent: {
        type: 'email.delivered',
        created_at: '2026-03-17T09:25:00.000Z',
        data: {
          email_id: 'email_123',
          created_at: '2026-03-17T09:24:00.000Z',
          from: 'sender@example.com',
          to: ['user@example.com'],
          subject: 'Welcome',
          tags: {
            tenantId: 'tenant_123',
            campaign: 'welcome'
          },
          broadcast_id: 'broadcast_123',
          template_id: 'template_456'
        }
      }
    });
  });

  it.each([
    ['email.scheduled', 'queued'],
    ['email.sent', 'sent'],
    ['email.delivered', 'delivered'],
    ['email.delivery_delayed', 'delivery_delayed'],
    ['email.bounced', 'bounced'],
    ['email.complained', 'complained'],
    ['email.failed', 'failed'],
    ['email.received', 'received'],
    ['email.opened', 'opened'],
    ['email.clicked', 'clicked'],
    ['email.suppressed', 'suppressed'],
    ['contact.created', 'unknown'],
    ['contact.updated', 'unknown'],
    ['contact.deleted', 'unknown'],
    ['domain.created', 'unknown'],
    ['domain.updated', 'unknown'],
    ['domain.deleted', 'unknown']
  ] satisfies Array<[string, string]>)(
    'normalizes current documented Resend event %s to %s',
    async (providerEventType, normalizedEventType) => {
      const provider = new ResendWebhookProvider({ webhookSecret });
      const payload = JSON.stringify({
        type: providerEventType,
        created_at: '2026-03-17T10:00:00.000Z',
        data: {
          email_id: 'email_123',
          created_at: '2026-03-17T09:59:00.000Z'
        }
      });
      const { headers } = signPayload(webhookSecret, payload, `msg_${providerEventType}`);

      const result = await provider.verifyAndNormalizeWebhook({
        rawBody: payload,
        headers
      });

      expect(result.event.normalizedEventType).toBe(normalizedEventType);
      expect(result.event.providerEventType).toBe(providerEventType);
      expect(result.event.dedupeKey).toBe(
        hashDedupeKey({
          type: providerEventType,
          created_at: '2026-03-17T10:00:00.000Z',
          data: {
            email_id: 'email_123',
            created_at: '2026-03-17T09:59:00.000Z'
          }
        })
      );
      expect(result.event.providerDeliveryId).toBe(`msg_${providerEventType}`);
    }
  );

  it('captures safe metadata for bounce, failed, suppressed, and clicked events', async () => {
    const provider = new ResendWebhookProvider({ webhookSecret });
    const payload = JSON.stringify({
      type: 'email.clicked',
      created_at: '2026-03-17T10:10:00.000Z',
      data: {
        email_id: 'email_456',
        created_at: '2026-03-17T10:09:00.000Z',
        click: {
          timestamp: '2026-03-17T10:10:00.000Z',
          link: 'https://example.com/private',
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0'
        }
      }
    });
    const { headers } = signPayload(webhookSecret, payload, 'msg_clicked_1');

    const result = await provider.verifyAndNormalizeWebhook({
      rawBody: payload,
      headers
    });

    expect(result.event.attributes).toEqual({
      clickTimestamp: '2026-03-17T10:10:00.000Z'
    });
    expect(result.event.safeMetadata).toBeUndefined();
  });

  it('projects only the provider-safe stored headers', () => {
    const provider = new ResendWebhookProvider({ webhookSecret });

    const projected = provider.projectStoredHeaders({
      'content-type': 'application/json',
      'user-agent': 'resend-webhooks/1.0',
      'svix-id': 'msg_project_1',
      'svix-timestamp': '1742200000',
      'svix-signature': 'secret',
      authorization: 'bearer should-not-store'
    });

    expect(projected).toEqual({
      'content-type': 'application/json',
      'user-agent': 'resend-webhooks/1.0',
      'svix-id': 'msg_project_1',
      'svix-timestamp': '1742200000'
    });
  });

  it('rejects payloads with an invalid signature', async () => {
    const provider = new ResendWebhookProvider({ webhookSecret });
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_123'
      }
    });
    const { headers } = signPayload(otherWebhookSecret, payload, 'msg_invalid_sig');

    await expect(
      provider.verifyAndNormalizeWebhook({
        rawBody: payload,
        headers
      })
    ).rejects.toThrow();
  });

  it('rejects payloads with missing required signature headers', async () => {
    const provider = new ResendWebhookProvider({ webhookSecret });
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_123'
      }
    });

    await expect(
      provider.verifyAndNormalizeWebhook({
        rawBody: payload,
        headers: {
          'svix-id': 'msg_missing_headers'
        }
      })
    ).rejects.toThrow('Missing required Resend webhook signature headers');
  });

  it('rejects verified payloads that do not contain a string event type', async () => {
    const provider = new ResendWebhookProvider({ webhookSecret });
    const payload = JSON.stringify({
      created_at: '2026-03-17T09:25:00.000Z',
      data: {
        email_id: 'email_123'
      }
    });
    const { headers } = signPayload(webhookSecret, payload, 'msg_invalid_payload');

    await expect(
      provider.verifyAndNormalizeWebhook({
        rawBody: payload,
        headers
      })
    ).rejects.toThrow('Resend webhook payload is missing a string event type');
  });
});

function hashDedupeKey(payload: unknown): string {
  return `resend:event:${createHash('sha256').update(canonicalizeValue(payload)).digest('hex')}`;
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
