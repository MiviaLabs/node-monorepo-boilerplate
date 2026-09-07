import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { GetAdminEmailDetailQuery } from '../../../queries';
import { GetAdminEmailDetailHandler } from '../get-admin-email-detail.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminEmailDetailHandler', () => {
  let handler: GetAdminEmailDetailHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              email_message_id: 101,
              public_id: 'email-public-101',
              organization_id: 12,
              organization_name: 'Acme Corp',
              reference_type: 'invitation',
              reference_id: 'invite-101',
              subject: 'Invitation to Acme',
              message_status: 'delivered',
              provider: 'resend',
              attempt_number: 2,
              provider_message_id: 'msg-101',
              provider_delivery_id: 'delivery-101',
              provider_event_id: 'event-101',
              provider_status: 'delivered',
              normalized_provider_status: 'delivered',
              accepted_at: '2026-03-17T09:58:00.000Z',
              delivered_at: '2026-03-17T09:59:00.000Z',
              failed_at: null,
              last_webhook_occurred_at: '2026-03-17T09:59:01.000Z',
              last_webhook_at: '2026-03-17T09:59:02.000Z',
              failed_webhook_count: 1,
              unmatched_webhook_count: 0,
              latest_webhook_processing_status: 'failed',
              webhook_attention_state: 'attention',
              correlation_id: 'corr-101',
              metadata: {
                templateKey: 'tenant.invitation',
                tags: ['tenant', 'invite'],
                headers: { 'x-request-id': 'req-1' },
                providerHints: { region: 'us-east-1' }
              }
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 41,
              provider: 'resend',
              attempt_number: 2,
              provider_message_id: 'msg-101',
              provider_delivery_id: 'delivery-101',
              provider_event_id: 'event-101',
              provider_status: 'delivered',
              normalized_provider_status: 'delivered',
              correlation_id: 'corr-101',
              accepted_at: '2026-03-17T09:58:00.000Z',
              last_webhook_occurred_at: '2026-03-17T09:59:01.000Z',
              last_webhook_at: '2026-03-17T09:59:02.000Z',
              created_at: '2026-03-17T09:58:00.000Z',
              updated_at: '2026-03-17T09:59:02.000Z'
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 88,
              provider: 'resend',
              provider_event_type: 'email.delivered',
              normalized_event_type: 'delivered',
              verification_status: 'verified',
              processing_status: 'applied',
              provider_message_id: 'msg-101',
              provider_delivery_id: 'delivery-101',
              provider_event_id: 'event-101',
              email_provider_message_id: 41,
              attempt_count: 1,
              processing_error: null,
              occurred_at: '2026-03-17T09:59:01.000Z',
              received_at: '2026-03-17T09:59:02.000Z',
              processed_at: '2026-03-17T09:59:03.000Z'
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminEmailDetailHandler,
        { provide: MAIN_DB, useValue: db },
        { provide: AuditOutboxPublisher, useValue: auditOutbox }
      ]
    }).compile();

    handler = module.get(GetAdminEmailDetailHandler);
  });

  it('maps the email detail read model and audits the detail view', async () => {
    const result = await handler.execute(
      new GetAdminEmailDetailQuery({
        emailMessageId: 101,
        actorId: 'actor-email-detail',
        requestId: 'req-email-detail',
        correlationId: 'corr-email-detail',
        causationId: 'cause-email-detail'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.email.detail.viewed.audit',
        aggregateId: '101',
        correlationId: 'corr-email-detail'
      })
    );
    expect(result.item).toEqual(
      expect.objectContaining({
        emailMessageId: 101,
        organizationName: 'Acme Corp',
        providerMessageId: 'msg-101',
        messageStatus: 'delivered'
      })
    );
    expect(result.providerAttempts).toEqual([
      expect.objectContaining({
        id: 41,
        attemptNumber: 2,
        providerMessageId: 'msg-101'
      })
    ]);
    expect(result.relatedWebhookEvents).toEqual([
      expect.objectContaining({
        id: 88,
        providerEventType: 'email.delivered',
        processingStatus: 'applied'
      })
    ]);
  });

  it('throws when the email message does not exist', async () => {
    db.execute.mockReset().mockResolvedValueOnce({ rows: [] });

    await expect(
      handler.execute(
        new GetAdminEmailDetailQuery({
          emailMessageId: 999
        })
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves attempt ordering and supports empty related collections', async () => {
    db.execute
      .mockReset()
      .mockResolvedValueOnce({
        rows: [
          {
            email_message_id: 202,
            public_id: 'email-public-202',
            organization_id: 18,
            organization_name: 'Beta Corp',
            reference_type: null,
            reference_id: null,
            subject: null,
            message_status: 'accepted',
            provider: 'resend',
            attempt_number: 3,
            provider_message_id: 'msg-202-latest',
            provider_delivery_id: 'delivery-202-latest',
            provider_event_id: null,
            provider_status: 'accepted',
            normalized_provider_status: 'accepted',
            accepted_at: '2026-03-17T10:00:00.000Z',
            delivered_at: null,
            failed_at: null,
            last_webhook_occurred_at: null,
            last_webhook_at: null,
            failed_webhook_count: 0,
            unmatched_webhook_count: 0,
            latest_webhook_processing_status: null,
            webhook_attention_state: 'clear',
            correlation_id: null,
            metadata: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 52,
            provider: 'resend',
            attempt_number: 3,
            provider_message_id: 'msg-202-latest',
            provider_delivery_id: 'delivery-202-latest',
            provider_event_id: null,
            provider_status: 'accepted',
            normalized_provider_status: 'accepted',
            correlation_id: null,
            accepted_at: '2026-03-17T10:00:00.000Z',
            last_webhook_occurred_at: null,
            last_webhook_at: null,
            created_at: '2026-03-17T10:00:00.000Z',
            updated_at: '2026-03-17T10:00:00.000Z'
          },
          {
            id: 51,
            provider: 'resend',
            attempt_number: 2,
            provider_message_id: 'msg-202-prev',
            provider_delivery_id: 'delivery-202-prev',
            provider_event_id: null,
            provider_status: 'accepted',
            normalized_provider_status: 'accepted',
            correlation_id: null,
            accepted_at: '2026-03-17T09:59:00.000Z',
            last_webhook_occurred_at: null,
            last_webhook_at: null,
            created_at: '2026-03-17T09:59:00.000Z',
            updated_at: '2026-03-17T09:59:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: []
      });

    const result = await handler.execute(
      new GetAdminEmailDetailQuery({
        emailMessageId: 202
      })
    );

    expect(result.providerAttempts).toEqual([
      expect.objectContaining({
        id: 52,
        attemptNumber: 3,
        providerMessageId: 'msg-202-latest'
      }),
      expect.objectContaining({
        id: 51,
        attemptNumber: 2,
        providerMessageId: 'msg-202-prev'
      })
    ]);
    expect(result.relatedWebhookEvents).toEqual([]);
    expect(result.item).toEqual(
      expect.objectContaining({
        emailMessageId: 202,
        messageStatus: 'accepted',
        webhookAttentionState: 'clear'
      })
    );
  });

  it('fails fast when a required numeric field is missing from the detail row', async () => {
    db.execute
      .mockReset()
      .mockResolvedValueOnce({
        rows: [
          {
            email_message_id: 303,
            public_id: 'email-public-303',
            organization_id: null,
            organization_name: 'Gamma Corp',
            reference_type: null,
            reference_id: null,
            subject: 'Broken row',
            message_status: 'accepted',
            provider: 'resend',
            attempt_number: 1,
            provider_message_id: 'msg-303',
            provider_delivery_id: 'delivery-303',
            provider_event_id: null,
            provider_status: 'accepted',
            normalized_provider_status: 'accepted',
            accepted_at: null,
            delivered_at: null,
            failed_at: null,
            last_webhook_occurred_at: null,
            last_webhook_at: null,
            failed_webhook_count: 0,
            unmatched_webhook_count: 0,
            latest_webhook_processing_status: null,
            webhook_attention_state: 'clear',
            correlation_id: null,
            metadata: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      handler.execute(
        new GetAdminEmailDetailQuery({
          emailMessageId: 303
        })
      )
    ).rejects.toThrow('organization_id');
    expect(auditOutbox.insert).not.toHaveBeenCalled();
  });
});
