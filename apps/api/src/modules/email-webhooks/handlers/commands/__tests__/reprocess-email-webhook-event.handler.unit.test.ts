import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { ReprocessEmailWebhookEventCommand } from '../../../commands';
import { EmailWebhookEventRepository } from '../../../repositories';
import { EmailWebhookProcessingService } from '../../../services';
import { ReprocessEmailWebhookEventHandler } from '../reprocess-email-webhook-event.handler';

import type { NodePgDatabase } from '@package/db-core';

describe('ReprocessEmailWebhookEventHandler', () => {
  let handler: ReprocessEmailWebhookEventHandler;
  let emailWebhookEventRepository: jest.Mocked<EmailWebhookEventRepository>;
  let emailWebhookProcessingService: jest.Mocked<EmailWebhookProcessingService>;
  let db: jest.Mocked<NodePgDatabase>;
  const tx = {} as never;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReprocessEmailWebhookEventHandler,
        {
          provide: EmailWebhookEventRepository,
          useValue: {
            findById: jest.fn(),
            prepareForReprocessWithDatabase: jest.fn(),
            markFailedWithDatabase: jest.fn()
          }
        },
        {
          provide: EmailWebhookProcessingService,
          useValue: {
            processWithDatabase: jest.fn(),
            sanitizeProcessingError: jest.fn((error: unknown) =>
              error instanceof Error ? error.message : 'Unknown webhook processing error'
            )
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: MAIN_DB,
          useValue: {
            transaction: jest.fn().mockImplementation(async (callback) => callback(tx))
          }
        }
      ]
    }).compile();

    handler = module.get(ReprocessEmailWebhookEventHandler);
    emailWebhookEventRepository = module.get(EmailWebhookEventRepository);
    emailWebhookProcessingService = module.get(EmailWebhookProcessingService);
    db = module.get(MAIN_DB);
  });

  it('reprocesses a failed webhook event', async () => {
    emailWebhookEventRepository.findById
      .mockResolvedValueOnce({
        id: 41,
        provider: 'resend',
        providerMessageId: 'msg_41',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'failed',
        providerEventType: 'email.delivered',
        occurredAt: new Date('2026-03-17T10:00:00.000Z')
      } as never)
      .mockResolvedValueOnce({
        id: 41,
        provider: 'resend',
        providerMessageId: 'msg_41',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'applied',
        providerEventType: 'email.delivered',
        occurredAt: new Date('2026-03-17T10:00:00.000Z'),
        attemptCount: 2
      } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase.mockResolvedValue({
      id: 41,
      provider: 'resend',
      providerMessageId: 'msg_41',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted',
      providerEventType: 'email.delivered',
      occurredAt: new Date('2026-03-17T10:00:00.000Z'),
      attemptCount: 2
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 41,
      provider: 'resend',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied',
      providerEventType: 'email.delivered',
      attemptCount: 2
    } as never);

    const result = await handler.execute(
      new ReprocessEmailWebhookEventCommand({ webhookEventId: 41 })
    );

    expect(db.transaction).toHaveBeenCalled();
    expect(emailWebhookProcessingService.processWithDatabase).toHaveBeenCalled();
    expect(result).toEqual({
      webhookEventId: 41,
      processingStatus: 'applied',
      attemptCount: 2,
      reprocessed: true
    });
  });

  it('marks the webhook as failed when replay processing throws', async () => {
    emailWebhookEventRepository.findById.mockResolvedValue({
      id: 52,
      provider: 'resend',
      providerMessageId: 'msg_52',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'unmatched',
      providerEventType: 'email.delivered',
      occurredAt: null,
      attemptCount: 2
    } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase.mockResolvedValue({
      id: 52,
      provider: 'resend',
      providerMessageId: 'msg_52',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'persisted',
      providerEventType: 'email.delivered',
      occurredAt: null,
      attemptCount: 3
    } as never);
    emailWebhookProcessingService.processWithDatabase.mockRejectedValue(
      new Error('Correlation crashed')
    );
    emailWebhookEventRepository.markFailedWithDatabase.mockResolvedValue({
      id: 52,
      processingStatus: 'failed',
      attemptCount: 3
    } as never);

    const result = await handler.execute(
      new ReprocessEmailWebhookEventCommand({ webhookEventId: 52 })
    );

    expect(emailWebhookEventRepository.markFailedWithDatabase).toHaveBeenCalledWith(
      tx,
      52,
      expect.objectContaining({
        processingError: 'Correlation crashed'
      })
    );
    expect(emailWebhookProcessingService.sanitizeProcessingError).toHaveBeenCalled();
    expect(result).toEqual({
      webhookEventId: 52,
      processingStatus: 'failed',
      attemptCount: 3,
      reprocessed: true
    });
  });

  it('throws when the webhook event does not exist', async () => {
    emailWebhookEventRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new ReprocessEmailWebhookEventCommand({ webhookEventId: 999 }))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-reprocessable webhook statuses', async () => {
    emailWebhookEventRepository.findById.mockResolvedValue({
      id: 77,
      verificationStatus: 'verified',
      processingStatus: 'applied'
    } as never);

    await expect(
      handler.execute(new ReprocessEmailWebhookEventCommand({ webhookEventId: 77 }))
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects replay when the event becomes non-reprocessable before preparation', async () => {
    emailWebhookEventRepository.findById
      .mockResolvedValueOnce({
        id: 81,
        verificationStatus: 'verified',
        processingStatus: 'failed'
      } as never)
      .mockResolvedValueOnce({
        id: 81,
        verificationStatus: 'verified',
        processingStatus: 'applied'
      } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase.mockResolvedValue(null as never);

    await expect(
      handler.execute(new ReprocessEmailWebhookEventCommand({ webhookEventId: 81 }))
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(emailWebhookProcessingService.processWithDatabase).not.toHaveBeenCalled();
  });

  it('reclaims replay when the event becomes retryable again after a lost claim', async () => {
    emailWebhookEventRepository.findById
      .mockResolvedValueOnce({
        id: 91,
        provider: 'resend',
        providerMessageId: 'msg_91',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'failed',
        providerEventType: 'email.delivered',
        occurredAt: new Date('2026-03-17T10:00:00.000Z')
      } as never)
      .mockResolvedValueOnce({
        id: 91,
        provider: 'resend',
        providerMessageId: 'msg_91',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'failed',
        providerEventType: 'email.delivered',
        occurredAt: new Date('2026-03-17T10:00:00.000Z'),
        attemptCount: 2
      } as never)
      .mockResolvedValueOnce({
        id: 91,
        provider: 'resend',
        providerMessageId: 'msg_91',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'applied',
        providerEventType: 'email.delivered',
        occurredAt: new Date('2026-03-17T10:00:00.000Z'),
        attemptCount: 3
      } as never);
    emailWebhookEventRepository.prepareForReprocessWithDatabase
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: 91,
        provider: 'resend',
        providerMessageId: 'msg_91',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'received',
        providerEventType: 'email.delivered',
        occurredAt: new Date('2026-03-17T10:00:00.000Z'),
        attemptCount: 3
      } as never);
    emailWebhookProcessingService.processWithDatabase.mockResolvedValue({
      id: 91,
      provider: 'resend',
      normalizedEventType: 'delivered',
      verificationStatus: 'verified',
      processingStatus: 'applied',
      providerEventType: 'email.delivered',
      attemptCount: 3
    } as never);

    const result = await handler.execute(
      new ReprocessEmailWebhookEventCommand({ webhookEventId: 91 })
    );

    expect(emailWebhookEventRepository.prepareForReprocessWithDatabase).toHaveBeenCalledTimes(2);
    expect(emailWebhookProcessingService.processWithDatabase).toHaveBeenCalled();
    expect(result).toEqual({
      webhookEventId: 91,
      processingStatus: 'applied',
      attemptCount: 3,
      reprocessed: true
    });
  });
});
