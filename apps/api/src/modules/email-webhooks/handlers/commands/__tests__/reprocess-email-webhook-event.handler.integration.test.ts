import { Test } from '@nestjs/testing';
import { emailWebhookEvents, eq } from '@package/db-core';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { ReprocessEmailWebhookEventCommand } from '../../../commands';
import { EmailWebhookEventRepository } from '../../../repositories';
import { EmailWebhookProcessingService } from '../../../services';
import { ReprocessEmailWebhookEventHandler } from '../reprocess-email-webhook-event.handler';

import type { NodePgDatabase } from '@package/db-core';

jest.setTimeout(60000);

describe('ReprocessEmailWebhookEventHandler Integration', () => {
  let db: NodePgDatabase;
  let teardownDb: () => Promise<void> = async () => {};
  let handler: ReprocessEmailWebhookEventHandler;
  let processingService: jest.Mocked<Pick<EmailWebhookProcessingService, 'processWithDatabase'>>;
  let webhookEventId: number | null = null;

  beforeAll(async () => {
    const testUtils = await import('@package/test-utils');
    await testUtils.setupTestDatabaseJest();
    db = testUtils.getTestDb().db as unknown as NodePgDatabase;
    teardownDb = testUtils.teardownTestDatabase;

    processingService = {
      processWithDatabase: jest.fn()
    };

    const module = await Test.createTestingModule({
      providers: [
        ReprocessEmailWebhookEventHandler,
        EmailWebhookEventRepository,
        {
          provide: EmailWebhookProcessingService,
          useValue: processingService
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get(ReprocessEmailWebhookEventHandler);
  });

  beforeEach(async () => {
    processingService.processWithDatabase.mockReset();

    const [created] = await db
      .insert(emailWebhookEvents)
      .values({
        organizationId: null,
        emailMessageId: null,
        emailProviderMessageId: null,
        provider: 'resend',
        dedupeKey: `resend:delivery:integration-race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        providerMessageId: 'msg-integration-race',
        providerDeliveryId: 'delivery-integration-race',
        providerEventId: 'event-integration-race',
        providerEventType: 'email.delivered',
        normalizedEventType: 'delivered',
        verificationStatus: 'verified',
        processingStatus: 'failed',
        attemptCount: 1,
        occurredAt: new Date('2026-03-17T10:01:00.000Z'),
        rawBody: Buffer.from('{"type":"email.delivered"}'),
        rawPayloadJson: { type: 'email.delivered' },
        contentType: 'application/json',
        receivedAt: new Date('2026-03-17T10:01:01.000Z'),
        processedAt: new Date('2026-03-17T10:01:02.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning({ id: emailWebhookEvents.id });

    if (!created) {
      throw new Error('Failed to seed email webhook event for integration test');
    }

    webhookEventId = created.id;
  });

  afterEach(async () => {
    if (webhookEventId) {
      await db.delete(emailWebhookEvents).where(eq(emailWebhookEvents.id, webhookEventId));
      webhookEventId = null;
    }
  });

  afterAll(async () => {
    await teardownDb();
  });

  it('rejects a concurrent replay once another replay has claimed the event', async () => {
    if (!webhookEventId) {
      throw new Error('Expected seeded webhook event id');
    }

    const seededWebhookEventId = webhookEventId;
    let releaseFirstReplay: (() => void) | undefined;
    const firstReplayClaimed = new Promise<void>((resolve) => {
      processingService.processWithDatabase.mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((innerResolve) => {
          releaseFirstReplay = innerResolve;
        });

        const rows = await db
          .select()
          .from(emailWebhookEvents)
          .where(eq(emailWebhookEvents.id, seededWebhookEventId))
          .limit(1);
        const row = rows[0];
        if (!row) {
          throw new Error('Expected claimed webhook event to exist');
        }

        return row;
      });
    });

    const firstReplay = handler.execute(
      new ReprocessEmailWebhookEventCommand({ webhookEventId: seededWebhookEventId })
    );

    await firstReplayClaimed;

    await expect(
      handler.execute(
        new ReprocessEmailWebhookEventCommand({ webhookEventId: seededWebhookEventId })
      )
    ).rejects.toThrow('not eligible for reprocessing');

    if (!releaseFirstReplay) {
      throw new Error('Expected first replay to be blocked before releasing it');
    }
    releaseFirstReplay();

    const firstResult = await firstReplay;
    expect(firstResult).toEqual({
      webhookEventId: seededWebhookEventId,
      processingStatus: 'received',
      attemptCount: 2,
      reprocessed: true
    });

    const [stored] = await db
      .select()
      .from(emailWebhookEvents)
      .where(eq(emailWebhookEvents.id, seededWebhookEventId))
      .limit(1);

    expect(stored?.attemptCount).toBe(2);
    expect(stored?.processingStatus).toBe('received');
    expect(processingService.processWithDatabase).toHaveBeenCalledTimes(1);
  });
});
