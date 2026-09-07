/**
 * Tests for username validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { usernameSchema, strictUsernameSchema } from './username.validator';

describe('username.validator', () => {
  describe('usernameSchema', () => {
    it('should accept valid usernames', () => {
      const validUsernames = [
        'john_doe',
        'jane-doe',
        'user123',
        'Test_User-2024',
        'abc',
        'a-b-c',
        'user_name123'
      ];

      for (const username of validUsernames) {
        const result = usernameSchema.safeParse(username);
        assert.strictEqual(result.success, true, `Should accept: ${username}`);
        if (result.success) {
          assert.strictEqual(result.data, username);
        }
      }
    });

    it('should reject usernames shorter than 3 characters', () => {
      const shortUsernames = ['ab', 'a', ''];

      for (const username of shortUsernames) {
        const result = usernameSchema.safeParse(username);
        assert.strictEqual(result.success, false, `Should reject: ${username}`);
        if (!result.success) {
          assert.ok(
            result.error.issues.some((issue) => issue.message.includes('at least 3 characters'))
          );
        }
      }
    });

    it('should reject usernames longer than 30 characters', () => {
      const longUsername = 'a'.repeat(31);
      const result = usernameSchema.safeParse(longUsername);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at most 30 characters'))
        );
      }
    });

    it('should reject usernames with invalid characters', () => {
      const invalidUsernames = ['user@name', 'user.name', 'user name', 'user$name', 'user#name'];

      for (const username of invalidUsernames) {
        const result = usernameSchema.safeParse(username);
        assert.strictEqual(result.success, false, `Should reject: ${username}`);
        if (!result.success) {
          assert.ok(
            result.error.issues.some((issue) =>
              issue.message.includes('can only contain letters, numbers, underscores, and hyphens')
            )
          );
        }
      }
    });

    it('should reject non-string values', () => {
      const result = usernameSchema.safeParse(123);
      assert.strictEqual(result.success, false);
    });

    it('should reject null and undefined', () => {
      assert.strictEqual(usernameSchema.safeParse(null).success, false);
      assert.strictEqual(usernameSchema.safeParse(undefined).success, false);
    });

    it('should accept exactly 30 character usernames', () => {
      const validLengthUsername = 'user_1234567890123456789012345';
      const result = usernameSchema.safeParse(validLengthUsername);
      assert.strictEqual(result.success, true);
    });
  });

  describe('strictUsernameSchema', () => {
    it('should accept valid strict usernames (letters and numbers only)', () => {
      const validUsernames = ['john123', 'JaneDoe', 'User2024', 'abc', 'ABC123', 'TestUser'];

      for (const username of validUsernames) {
        const result = strictUsernameSchema.safeParse(username);
        assert.strictEqual(result.success, true, `Should accept: ${username}`);
        if (result.success) {
          assert.strictEqual(result.data, username);
        }
      }
    });

    it('should reject usernames with underscores', () => {
      const result = strictUsernameSchema.safeParse('john_doe');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) =>
            issue.message.includes('can only contain letters and numbers')
          )
        );
      }
    });

    it('should reject usernames with hyphens', () => {
      const result = strictUsernameSchema.safeParse('john-doe');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) =>
            issue.message.includes('can only contain letters and numbers')
          )
        );
      }
    });

    it('should reject usernames with special characters', () => {
      const invalidUsernames = ['user@name', 'user.name', 'user$name'];

      for (const username of invalidUsernames) {
        const result = strictUsernameSchema.safeParse(username);
        assert.strictEqual(result.success, false, `Should reject: ${username}`);
      }
    });

    it('should reject usernames shorter than 3 characters', () => {
      const result = strictUsernameSchema.safeParse('ab');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at least 3 characters'))
        );
      }
    });

    it('should reject usernames longer than 30 characters', () => {
      const longUsername = 'user1234567890123456789012345678901';
      const result = strictUsernameSchema.safeParse(longUsername);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at most 30 characters'))
        );
      }
    });

    it('should reject non-string values', () => {
      const result = strictUsernameSchema.safeParse(12345);
      assert.strictEqual(result.success, false);
    });

    it('should reject null and undefined', () => {
      assert.strictEqual(strictUsernameSchema.safeParse(null).success, false);
      assert.strictEqual(strictUsernameSchema.safeParse(undefined).success, false);
    });

    it('should accept exactly 30 character usernames', () => {
      const validLengthUsername = 'User12345678901234567890123456';
      const result = strictUsernameSchema.safeParse(validLengthUsername);
      assert.strictEqual(result.success, true);
    });
  });
});
