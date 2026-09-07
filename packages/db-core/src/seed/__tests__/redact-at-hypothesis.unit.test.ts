/**
 * Test: redactDatabaseUrl should fully redact passwords containing literal @
 * per documented behavior "Handles passwords with special characters including @."
 */

import { describe, expect, it } from '@jest/globals';

import { redactDatabaseUrl } from '../seed-runner';

describe('redactDatabaseUrl literal @ in password', () => {
  it('should not leak any part of a password that contains literal @', () => {
    const url = 'postgresql://user:mysecret@123@localhost:5432/db';
    const redacted = redactDatabaseUrl(url);

    // The password "mysecret@123" should be fully replaced with ****
    // Both halves ("mysecret" and "@123") should be absent from the redacted URL
    expect(redacted.includes('mysecret')).toBe(false);
    expect(redacted.includes('@123')).toBe(false);
  });
});
