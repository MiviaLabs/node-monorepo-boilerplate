import { EmailWebhookProviderRegistry } from '../provider-registry';
import { createMockWebhookRequest, MockWebhookProvider } from './fixtures/mock-webhook-provider';

describe('EmailWebhookProviderRegistry', () => {
  it('resolves providers case-insensitively by registered provider name', async () => {
    const registry = new EmailWebhookProviderRegistry();
    const provider = new MockWebhookProvider('registry-secret');
    registry.register(provider);

    const resolved = registry.get('MOCK-PROVIDER');
    expect(resolved).toBe(provider);
    expect(registry.has('mock-provider')).toBe(true);
    expect(registry.list()).toEqual(['mock-provider']);

    const result = await resolved?.verifyAndNormalizeWebhook(
      createMockWebhookRequest(
        {
          event: 'message.delivered',
          eventId: 'evt_registry_1',
          messageId: 'msg_registry_1'
        },
        'registry-secret'
      )
    );

    expect(result?.event.provider).toBe('mock-provider');
  });

  it('supports lazy provider factories and preserves provider availability before construction', async () => {
    const registry = new EmailWebhookProviderRegistry();
    registry.registerFactory('mock-provider', () => new MockWebhookProvider('factory-secret'));

    expect(registry.has('mock-provider')).toBe(true);
    expect(registry.list()).toEqual(['mock-provider']);

    const resolved = registry.get('mock-provider');
    expect(resolved?.provider).toBe('mock-provider');

    const result = await resolved?.verifyAndNormalizeWebhook(
      createMockWebhookRequest(
        {
          event: 'message.delivered',
          eventId: 'evt_factory_1',
          messageId: 'msg_factory_1'
        },
        'factory-secret'
      )
    );

    expect(result?.event.dedupeKey).toBe('mock-provider:event:evt_factory_1');
  });
});
