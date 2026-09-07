import { Test } from '@nestjs/testing';
import { PgDialect } from 'drizzle-orm/pg-core';

import { EmailWebhookEventRepository } from '../email-webhook-event.repository';

import type { SQL } from 'drizzle-orm';

import { MAIN_DB } from '@/common/database/database.constants';

describe('EmailWebhookEventRepository', () => {
  it('scopes latest provider status by both email message and provider in the overview query', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const module = await Test.createTestingModule({
      providers: [
        EmailWebhookEventRepository,
        {
          provide: MAIN_DB,
          useValue: { execute }
        }
      ]
    }).compile();

    const repository = module.get(EmailWebhookEventRepository);

    await repository.listOperationalOverview({ page: 1, pageSize: 20 });

    const firstQuery = execute.mock.calls[0]?.[0] as SQL | undefined;
    expect(firstQuery).toBeDefined();
    if (!firstQuery) {
      throw new Error('Expected listOperationalOverview to execute a SQL query');
    }

    const sql = new PgDialect().sqlToQuery(firstQuery).sql.replace(/\s+/g, ' ');

    expect(sql).toContain(
      'partition by "email_provider_messages"."email_message_id", "email_provider_messages"."provider"'
    );
    expect(sql).toContain('latest_provider.provider = "email_webhook_events"."provider"');
  });
});
