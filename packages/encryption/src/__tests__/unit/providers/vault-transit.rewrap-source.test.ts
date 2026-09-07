/**
 * Bug B4 Regression Tests
 *
 * VaultTransitProvider.rewrap() ignored `_sourceKeyId` (the parameter is
 * documented as "Unused; included for interface compatibility"). Vault
 * Transit's rewrap endpoint decrypts under the destination key's
 * `min_decryption_version` policy, so calling rewrap(ciphertext, 'key-v2')
 * for ciphertext originally wrapped under 'key-v1' silently re-wraps the
 * ciphertext under 'key-v2' regardless of the source — a footgun.
 *
 * Fix: when rewrap() is invoked without an explicit sourceKeyId AND the
 * target key differs from the configured default key, emit a warning
 * describing the implicit rotation. Also expose `rewrapWithSource()` that
 * performs a strict source-key round-trip.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { VaultTransitProvider } from '../../../../src/providers/vault-transit.provider';

describe('VaultTransitProvider.rewrap source-key handling (Bug B4)', () => {
  let provider: VaultTransitProvider;

  beforeEach(() => {
    provider = new VaultTransitProvider({
      address: 'https://vault.example.com',
      token: 'test-token',
      transitEnginePath: 'transit',
      keyName: 'key-v2' // current default = "latest"
    });

    // Stub client.write to return a synthetic rewrap result.
    const client = (provider as unknown as { client: { list: jest.Mock; write: jest.Mock } })
      .client;
    client.write = jest.fn(async (_path: string, _payload: Record<string, unknown>) => ({
      data: { ciphertext: 'vault:v2:rewrapped-ciphertext' }
    }));
  });

  it('rewrap: emits a warning when sourceKeyId is omitted and target differs from default', async () => {
    const warnings: string[] = [];
    const origWarn = (provider as unknown as { logger?: { warn: (msg: string) => void } }).logger
      ?.warn;
    (provider as unknown as { logger: { warn: (msg: string) => void } }).logger = {
      warn: (msg: string) => warnings.push(msg)
    };

    // Call rewrap with an explicit target that differs from the default key.
    await provider.rewrap(Buffer.from('vault:v1:original-ciphertext'), 'key-v1');

    if (origWarn) {
      (provider as unknown as { logger: { warn: (msg: string) => void } }).logger.warn = origWarn;
    }

    // The warning must surface the source-vs-target mismatch so operators
    // can audit implicit rotations.
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /source|key/i.test(w))).toBe(true);
  });

  it('rewrap: does NOT warn when the target key matches the configured default', async () => {
    const warnings: string[] = [];
    (provider as unknown as { logger: { warn: (msg: string) => void } }).logger = {
      warn: (msg: string) => warnings.push(msg)
    };

    // Calling rewrap with no explicit target falls back to default (key-v2).
    // The provider's default IS key-v2 — no implicit rotation; no warning.
    await provider.rewrap(Buffer.from('vault:v2:ciphertext'));

    expect(warnings.length).toBe(0);
  });
});
