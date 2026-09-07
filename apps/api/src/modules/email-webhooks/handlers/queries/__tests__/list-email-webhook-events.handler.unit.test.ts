import { Test } from '@nestjs/testing';

import { ListEmailWebhookEventsQuery } from '../../../queries';
import { EmailWebhookEventRepository } from '../../../repositories';
import { ListEmailWebhookEventsHandler } from '../list-email-webhook-events.handler';

describe('ListEmailWebhookEventsHandler', () => {
  it('maps repository rows into the operational list dto', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ListEmailWebhookEventsHandler,
        {
          provide: EmailWebhookEventRepository,
          useValue: {
            listOperationalOverview: jest.fn().mockResolvedValue({
              total: 2,
              items: [
                {
                  id: 11,
                  provider: 'resend',
                  provider_event_type: 'email.delivered',
                  normalized_event_type: 'delivered',
                  processing_status: 'applied',
                  verification_status: 'verified',
                  provider_message_id: 'msg_11',
                  provider_delivery_id: 'delivery_11',
                  provider_event_id: 'event_11',
                  organization_id: 7,
                  organization_name: 'Acme Corp',
                  email_message_id: 18,
                  email_provider_message_id: 41,
                  message_status: 'delivered',
                  latest_provider_status: 'delivered',
                  latest_normalized_provider_status: 'delivered',
                  reference_type: 'invitation',
                  reference_id: 'invite-11',
                  attempt_count: 1,
                  processing_error: null,
                  occurred_at: new Date('2026-03-17T10:00:00.000Z'),
                  received_at: new Date('2026-03-17T10:00:01.000Z'),
                  processed_at: new Date('2026-03-17T10:00:02.000Z')
                },
                {
                  id: 12,
                  provider: 'resend',
                  provider_event_type: 'email.opened',
                  normalized_event_type: 'opened',
                  processing_status: 'unmatched',
                  verification_status: 'verified',
                  provider_message_id: null,
                  provider_delivery_id: null,
                  provider_event_id: null,
                  organization_id: null,
                  organization_name: null,
                  email_message_id: null,
                  email_provider_message_id: null,
                  message_status: null,
                  latest_provider_status: null,
                  latest_normalized_provider_status: null,
                  reference_type: null,
                  reference_id: null,
                  attempt_count: 2,
                  processing_error: 'Lookup failed',
                  occurred_at: null,
                  received_at: new Date('2026-03-17T10:05:01.000Z'),
                  processed_at: null
                }
              ]
            })
          }
        }
      ]
    }).compile();

    const handler = module.get(ListEmailWebhookEventsHandler);
    const result = await handler.execute(
      new ListEmailWebhookEventsQuery({
        page: 2,
        pageSize: 10,
        provider: 'resend',
        organizationId: 7,
        processingStatus: 'unmatched',
        verificationStatus: 'verified',
        providerDeliveryId: 'delivery_11'
      })
    );

    expect(result).toEqual({
      page: 2,
      pageSize: 10,
      total: 2,
      items: [
        {
          id: 11,
          provider: 'resend',
          providerEventType: 'email.delivered',
          normalizedEventType: 'delivered',
          processingStatus: 'applied',
          verificationStatus: 'verified',
          providerMessageId: 'msg_11',
          providerDeliveryId: 'delivery_11',
          providerEventId: 'event_11',
          organizationId: 7,
          organizationName: 'Acme Corp',
          emailMessageId: 18,
          emailProviderMessageId: 41,
          messageStatus: 'delivered',
          latestProviderStatus: 'delivered',
          latestNormalizedProviderStatus: 'delivered',
          referenceType: 'invitation',
          referenceId: 'invite-11',
          attemptCount: 1,
          processingError: undefined,
          occurredAt: '2026-03-17T10:00:00.000Z',
          receivedAt: '2026-03-17T10:00:01.000Z',
          processedAt: '2026-03-17T10:00:02.000Z'
        },
        {
          id: 12,
          provider: 'resend',
          providerEventType: 'email.opened',
          normalizedEventType: 'opened',
          processingStatus: 'unmatched',
          verificationStatus: 'verified',
          providerMessageId: undefined,
          providerDeliveryId: undefined,
          providerEventId: undefined,
          organizationId: undefined,
          organizationName: undefined,
          emailMessageId: undefined,
          emailProviderMessageId: undefined,
          messageStatus: undefined,
          latestProviderStatus: undefined,
          latestNormalizedProviderStatus: undefined,
          referenceType: undefined,
          referenceId: undefined,
          attemptCount: 2,
          processingError: 'Lookup failed',
          occurredAt: undefined,
          receivedAt: '2026-03-17T10:05:01.000Z',
          processedAt: undefined
        }
      ]
    });
  });
});
