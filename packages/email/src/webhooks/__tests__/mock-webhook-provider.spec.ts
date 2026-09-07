import { createMockWebhookRequest, MockWebhookProvider } from './fixtures/mock-webhook-provider';
import { runWebhookProviderConformanceSuite } from './provider-conformance.shared';

const mockSecret = 'mock-secret';

runWebhookProviderConformanceSuite({
  name: 'MockWebhookProvider',
  createProvider: () => new MockWebhookProvider(mockSecret),
  createValidRequest: () =>
    createMockWebhookRequest(
      {
        event: 'message.delivered',
        eventId: 'evt_mock_valid',
        messageId: 'msg_mock_valid',
        occurredAt: '2026-03-17T09:25:00.000Z',
        tags: {
          tenantId: 'tenant_123'
        }
      },
      mockSecret
    ),
  createUnknownEventRequest: () =>
    createMockWebhookRequest(
      {
        event: 'message.rendered',
        eventId: 'evt_mock_unknown',
        messageId: 'msg_mock_unknown'
      },
      mockSecret
    ),
  createInvalidSignatureRequest: () =>
    createMockWebhookRequest(
      {
        event: 'message.delivered',
        eventId: 'evt_mock_invalid',
        messageId: 'msg_mock_invalid'
      },
      'different-secret'
    ),
  expected: {
    provider: 'mock-provider',
    providerEventType: 'message.delivered',
    normalizedEventType: 'delivered',
    dedupeKey: 'mock-provider:event:evt_mock_valid',
    storedHeaders: {
      'content-type': 'application/json',
      'x-mock-request-id': 'evt_mock_valid'
    }
  }
});
