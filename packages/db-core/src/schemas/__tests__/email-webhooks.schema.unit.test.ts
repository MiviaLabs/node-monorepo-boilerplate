import { describe, expect, it } from '@jest/globals';

import {
  EMAIL_MESSAGE_DIRECTION_ENUM,
  EMAIL_MESSAGE_STATUS_ENUM,
  EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM,
  EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM,
  emailMessages,
  emailProviderMessages,
  emailWebhookEvents
} from '../index';

describe('email webhook persistence schemas', () => {
  it('should expose the email persistence tables', () => {
    expect(typeof emailMessages).toBe('object');
    expect(typeof emailProviderMessages).toBe('object');
    expect(typeof emailWebhookEvents).toBe('object');
    expect(emailMessages.requestId).toBeDefined();
    expect(emailProviderMessages.attemptNumber).toBeDefined();
    expect(emailProviderMessages.requestId).toBeDefined();
    expect(emailProviderMessages.tagsJson).toBeDefined();
    expect(emailProviderMessages.providerDeliveryId).toBeDefined();
    expect(emailProviderMessages.providerEventId).toBeDefined();
    expect(emailProviderMessages.normalizedStatus).toBeDefined();
    expect(emailProviderMessages.lastWebhookOccurredAt).toBeDefined();
    expect(emailWebhookEvents.providerEventId).toBeDefined();
    expect(emailWebhookEvents.tagsJson).toBeDefined();
  });

  it('should expose the supported message directions and statuses', () => {
    expect(EMAIL_MESSAGE_DIRECTION_ENUM).toEqual(['outbound', 'inbound']);
    expect(EMAIL_MESSAGE_STATUS_ENUM).toEqual([
      'pending',
      'accepted',
      'delivered',
      'bounced',
      'complained',
      'failed',
      'cancelled'
    ]);
  });

  it('should expose the supported webhook processing statuses', () => {
    expect(EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM).toEqual([
      'received',
      'duplicate',
      'persisted',
      'unmatched',
      'applied',
      'failed'
    ]);
  });

  it('should expose the supported webhook verification statuses', () => {
    expect(EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM).toEqual(['verified', 'rejected']);
  });
});
