/**
 * Bug B7 Regression Tests
 *
 * EnvVarProvider had three security weaknesses:
 *
 *   (a) parseKey() only checked key length. An all-zero 32-byte buffer
 *       passes the check, and AES-256 with an all-zero key is trivially
 *       recoverable. An operator setting ENCRYPTION_KEY=0000…0000 gets a
 *       "working" provider using a catastrophically weak key.
 *
 *   (b) loadKeys() silently swallowed parseKey errors for env-var keys
 *       (try { parseKey } catch (skipped)). A deployment with a
 *       bad ENCRYPTION_KEY_primary value plus a valid default key loads
 *       the default but drops the tenant key with no log. Subsequent
 *       decrypt(buf, 'primary') throws KeyNotFoundError instead of the
 *       actual parse error — debugging confusion.
 *
 *   (c) strictProductionCheck defaulted to false. A deployment registered
 *       with NODE_ENV=production but no strictProductionCheck gets only a
 *       console.warn, allowing ENV_VAR provider to ship in production.
 *
 * Fix:
 *   - parseKey() rejects all-zero buffers.
 *   - env-var parse errors are logged (warn) and surfaced on first use.
 *   - strictProductionCheck defaults to true.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { EnvVarProvider } from '../../../../src/providers/env-var.provider';

describe('EnvVarProvider hardening (Bug B7)', () => {
  let origEnv: NodeJS.ProcessEnv;
  let origNodeEnv: string | undefined;
  let origConsoleWarn: typeof console.warn;

  beforeEach(() => {
    origEnv = process.env;
    origNodeEnv = process.env['NODE_ENV'];
    origConsoleWarn = console.warn;
    process.env = { ...origEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = origEnv;
    process.env['NODE_ENV'] = origNodeEnv;
    console.warn = origConsoleWarn;
  });

  describe('parseKey rejects all-zero keys (B7a)', () => {
    it('rejects an all-zero 32-byte AES key', () => {
      const zeroKey = '0'.repeat(64);
      expect(() => {
        new EnvVarProvider({
          encryptionKey: zeroKey,
          allowProduction: true
        });
      }).toThrow(/zero|empty|all-zero/i);
    });
  });

  describe('silent env-var parse failure (B7b)', () => {
    it('logs a warning when an env-var key fails to parse', () => {
      const warnings: string[] = [];
      console.warn = jest.fn((msg: string) => warnings.push(msg)) as typeof console.warn;

      // A default valid key plus a tenant key with bad hex.
      process.env['ENCRYPTION_KEY'] = '0'.repeat(64); // valid length, but all-zero → rejected
      process.env['ENCRYPTION_KEY_tenant-a'] = 'not-hex-data';

      new EnvVarProvider({
        encryptionKey: 'a'.repeat(64), // non-zero valid key
        allowProduction: true
      });

      // The bad tenant key parse failure must surface a warning (not silent).
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => /tenant-a|parse|invalid/i.test(w))).toBe(true);
    });
  });

  describe('strictProductionCheck defaults to true (B7c)', () => {
    it('throws InvalidKmsConfigError when used in production with no override', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['ENCRYPTION_KEY'] = 'a'.repeat(64);
      expect(() => {
        new EnvVarProvider({}); // no allowProduction, no strictProductionCheck opt-out
      }).toThrow(/production/i);
    });

    it('does not throw in development even with default config', () => {
      process.env['NODE_ENV'] = 'development';
      process.env['ENCRYPTION_KEY'] = 'a'.repeat(64);
      expect(() => new EnvVarProvider({})).not.toThrow();
    });
  });
});
