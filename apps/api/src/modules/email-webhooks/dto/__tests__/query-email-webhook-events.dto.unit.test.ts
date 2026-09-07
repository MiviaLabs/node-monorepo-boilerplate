import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryEmailWebhookEventsDto } from '../query-email-webhook-events.dto';

import type { ValidationError } from 'class-validator';

async function validateDto(
  data: Record<string, unknown>
): Promise<{ instance: QueryEmailWebhookEventsDto; errors: ValidationError[] }> {
  const instance = plainToInstance(QueryEmailWebhookEventsDto, data);
  const errors = await validate(instance);

  return { instance, errors };
}

describe('QueryEmailWebhookEventsDto', () => {
  it('accepts and transforms the expanded webhook filter surface', async () => {
    const { instance, errors } = await validateDto({
      page: '2',
      pageSize: '50',
      provider: 'resend',
      organizationId: '44',
      processingStatus: 'failed',
      verificationStatus: 'verified',
      normalizedEventType: 'delivered',
      providerEventType: 'email.delivered',
      providerMessageId: 'msg-44',
      providerDeliveryId: 'delivery-44',
      providerEventId: 'event-44',
      emailMessageId: '77',
      dateFrom: '2026-03-01T00:00:00.000Z',
      dateTo: '2026-03-31T23:59:59.999Z'
    });

    expect(errors).toHaveLength(0);
    expect(instance).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        provider: 'resend',
        organizationId: 44,
        processingStatus: 'failed',
        verificationStatus: 'verified',
        normalizedEventType: 'delivered',
        providerEventType: 'email.delivered',
        providerMessageId: 'msg-44',
        providerDeliveryId: 'delivery-44',
        providerEventId: 'event-44',
        emailMessageId: 77,
        dateFrom: '2026-03-01T00:00:00.000Z',
        dateTo: '2026-03-31T23:59:59.999Z'
      })
    );
  });

  it('rejects invalid enum, integer, and date filters', async () => {
    const { errors } = await validateDto({
      page: '0',
      pageSize: '101',
      organizationId: '-4',
      processingStatus: 'broken',
      verificationStatus: 'maybe',
      emailMessageId: '0',
      dateFrom: 'not-a-date',
      dateTo: 'still-not-a-date'
    });

    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'page',
        'pageSize',
        'organizationId',
        'processingStatus',
        'verificationStatus',
        'emailMessageId',
        'dateFrom',
        'dateTo'
      ])
    );
  });

  it('rejects inverted date ranges', async () => {
    const { errors } = await validateDto({
      dateFrom: '2026-03-31T23:59:59.999Z',
      dateTo: '2026-03-01T00:00:00.000Z'
    });

    expect(errors.map((error) => error.property)).toContain('dateTo');
  });
});
