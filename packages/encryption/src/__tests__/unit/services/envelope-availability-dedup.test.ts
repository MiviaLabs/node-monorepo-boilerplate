/**
 * Bug A3 Regression Tests
 *
 * EnvelopeEncryptionService.checkAvailability() does not deduplicate
 * concurrent calls. Under contention, N concurrent encrypt() calls each
 * trigger a separate performAvailabilityProbes() against the KMS provider,
 * producing N redundant network round-trips and race-prone writes to the
 * shared cache state.
 *
 * Fix: introduce an in-flight promise field; if a probe is currently
 * running, concurrent callers await the same promise.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { EnvelopeEncryptionService } from '../../../services/envelope-encryption.service';
import type { IKmsProvider } from '../../../providers/kms-provider.interface';

class ControllableProvider implements IKmsProvider {
  readonly name = 'controllable';
  private probeResolvers: Array<(value: boolean) => void> = [];

  /** Resolves the Nth pending isAvailable probe. */
  resolveNextProbe(value: boolean): void {
    const r = this.probeResolvers.shift();
    if (r) r(value);
  }

  isAvailableProbeCount = 0;

  async isAvailable(): Promise<boolean> {
    this.isAvailableProbeCount++;
    return new Promise<boolean>((resolve) => this.probeResolvers.push(resolve));
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  encrypt = jest.fn(
    async (_plaintext: Buffer, _keyId?: string): Promise<Buffer> => Buffer.from('ct')
  );
  decrypt = jest.fn(
    async (_ciphertext: Buffer, _keyId?: string): Promise<Buffer> => Buffer.from('pt')
  );
  generateDataKey = jest.fn();
  async getKeyInfo() {
    throw new Error('not used');
  }
}

describe('EnvelopeEncryptionService.checkAvailability dedup (Bug A3)', () => {
  let provider: ControllableProvider;
  let service: EnvelopeEncryptionService;

  beforeEach(() => {
    provider = new ControllableProvider();
    // availabilityCacheTtlMs 0 ensures cache is always stale so a probe runs.
    service = new EnvelopeEncryptionService(provider, { availabilityCacheTtlMs: 0 });
  });

  it('coalesces N concurrent checkAvailability calls into a single probe', async () => {
    // Fire 10 concurrent encrypt() calls.
    const promises = Array.from({ length: 10 }, (_, i) =>
      service.encrypt(`msg-${i}`, { keyId: 'k' }).catch(() => 'encrypted')
    );

    // All 10 should share the same in-flight probe; isAvailable was called only once.
    expect(provider.isAvailableProbeCount).toBe(1);

    // Resolve the (single) probe.
    provider.resolveNextProbe(true);

    await Promise.all(promises);

    // Confirm: still only 1 probe, not 10.
    expect(provider.isAvailableProbeCount).toBe(1);
  });

  it('returns the same boolean to all coalesced callers', async () => {
    const promiseA = (
      service as unknown as { checkAvailability: () => Promise<boolean> }
    ).checkAvailability();
    const promiseB = (
      service as unknown as { checkAvailability: () => Promise<boolean> }
    ).checkAvailability();

    provider.resolveNextProbe(true);

    const [a, b] = await Promise.all([promiseA, promiseB]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(provider.isAvailableProbeCount).toBe(1);
  });
});
