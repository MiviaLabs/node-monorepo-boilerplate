import { Test } from '@nestjs/testing';

import { GetAdminEmailsOverviewQuery } from '../../../queries';
import { buildAdminEmailFilters } from '../admin-emails-report';
import { GetAdminEmailsOverviewHandler } from '../get-admin-emails-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminEmailsOverviewHandler', () => {
  let handler: GetAdminEmailsOverviewHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              total_count: 2,
              pending_count: 0,
              accepted_count: 1,
              delivered_count: 1,
              failed_delivery_count: 0,
              webhook_attention_count: 1
            }
          ]
        })
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
              },
              total_count: 2
            },
            {
              email_message_id: 102,
              public_id: 'email-public-102',
              organization_id: 12,
              organization_name: 'Acme Corp',
              reference_type: null,
              reference_id: null,
              subject: null,
              message_status: 'accepted',
              provider: null,
              attempt_number: null,
              provider_message_id: null,
              provider_delivery_id: null,
              provider_event_id: null,
              provider_status: null,
              normalized_provider_status: null,
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
              metadata: null,
              total_count: 2
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminEmailsOverviewHandler,
        { provide: MAIN_DB, useValue: db },
        { provide: AuditOutboxPublisher, useValue: auditOutbox }
      ]
    }).compile();

    handler = module.get(GetAdminEmailsOverviewHandler);
  });

  it('maps paginated email inventory rows and audits the inventory read', async () => {
    const result = await handler.execute(
      new GetAdminEmailsOverviewQuery({
        actorId: 'actor-email-overview',
        requestId: 'req-email-overview',
        correlationId: 'corr-email-overview',
        causationId: 'cause-email-overview',
        sortBy: 'lastWebhookAt',
        sortOrder: 'desc'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.emails.viewed.audit',
        correlationId: 'corr-email-overview',
        causationId: 'cause-email-overview'
      })
    );
    expect(result.summary).toEqual({
      total: 2,
      pending: 0,
      accepted: 1,
      delivered: 1,
      failedOrBouncedOrComplained: 0,
      webhookAttention: 1
    });
    expect(result.items[0]).toEqual({
      emailMessageId: 101,
      publicId: 'email-public-101',
      organizationId: 12,
      organizationName: 'Acme Corp',
      referenceType: 'invitation',
      referenceId: 'invite-101',
      subject: 'Invitation to Acme',
      messageStatus: 'delivered',
      provider: 'resend',
      attemptNumber: 2,
      providerMessageId: 'msg-101',
      providerDeliveryId: 'delivery-101',
      providerEventId: 'event-101',
      providerStatus: 'delivered',
      normalizedProviderStatus: 'delivered',
      acceptedAt: '2026-03-17T09:58:00.000Z',
      deliveredAt: '2026-03-17T09:59:00.000Z',
      failedAt: undefined,
      lastWebhookOccurredAt: '2026-03-17T09:59:01.000Z',
      lastWebhookAt: '2026-03-17T09:59:02.000Z',
      failedWebhookCount: 1,
      unmatchedWebhookCount: 0,
      latestWebhookProcessingStatus: 'failed',
      webhookAttentionState: 'attention',
      correlationId: 'corr-101',
      safeMetadataSummary: {
        templateKey: 'tenant.invitation',
        tagCount: 2,
        headerKeys: ['x-request-id'],
        providerHintKeys: ['region']
      }
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    });
  });

  it('searches provider identifiers across all provider attempts, not just the latest provider row', () => {
    const filters = buildAdminEmailFilters(
      new GetAdminEmailsOverviewQuery({
        search: 'delivery-prev-101'
      }),
      '%delivery-prev-101%'
    );

    const searchFilter = filters[0] as {
      queryChunks: Array<
        | {
            name?: string;
            value?: string[];
          }
        | string
      >;
    };
    const sqlString = searchFilter.queryChunks
      .map((chunk) => {
        if (typeof chunk === 'string') {
          return chunk;
        }

        return chunk.value?.join('') ?? chunk.name ?? '';
      })
      .join('');

    expect(sqlString).toContain('exists');
    expect(sqlString).toContain('from email_provider_messages');
    expect(sqlString).toContain(
      'email_provider_messages.email_message_id = email_inventory.email_message_id'
    );
    expect(sqlString).toContain(
      "lower(coalesce(email_provider_messages.provider_message_id, '')) like "
    );
    expect(sqlString).toContain(
      "lower(coalesce(email_provider_messages.provider_delivery_id, '')) like "
    );
    expect(sqlString).toContain(
      "lower(coalesce(email_provider_messages.provider_event_id, '')) like "
    );
  });
});
