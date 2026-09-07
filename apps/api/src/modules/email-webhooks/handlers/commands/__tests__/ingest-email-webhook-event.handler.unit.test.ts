import { Test } from '@nestjs/testing';
import { EmailWebhookProviderRegistry, ResendWebhookProvider } from '@package/email/webhooks';
import { Webhook } from 'svix';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { IngestEmailWebhookEventCommand } from '../../../commands';
import { EmailWebhookEventRepository } from '../../../repositories';
import { EmailWebhookProcessingService } from '../../../services';
import { IngestEmailWebhookEventHandler } from '../ingest-email-webhook-event.handler';

import type { NodePgDatabase } from '@package/db-core';
import type { IEmailWebhookProvider } from '@package/email/webhooks';

const webhookSecret = `whsec_${Buffer.from('test_secret').toString('base64')}`;

function signPayload(
  secret: string,
  payload: string,
  messageId = 'msg_test_123'
): Record<string, string> {
  const webhook = new Webhook(secret);
  const timestamp = new Date();

  return {
    'svix-id': messageId,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': webhook.sign(messageId, timestamp, payload)
  };
}

describe('IngestEmailWebhookEventHandler', () => {
  let handler: IngestEmailWebhookEventHandler;
  let emailWebhookEventRepository: jest.Mocked<EmailWebhookEventRepository>;
  let emailWebhookProcessingService: jest.Mocked<EmailWebhookProcessingService>;
  let providerRegistry: EmailWebhookProviderRegistry;
  let db: jest.Mocked<NodePgDatabase>;
  const tx = {} as never;

  beforeEach(async () => {
    const mockEmailWebhookEventRepository = {
      findByDedupeKeyWithDatabase: jest.fn(),
      findById: jest.fn(),
      createIfAbsentWithDatabase: jest.fn(),
      markFailedWithDatabase: jest.fn(),
      prepareForReprocessWithDatabase: jest.fn()
    };
    const mockEmailWebhookProcessingService = {
      processWithDatabase: jest.fn(),
      sanitizeProcessingError: jest.fn((error: unknown) =>
        error instanceof Error ? error.message : 'Unknown webhook processing error'
      )
    };
    providerRegistry = new EmailWebhookProviderRegistry();
    providerRegistry.register(new ResendWebhookProvider({ webhookSecret }));
    db = {
      transaction: jest.fn().mockImplementation(async (callback) => callback(tx))
    } as unknown as jest.Mocked<NodePgDatabase>;

    const module = await Test.createTestingModule({
      providers: [
        IngestEmailWebhookEventHandler,
        { provide: EmailWebhookProviderRegistry, useValue: providerRegistry },
        { provide: EmailWebhookEventRepository, useValue: mockEmailWebhookEventRepository },
        { provide: EmailWebhookProcessingService, useValue: mockEmailWebhookProcessingService },
        { provide: MAIN_DB, useValue: db }
      ]
    }).compile();

    handler = module.get(IngestEmailWebhookEventHandler);
    emailWebhookEventRepository = module.get(EmailWebhookEventRepository);
    emailWebhookProcessingService = module.get(EmailWebhookProcessingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('short-circuits already-applied duplicate webhook events', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_123' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_123');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue({
      id: 11,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_123',
      providerMessageId: 'msg_123',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(result).toEqual({
      webhookEventId: 11,
      duplicate: true,
      processingStatus: 'duplicate',
      verificationStatus: 'verified',
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered'
    });
    expect(emailWebhookEventRepository.prepareForReprocessWithDatabase).not.toHaveBeenCalled();
    expect(emailWebhookProcessingService.processWithDatabase).not.toHaveBeenCalled();
  });

  it('retries duplicate unmatched webhook events', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_retry_1' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_retry_1');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue({
      id: 51,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_retry_1',
      providerMessageId: 'msg_retry_1',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'unmatched',
      occurredAt: new Date('2026-03-17T00:00:00.000Z')
    } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase.mockResolvedValue({
      id: 51,
      provider: 'resend',
      providerMessageId: 'msg_retry_1',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted',
      occurredAt: new Date('2026-03-17T00:00:00.000Z')
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 51,
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(emailWebhookEventRepository.prepareForReprocessWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      51
    );
    expect(emailWebhookProcessingService.processWithDatabase).toHaveBeenCalled();
    expect(result.processingStatus).toBe('applied');
    expect(result.duplicate).toBe(true);
  });

  it('reclaims a duplicate retry when the first replay claim loses a race', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_retry_race' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_retry_race');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue({
      id: 61,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_retry_race',
      providerMessageId: 'msg_retry_race',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'failed',
      occurredAt: new Date('2026-03-17T00:00:00.000Z')
    } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: 61,
        provider: 'resend',
        providerMessageId: 'msg_retry_race',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'received',
        occurredAt: new Date('2026-03-17T00:00:00.000Z')
      } as never);
    emailWebhookEventRepository.findById.mockResolvedValue({
      id: 61,
      provider: 'resend',
      providerMessageId: 'msg_retry_race',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'failed',
      occurredAt: new Date('2026-03-17T00:00:00.000Z')
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 61,
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(emailWebhookEventRepository.prepareForReprocessWithDatabase).toHaveBeenCalledTimes(2);
    expect(emailWebhookProcessingService.processWithDatabase).toHaveBeenCalled();
    expect(result).toEqual({
      webhookEventId: 61,
      duplicate: true,
      processingStatus: 'applied',
      verificationStatus: 'verified',
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered'
    });
  });

  it('marks a new unmatched webhook event as unmatched', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_456' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_456');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue(null);
    emailWebhookEventRepository.createIfAbsentWithDatabase.mockResolvedValue({
      id: 21,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_456',
      providerMessageId: 'msg_456',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted'
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 21,
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'unmatched'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(result).toEqual({
      webhookEventId: 21,
      duplicate: false,
      processingStatus: 'unmatched',
      verificationStatus: 'verified',
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered'
    });
    expect(emailWebhookEventRepository.createIfAbsentWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawHeadersJson: {
          'content-type': 'application/json',
          'svix-id': 'evt_456',
          'svix-timestamp': expect.any(String)
        }
      })
    );
  });

  it('correlates and applies a matched webhook event', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_999' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_999');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue(null);
    emailWebhookEventRepository.createIfAbsentWithDatabase.mockResolvedValue({
      id: 31,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_999',
      providerMessageId: 'msg_999',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted'
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 31,
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(emailWebhookProcessingService.processWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 31,
        providerMessageId: 'msg_999',
        normalizedEventType: 'delivered'
      }),
      expect.any(Date)
    );
    expect(result).toEqual({
      webhookEventId: 31,
      duplicate: false,
      processingStatus: 'applied',
      verificationStatus: 'verified',
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered'
    });
  });

  it('marks the webhook event as failed when downstream processing throws', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_888' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_888');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue(null);
    emailWebhookEventRepository.createIfAbsentWithDatabase.mockResolvedValue({
      id: 88,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_888',
      providerMessageId: 'msg_888',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted'
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockRejectedValue(
      new Error('Provider message lookup exploded')
    );
    emailWebhookEventRepository.markFailedWithDatabase.mockResolvedValue({
      id: 88,
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'failed'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(emailWebhookEventRepository.markFailedWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      88,
      expect.objectContaining({
        processingError: 'Provider message lookup exploded'
      })
    );
    expect(emailWebhookProcessingService.sanitizeProcessingError).toHaveBeenCalled();
    expect(result.processingStatus).toBe('failed');
  });

  it('does not regress a duplicate event when replay preparation loses the race', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-03-17T00:00:00.000Z',
      data: { email_id: 'msg_race_1' }
    });
    const headers = signPayload(webhookSecret, payload, 'evt_race_1');
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue({
      id: 61,
      provider: 'resend',
      dedupeKey: 'resend:delivery:evt_race_1',
      providerMessageId: 'msg_race_1',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'unmatched'
    } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase.mockResolvedValue(null as never);
    emailWebhookEventRepository.findById.mockResolvedValue({
      id: 61,
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'resend',
        rawBody: Buffer.from(payload),
        body: JSON.parse(payload),
        headers: {
          ...headers,
          'content-type': 'application/json'
        },
        contentType: 'application/json'
      })
    );

    expect(emailWebhookProcessingService.processWithDatabase).not.toHaveBeenCalled();
    expect(result).toEqual({
      webhookEventId: 61,
      duplicate: true,
      processingStatus: 'duplicate',
      verificationStatus: 'verified',
      provider: 'resend',
      providerEventType: 'email.delivered',
      normalizedEventType: 'delivered'
    });
  });

  it('rejects unsupported providers', async () => {
    await expect(
      handler.execute(
        new IngestEmailWebhookEventCommand({
          provider: 'mailgun',
          rawBody: Buffer.from('{}'),
          body: {},
          headers: {},
          contentType: 'application/json'
        })
      )
    ).rejects.toMatchObject({ code: 'VAL_002' });
  });

  it('uses the resolved provider contract for verification and stored-header projection', async () => {
    const fakeProvider: IEmailWebhookProvider = {
      provider: 'mock-provider',
      async verifyAndNormalizeWebhook() {
        return {
          event: {
            provider: 'mock-provider',
            providerEventType: 'message.delivered',
            normalizedEventType: 'delivered',
            dedupeKey: 'mock-provider:event:evt_mock_1',
            providerEventId: 'evt_mock_1',
            providerMessageId: 'msg_mock_1',
            occurredAt: '2026-03-17T00:00:00.000Z',
            rawEvent: { event: 'message.delivered' }
          }
        };
      },
      projectStoredHeaders(headers) {
        return {
          'content-type': headers['content-type'],
          'x-mock-request-id': headers['x-mock-request-id']
        };
      }
    };
    providerRegistry.register(fakeProvider);
    emailWebhookEventRepository.findByDedupeKeyWithDatabase.mockResolvedValue(null);
    emailWebhookEventRepository.createIfAbsentWithDatabase.mockResolvedValue({
      id: 42,
      provider: 'mock-provider',
      dedupeKey: 'mock-provider:event:evt_mock_1',
      providerMessageId: 'msg_mock_1',
      providerEventType: 'message.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted'
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 42,
      provider: 'mock-provider',
      providerEventType: 'message.delivered',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    const result = await handler.execute(
      new IngestEmailWebhookEventCommand({
        provider: 'mock-provider',
        rawBody: Buffer.from('{"event":"message.delivered"}'),
        body: { event: 'message.delivered' },
        headers: {
          'content-type': 'application/json',
          'x-mock-request-id': 'evt_mock_1',
          authorization: 'should-not-persist'
        },
        contentType: 'application/json'
      })
    );

    expect(emailWebhookEventRepository.createIfAbsentWithDatabase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'mock-provider',
        rawHeadersJson: {
          'content-type': 'application/json',
          'x-mock-request-id': 'evt_mock_1'
        }
      })
    );
    expect(result.provider).toBe('mock-provider');
    expect(result.providerEventType).toBe('message.delivered');
  });
});
