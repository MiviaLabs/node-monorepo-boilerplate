import type { IEmailWebhookProvider } from '../email-webhook-provider.interface';
import type { EmailWebhookVerificationRequest } from '../interfaces';

type ProviderConformanceHarness = {
  name: string;
  createProvider: () => IEmailWebhookProvider;
  createValidRequest: () => EmailWebhookVerificationRequest;
  createUnknownEventRequest: () => EmailWebhookVerificationRequest;
  createInvalidSignatureRequest: () => EmailWebhookVerificationRequest;
  expected: {
    provider: string;
    providerEventType: string;
    normalizedEventType: string;
    dedupeKey: string;
    storedHeaders: Record<string, unknown>;
  };
};

export function runWebhookProviderConformanceSuite(harness: ProviderConformanceHarness): void {
  describe(`${harness.name} webhook provider contract`, () => {
    it('verifies a valid signed webhook request and returns the required normalized fields', async () => {
      const provider = harness.createProvider();

      const result = await provider.verifyAndNormalizeWebhook(harness.createValidRequest());

      expect(result.event).toEqual(
        expect.objectContaining({
          provider: harness.expected.provider,
          providerEventType: harness.expected.providerEventType,
          normalizedEventType: harness.expected.normalizedEventType,
          dedupeKey: harness.expected.dedupeKey
        })
      );
      expect(result.event.rawEvent).toBeDefined();
    });

    it('rejects an invalid signed webhook request', async () => {
      const provider = harness.createProvider();

      await expect(
        provider.verifyAndNormalizeWebhook(harness.createInvalidSignatureRequest())
      ).rejects.toThrow();
    });

    it('normalizes unknown provider events to unknown instead of crashing', async () => {
      const provider = harness.createProvider();

      const result = await provider.verifyAndNormalizeWebhook(harness.createUnknownEventRequest());

      expect(result.event.normalizedEventType).toBe('unknown');
      expect(result.event.providerEventType).toBeTruthy();
      expect(result.event.dedupeKey).toBeTruthy();
    });

    it('projects only provider-safe stored headers', () => {
      const provider = harness.createProvider();
      const projectedHeaders = provider.projectStoredHeaders(harness.createValidRequest().headers);

      expect(projectedHeaders).toEqual(harness.expected.storedHeaders);
    });

    it('derives a stable dedupe key for the same webhook request', async () => {
      const provider = harness.createProvider();
      const request = harness.createValidRequest();

      const firstResult = await provider.verifyAndNormalizeWebhook(request);
      const secondResult = await provider.verifyAndNormalizeWebhook(request);

      expect(firstResult.event.dedupeKey).toBe(secondResult.event.dedupeKey);
    });
  });
}
