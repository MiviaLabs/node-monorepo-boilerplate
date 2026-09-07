/**
 * Bug B3 Regression Tests
 *
 * VaultTransitProvider.isAvailable() used `catch { return false; }`, a
 * broad catch that collapsed 403 (token revoked), 472 (policy disabled),
 * 429 (Vault sealed), and DNS failures into a single boolean with no
 * diagnostic. healthCheck() delegates to isAvailable(), so operators had
 * no way to distinguish permanent failure from transient.
 *
 * Fix: introduce an isAvailableDetailed() method that returns
 * {available, reason, statusCode} so callers can log diagnostic info,
 * while isAvailable() preserves the simple boolean contract.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { VaultTransitProvider } from '../../../../src/providers/vault-transit.provider';

function makeVaultError(statusCode: number, message: string): Error {
  const err = new Error(message) as Error & {
    statusCode?: number;
    response?: { statusCode: number };
  };
  err.statusCode = statusCode;
  err.response = { statusCode };
  return err;
}

describe('VaultTransitProvider availability diagnostic (Bug B3)', () => {
  let provider: VaultTransitProvider;

  beforeEach(() => {
    provider = new VaultTransitProvider({
      address: 'https://vault.example.com',
      token: 'test-token',
      transitEnginePath: 'transit',
      keyName: 'default-key'
    });
  });

  it('isAvailableDetailed: surfaces 403 vs 429 vs 0 distinctly', async () => {
    // Stub the internal client.list to throw 403 then 429 then network error.
    const client = (provider as unknown as { client: { list: jest.Mock; write: jest.Mock } })
      .client;

    client.list = jest.fn(async () => {
      throw makeVaultError(403, 'permission denied');
    });
    const r403 = await (
      provider as unknown as {
        isAvailableDetailed: () => Promise<{
          available: boolean;
          reason: string;
          statusCode?: number;
        }>;
      }
    ).isAvailableDetailed();
    expect(r403.available).toBe(false);
    expect(r403.statusCode).toBe(403);

    client.list = jest.fn(async () => {
      throw makeVaultError(429, 'sealed');
    });
    const r429 = await (
      provider as unknown as {
        isAvailableDetailed: () => Promise<{
          available: boolean;
          reason: string;
          statusCode?: number;
        }>;
      }
    ).isAvailableDetailed();
    expect(r429.available).toBe(false);
    expect(r429.statusCode).toBe(429);

    client.list = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const rNet = await (
      provider as unknown as {
        isAvailableDetailed: () => Promise<{
          available: boolean;
          reason: string;
          statusCode?: number;
        }>;
      }
    ).isAvailableDetailed();
    expect(rNet.available).toBe(false);
    expect(rNet.statusCode).toBeUndefined();
    expect(rNet.reason).toMatch(/network|econnrefused|unknown/i);
  });

  it('isAvailable: still returns a boolean for backward compatibility', async () => {
    const client = (provider as unknown as { client: { list: jest.Mock; write: jest.Mock } })
      .client;
    client.list = jest.fn(async () => {
      throw makeVaultError(403, 'denied');
    });
    await expect(provider.isAvailable()).resolves.toBe(false);

    client.list = jest.fn(async () => ({ data: { keys: [] } }));
    await expect(provider.isAvailable()).resolves.toBe(true);
  });
});
