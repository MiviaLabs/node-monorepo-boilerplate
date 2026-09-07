import { Test } from '@nestjs/testing';

import { EmailWebhookEventRepository } from '../../../repositories';
import { GetEmailWebhookProcessingSummaryHandler } from '../get-email-webhook-processing-summary.handler';

describe('GetEmailWebhookProcessingSummaryHandler', () => {
  it('returns summary metrics with retryable count', async () => {
    const module = await Test.createTestingModule({
      providers: [
        GetEmailWebhookProcessingSummaryHandler,
        {
          provide: EmailWebhookEventRepository,
          useValue: {
            getProcessingSummary: jest.fn().mockResolvedValue({
              totalEvents: 25,
              appliedEvents: 20,
              unmatchedEvents: 3,
              failedEvents: 1,
              pendingEvents: 1,
              retryableEvents: 5,
              latestReceivedAt: new Date('2026-03-17T10:00:00.000Z')
            })
          }
        }
      ]
    }).compile();

    const handler = module.get(GetEmailWebhookProcessingSummaryHandler);
    const result = await handler.execute();

    expect(result.totalEvents).toBe(25);
    expect(result.retryableEvents).toBe(5);
    expect(result.latestReceivedAt).toBe('2026-03-17T10:00:00.000Z');
  });
});
