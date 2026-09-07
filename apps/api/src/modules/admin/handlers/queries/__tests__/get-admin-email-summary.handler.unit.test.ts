import { Test } from '@nestjs/testing';

import { GetAdminEmailSummaryQuery } from '../../../queries';
import { GetAdminEmailSummaryHandler } from '../get-admin-email-summary.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminEmailSummaryHandler', () => {
  let handler: GetAdminEmailSummaryHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            total_count: 5,
            pending_count: 1,
            accepted_count: 1,
            delivered_count: 2,
            failed_delivery_count: 1,
            webhook_attention_count: 2
          }
        ]
      })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminEmailSummaryHandler,
        { provide: MAIN_DB, useValue: db },
        { provide: AuditOutboxPublisher, useValue: auditOutbox }
      ]
    }).compile();

    handler = module.get(GetAdminEmailSummaryHandler);
  });

  it('maps aggregate counts and audits the filtered summary read', async () => {
    const result = await handler.execute(
      new GetAdminEmailSummaryQuery({
        actorId: 'actor-email-summary',
        requestId: 'req-email-summary',
        correlationId: 'corr-email-summary',
        causationId: 'cause-email-summary',
        organizationId: 12,
        webhookAttentionState: 'attention'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.emails.summary.viewed.audit',
        correlationId: 'corr-email-summary',
        causationId: 'cause-email-summary'
      })
    );
    expect(result.summary).toEqual({
      total: 5,
      pending: 1,
      accepted: 1,
      delivered: 2,
      failedOrBouncedOrComplained: 1,
      webhookAttention: 2
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'emails_total', value: 5 }),
        expect.objectContaining({ key: 'emails_webhook_attention', value: 2 })
      ])
    );
  });
});
