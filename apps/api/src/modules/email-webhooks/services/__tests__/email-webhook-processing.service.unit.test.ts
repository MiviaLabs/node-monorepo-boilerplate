import { Test } from '@nestjs/testing';

import {
  EmailMessageRepository,
  EmailProviderMessageRepository
} from '../../../email-tracking/repositories';
import { EmailWebhookEventRepository } from '../../repositories';
import { EmailWebhookProcessingService } from '../email-webhook-processing.service';

describe('EmailWebhookProcessingService', () => {
  let service: EmailWebhookProcessingService;
  let emailWebhookEventRepository: jest.Mocked<EmailWebhookEventRepository>;
  let emailMessageRepository: jest.Mocked<EmailMessageRepository>;
  let emailProviderMessageRepository: jest.Mocked<EmailProviderMessageRepository>;
  const tx = {} as never;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailWebhookProcessingService,
        {
          provide: EmailWebhookEventRepository,
          useValue: {
            updateProcessingWithDatabase: jest.fn()
          }
        },
        {
          provide: EmailMessageRepository,
          useValue: {
            updateStatus: jest.fn(),
            updateStatusWithDatabase: jest.fn()
          }
        },
        {
          provide: EmailProviderMessageRepository,
          useValue: {
            findByProviderMessageIdWithDatabase: jest.fn(),
            findByProviderDeliveryIdWithDatabase: jest.fn(),
            findByProviderEventIdWithDatabase: jest.fn(),
            findByEmailMessagePublicIdAndAttemptNumberWithDatabase: jest.fn(),
            findCorrelatableByEmailMessagePublicIdWithDatabase: jest.fn(),
            touchWebhookReceiptWithDatabase: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get(EmailWebhookProcessingService);
    emailWebhookEventRepository = module.get(EmailWebhookEventRepository);
    emailMessageRepository = module.get(EmailMessageRepository);
    emailProviderMessageRepository = module.get(EmailProviderMessageRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('applies a matched webhook using providerMessageId and preserves native plus normalized provider state', async () => {
    emailProviderMessageRepository.findByProviderMessageIdWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailProviderMessageRepository.touchWebhookReceiptWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailMessageRepository.updateStatusWithDatabase.mockResolvedValue({ id: 301 } as never);
    emailWebhookEventRepository.updateProcessingWithDatabase.mockResolvedValue({
      id: 91,
      processingStatus: 'applied'
    } as never);

    const result = await service.processWithDatabase(
      tx,
      {
        id: 91,
        provider: 'resend',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        providerEventId: 'evt_91',
        providerDeliveryId: 'delivery_91',
        providerMessageId: 'provider_msg_91',
        tagsJson: null,
        occurredAt: new Date('2026-03-17T12:00:00.000Z')
      },
      new Date('2026-03-17T12:00:02.000Z')
    );

    expect(emailProviderMessageRepository.touchWebhookReceiptWithDatabase).toHaveBeenCalledWith(
      tx,
      701,
      expect.objectContaining({
        providerStatus: 'email.delivered',
        normalizedStatus: 'delivered',
        providerDeliveryId: 'delivery_91',
        providerEventId: 'evt_91',
        lastWebhookOccurredAt: new Date('2026-03-17T12:00:00.000Z')
      })
    );
    expect(emailMessageRepository.updateStatusWithDatabase).toHaveBeenCalledWith(
      tx,
      501,
      301,
      'delivered',
      new Date('2026-03-17T12:00:00.000Z')
    );
    expect(result.processingStatus).toBe('applied');
  });

  it('falls back to providerDeliveryId when providerMessageId is missing', async () => {
    emailProviderMessageRepository.findByProviderDeliveryIdWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailProviderMessageRepository.touchWebhookReceiptWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailMessageRepository.updateStatusWithDatabase.mockResolvedValue({ id: 301 } as never);
    emailWebhookEventRepository.updateProcessingWithDatabase.mockResolvedValue({
      id: 92,
      processingStatus: 'applied'
    } as never);

    await service.processWithDatabase(
      tx,
      {
        id: 92,
        provider: 'resend',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        providerEventId: null,
        providerDeliveryId: 'delivery_92',
        providerMessageId: null,
        tagsJson: null,
        occurredAt: null
      },
      new Date('2026-03-17T12:05:00.000Z')
    );

    expect(
      emailProviderMessageRepository.findByProviderDeliveryIdWithDatabase
    ).toHaveBeenCalledWith(tx, 'resend', 'delivery_92');
    expect(emailProviderMessageRepository.findByProviderEventIdWithDatabase).not.toHaveBeenCalled();
  });

  it('falls back to email_message_id tag when provider identifiers do not match and attempt metadata is present', async () => {
    emailProviderMessageRepository.findByProviderMessageIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByProviderDeliveryIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByProviderEventIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByEmailMessagePublicIdAndAttemptNumberWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailProviderMessageRepository.touchWebhookReceiptWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailWebhookEventRepository.updateProcessingWithDatabase.mockResolvedValue({
      id: 93,
      processingStatus: 'applied'
    } as never);

    await service.processWithDatabase(
      tx,
      {
        id: 93,
        provider: 'resend',
        providerEventType: 'email.opened',
        normalizedEventType: 'opened',
        verificationStatus: 'verified',
        providerEventId: 'evt_93',
        providerDeliveryId: 'delivery_93',
        providerMessageId: 'missing_provider_message',
        tagsJson: {
          email_message_id: '11111111-1111-1111-1111-111111111111',
          email_provider_attempt: '1'
        },
        occurredAt: null
      },
      new Date('2026-03-17T12:10:00.000Z')
    );

    expect(
      emailProviderMessageRepository.findByEmailMessagePublicIdAndAttemptNumberWithDatabase
    ).toHaveBeenCalledWith(tx, 'resend', '11111111-1111-1111-1111-111111111111', 1);
    expect(emailMessageRepository.updateStatusWithDatabase).not.toHaveBeenCalled();
  });

  it('marks the webhook as unmatched when no correlation strategy resolves', async () => {
    emailProviderMessageRepository.findByProviderMessageIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByProviderDeliveryIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByProviderEventIdWithDatabase.mockResolvedValue(null);
    emailWebhookEventRepository.updateProcessingWithDatabase.mockResolvedValue({
      id: 94,
      processingStatus: 'unmatched'
    } as never);

    const result = await service.processWithDatabase(
      tx,
      {
        id: 94,
        provider: 'resend',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        providerEventId: 'evt_94',
        providerDeliveryId: 'delivery_94',
        providerMessageId: 'missing_provider_message',
        tagsJson: null,
        occurredAt: null
      },
      new Date('2026-03-17T12:15:00.000Z')
    );

    expect(result.processingStatus).toBe('unmatched');
    expect(emailProviderMessageRepository.touchWebhookReceiptWithDatabase).not.toHaveBeenCalled();
  });

  it('marks the webhook as unmatched when email_message_id correlation is ambiguous across attempts', async () => {
    emailProviderMessageRepository.findByProviderMessageIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByProviderDeliveryIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findByProviderEventIdWithDatabase.mockResolvedValue(null);
    emailProviderMessageRepository.findCorrelatableByEmailMessagePublicIdWithDatabase.mockResolvedValue(
      null
    );
    emailWebhookEventRepository.updateProcessingWithDatabase.mockResolvedValue({
      id: 96,
      processingStatus: 'unmatched'
    } as never);

    const result = await service.processWithDatabase(
      tx,
      {
        id: 96,
        provider: 'resend',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        providerEventId: null,
        providerDeliveryId: null,
        providerMessageId: null,
        tagsJson: {
          email_message_id: '11111111-1111-1111-1111-111111111111'
        },
        occurredAt: null
      },
      new Date('2026-03-17T12:25:00.000Z')
    );

    expect(
      emailProviderMessageRepository.findCorrelatableByEmailMessagePublicIdWithDatabase
    ).toHaveBeenCalledWith(tx, 'resend', '11111111-1111-1111-1111-111111111111');
    expect(result.processingStatus).toBe('unmatched');
  });

  it('does not mutate logical email message state for transport-only normalized events', async () => {
    emailProviderMessageRepository.findByProviderMessageIdWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailProviderMessageRepository.touchWebhookReceiptWithDatabase.mockResolvedValue(
      buildProviderMessage()
    );
    emailWebhookEventRepository.updateProcessingWithDatabase.mockResolvedValue({
      id: 95,
      processingStatus: 'applied'
    } as never);

    await service.processWithDatabase(
      tx,
      {
        id: 95,
        provider: 'resend',
        providerEventType: 'email.received',
        normalizedEventType: 'received',
        verificationStatus: 'verified',
        providerEventId: 'evt_95',
        providerDeliveryId: 'delivery_95',
        providerMessageId: 'provider_msg_95',
        tagsJson: null,
        occurredAt: null
      },
      new Date('2026-03-17T12:20:00.000Z')
    );

    expect(emailMessageRepository.updateStatusWithDatabase).not.toHaveBeenCalled();
    expect(emailProviderMessageRepository.touchWebhookReceiptWithDatabase).toHaveBeenCalled();
  });
});

function buildProviderMessage(): never {
  return {
    id: 701,
    organizationId: 501,
    emailMessageId: 301,
    provider: 'resend'
  } as never;
}
