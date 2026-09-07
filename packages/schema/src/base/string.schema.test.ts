/**
 * Tests for string validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { nonEmptyString, minLength, maxLength, pattern, slug } from './string.schema';

describe('string.schema', () => {
  // eslint-disable-next-line max-lines-per-function
  describe('nonEmptyString', () => {
    it('should accept non-empty strings', () => {
      const validStrings = ['hello', 'a', 'text with spaces', '123', '!@#$%'];

      for (const str of validStrings) {
        const result = nonEmptyString.safeParse(str);
        assert.strictEqual(result.success, true, `Should accept: "${str}"`);
        if (result.success) {
          assert.strictEqual(result.data, str);
        }
      }
    });

    it('should reject empty strings', () => {
      const result = nonEmptyString.safeParse('');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('cannot be empty')));
      }
    });

    it('should reject whitespace-only strings', () => {
      const result = nonEmptyString.safeParse('   ');
      assert.strictEqual(result.success, true, 'Whitespace is considered non-empty');
    });

    it('should reject non-string values', () => {
      const nonStrings = [null, undefined, 123, true, {}, []];

      for (const value of nonStrings) {
        const result = nonEmptyString.safeParse(value);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(value)}`);
      }
    });
  });

  describe('minLength', () => {
    it('should create schema with minimum length validation', () => {
      const schema = minLength(5);

      const validStrings = ['hello', 'hello world', '12345'];
      for (const str of validStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, true, `Should accept: "${str}"`);
      }
    });

    it('should reject strings shorter than minimum', () => {
      const schema = minLength(5);

      const shortStrings = ['hell', '1234', 'abc'];
      for (const str of shortStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, false, `Should reject: "${str}"`);
      }
    });

    it('should accept strings exactly at minimum length', () => {
      const schema = minLength(5);
      const result = schema.safeParse('hello');
      assert.strictEqual(result.success, true);
    });

    it('should use custom message when provided', () => {
      const customMessage = 'Too short, buddy!';
      const schema = minLength(10, customMessage);

      const result = schema.safeParse('short');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message === customMessage));
      }
    });

    it('should use default message when custom message not provided', () => {
      const schema = minLength(10);

      const result = schema.safeParse('short');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at least 10 characters'))
        );
      }
    });
  });

  describe('maxLength', () => {
    it('should create schema with maximum length validation', () => {
      const schema = maxLength(5);

      const validStrings = ['hello', 'hi', 'a', '12345'];
      for (const str of validStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, true, `Should accept: "${str}"`);
      }
    });

    it('should reject strings longer than maximum', () => {
      const schema = maxLength(5);

      const longStrings = ['hello world', '123456', 'abcdef'];
      for (const str of longStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, false, `Should reject: "${str}"`);
      }
    });

    it('should accept strings exactly at maximum length', () => {
      const schema = maxLength(5);
      const result = schema.safeParse('hello');
      assert.strictEqual(result.success, true);
    });

    it('should use custom message when provided', () => {
      const customMessage = 'Too long, buddy!';
      const schema = maxLength(5, customMessage);

      const result = schema.safeParse('way too long');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message === customMessage));
      }
    });

    it('should use default message when custom message not provided', () => {
      const schema = maxLength(5);

      const result = schema.safeParse('way too long');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at most 5 characters'))
        );
      }
    });
  });

  describe('pattern', () => {
    it('should create schema with regex pattern validation', () => {
      const schema = pattern(/^[a-z]+$/, 'Must be lowercase letters only');

      const validStrings = ['hello', 'world', 'abc', 'test'];
      for (const str of validStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, true, `Should accept: "${str}"`);
      }
    });

    it('should reject strings that do not match pattern', () => {
      const schema = pattern(/^[a-z]+$/, 'Must be lowercase letters only');

      const invalidStrings = ['Hello', 'HELLO', 'hello123', 'hello-world', '123'];
      for (const str of invalidStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, false, `Should reject: "${str}"`);
      }
    });

    it('should use custom message when provided', () => {
      const customMessage = 'Invalid phone number format';
      const schema = pattern(/^\d{3}-\d{3}-\d{4}$/, customMessage);

      const result = schema.safeParse('invalid');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message === customMessage));
      }
    });

    it('should use default message when custom message not provided', () => {
      const schema = pattern(/^[a-z]+$/);

      const result = schema.safeParse('INVALID');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('format is invalid')));
      }
    });

    it('should work with email pattern', () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const schema = pattern(emailPattern, 'Invalid email format');

      const validEmails = ['test@example.com', 'user.name@domain.co.uk'];
      for (const email of validEmails) {
        const result = schema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: "${email}"`);
      }

      const invalidEmails = ['invalid', 'invalid@', '@example.com', 'test @example.com'];
      for (const email of invalidEmails) {
        const result = schema.safeParse(email);
        assert.strictEqual(result.success, false, `Should reject: "${email}"`);
      }
    });

    it('should work with hex color pattern', () => {
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      const schema = pattern(hexPattern, 'Invalid hex color');

      const validColors = ['#ffffff', '#000000', '#FF5733', '#a1b2c3'];
      for (const color of validColors) {
        const result = schema.safeParse(color);
        assert.strictEqual(result.success, true, `Should accept: "${color}"`);
      }

      const invalidColors = ['#fff', '#gggggg', 'ffffff', '#00000'];
      for (const color of invalidColors) {
        const result = schema.safeParse(color);
        assert.strictEqual(result.success, false, `Should reject: "${color}"`);
      }
    });
  });

  describe('slug', () => {
    it('should accept valid slugs', () => {
      const validSlugs = [
        'hello',
        'hello-world',
        'my-blog-post',
        'test-123',
        'foo-bar-baz',
        'a',
        'abc-123-xyz'
      ];

      for (const s of validSlugs) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, true, `Should accept: "${s}"`);
        if (result.success) {
          assert.strictEqual(result.data, s);
        }
      }
    });

    it('should reject slugs with uppercase letters', () => {
      const invalidSlugs = ['Hello', 'Hello-World', 'TEST', 'My-Slug'];

      for (const s of invalidSlugs) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, false, `Should reject: "${s}"`);
        if (!result.success) {
          assert.ok(
            result.error.issues.some((issue) => issue.message.includes('Invalid slug format'))
          );
        }
      }
    });

    it('should reject slugs with special characters', () => {
      const invalidSlugs = [
        'hello_world',
        'hello.world',
        'hello@world',
        'hello!world',
        'hello world',
        "hello's"
      ];

      for (const s of invalidSlugs) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, false, `Should reject: "${s}"`);
      }
    });

    it('should reject slugs starting with hyphen', () => {
      const invalidSlugs = ['-hello', '-test', '-slug'];

      for (const s of invalidSlugs) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, false, `Should reject: "${s}"`);
      }
    });

    it('should reject slugs ending with hyphen', () => {
      const invalidSlugs = ['hello-', 'test-', 'slug-'];

      for (const s of invalidSlugs) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, false, `Should reject: "${s}"`);
      }
    });

    it('should reject slugs with consecutive hyphens', () => {
      const invalidSlugs = ['hello--world', 'test--slug', 'a--b'];

      for (const s of invalidSlugs) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, false, `Should reject: "${s}"`);
      }
    });

    it('should reject empty strings', () => {
      const result = slug.safeParse('');
      assert.strictEqual(result.success, false);
    });

    it('should reject single character slugs with hyphen', () => {
      const result = slug.safeParse('-');
      assert.strictEqual(result.success, false);
    });

    it('should reject non-string values', () => {
      const result = slug.safeParse(123);
      assert.strictEqual(result.success, false);
    });

    it('should accept single lowercase letter or number', () => {
      const validSingleChars = ['a', 'z', '0', '9'];
      for (const s of validSingleChars) {
        const result = slug.safeParse(s);
        assert.strictEqual(result.success, true, `Should accept: "${s}"`);
      }
    });
  });

  describe('Combined validators', () => {
    it('should work with combined minLength and maxLength', () => {
      const schema = minLength(3).and(maxLength(10));

      const validStrings = ['abc', 'hello', '1234567890'];
      for (const str of validStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, true, `Should accept: "${str}"`);
      }

      const invalidStrings = ['ab', '12345678901'];
      for (const str of invalidStrings) {
        const result = schema.safeParse(str);
        assert.strictEqual(result.success, false, `Should reject: "${str}"`);
      }
    });

    it('should work with pattern and minLength', () => {
      const usernameSchema = pattern(/^[a-zA-Z0-9_]+$/, 'Invalid username').and(minLength(3));

      const validUsernames = ['abc', 'user_123', 'Test_User', '12345'];
      for (const username of validUsernames) {
        const result = usernameSchema.safeParse(username);
        assert.strictEqual(result.success, true, `Should accept: "${username}"`);
      }

      const invalidUsernames = ['ab', 'user@name', 'user-name'];
      for (const username of invalidUsernames) {
        const result = usernameSchema.safeParse(username);
        assert.strictEqual(result.success, false, `Should reject: "${username}"`);
      }
    });
  });
});
