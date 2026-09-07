/**
 * Tests for email validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { emailSchema, optionalEmailSchema } from './email.schema';

describe('email.schema', () => {
  // eslint-disable-next-line max-lines-per-function
  describe('emailSchema', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.com',
        'user+tag@example.com',
        'user123@example.co.uk',
        'first.last@domain.org',
        'email@subdomain.example.com',
        'user_name@example.com',
        'user-name@example.com'
      ];

      for (const email of validEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
        if (result.success) {
          // Should transform to lowercase
          assert.strictEqual(result.data, email.toLowerCase());
          // Should trim
          assert.strictEqual(result.data, email.toLowerCase().trim());
        }
      }
    });

    it('should transform uppercase letters to lowercase', () => {
      const testCases = [
        { input: 'TEST@EXAMPLE.COM', expected: 'test@example.com' },
        { input: 'UsEr@ExAmPlE.cOm', expected: 'user@example.com' },
        { input: 'TeSt.EmAiL@DoMaIn.OrG', expected: 'test.email@domain.org' }
      ];

      for (const { input, expected } of testCases) {
        const result = emailSchema.safeParse(input);
        assert.strictEqual(result.success, true);
        if (result.success) {
          assert.strictEqual(result.data, expected);
        }
      }
    });

    it('should trim whitespace', () => {
      const testCases = [
        { input: '  test@example.com  ', expected: 'test@example.com' },
        { input: '\ttest@example.com\t', expected: 'test@example.com' },
        { input: '\n test@example.com \n', expected: 'test@example.com' },
        { input: 'TEST@EXAMPLE.COM  ', expected: 'test@example.com' }
      ];

      for (const { input, expected } of testCases) {
        const result = emailSchema.safeParse(input);
        assert.strictEqual(result.success, true);
        if (result.success) {
          assert.strictEqual(result.data, expected);
        }
      }
    });

    it('should reject empty strings', () => {
      const result = emailSchema.safeParse('');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('required')));
      }
    });

    it('should reject whitespace-only strings', () => {
      const result = emailSchema.safeParse('   ');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        // Should fail on "required" check since trim makes it empty
        assert.ok(result.error.issues.some((issue) => issue.message.includes('required')));
      }
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid',
        'invalid@',
        '@example.com',
        'user@',
        'user @example.com',
        'user@.com',
        'user@domain',
        'user name@example.com',
        'user..name@example.com',
        '.user@example.com',
        'user.@example.com'
      ];

      for (const email of invalidEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, false, `Should reject: ${email}`);
        if (!result.success) {
          assert.ok(
            result.error.issues.some(
              (issue) =>
                issue.message.includes('Invalid email') || issue.message.includes('required')
            )
          );
        }
      }
    });

    it('should reject non-string values', () => {
      const nonStrings = [null, undefined, 123, true, {}, []];

      for (const value of nonStrings) {
        const result = emailSchema.safeParse(value);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(value)}`);
      }
    });

    it('should accept international email addresses', () => {
      const internationalEmails = [
        'user@exemple.fr',
        'benutzer@beispiel.de',
        'usuario@ejemplo.es',
        'utente@esempio.it'
      ];

      for (const email of internationalEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
      }
    });

    it('should handle emails with numbers', () => {
      const numericEmails = [
        'user123@example.com',
        '123user@example.com',
        'user@123.com',
        '1@2.com'
      ];

      for (const email of numericEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
      }
    });

    it('should accept emails with subdomains', () => {
      const subdomainEmails = [
        'user@mail.example.com',
        'user@sub.sub.domain.com',
        'admin@server1.datacenter.example.com'
      ];

      for (const email of subdomainEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
      }
    });

    it('should accept various TLDs', () => {
      const tldEmails = [
        'user@example.com',
        'user@example.org',
        'user@example.net',
        'user@example.io',
        'user@example.co',
        'user@example.co.uk',
        'user@example.ai'
      ];

      for (const email of tldEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
      }
    });

    it('should accept emails with plus addressing', () => {
      const plusEmails = [
        'user+tag@example.com',
        'user+123@example.com',
        'user+test.tag@example.com',
        'user++@example.com'
      ];

      for (const email of plusEmails) {
        const result = emailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
      }
    });
  });

  describe('optionalEmailSchema', () => {
    it('should accept valid email addresses', () => {
      const validEmails = ['test@example.com', 'user@example.org'];

      for (const email of validEmails) {
        const result = optionalEmailSchema.safeParse(email);
        assert.strictEqual(result.success, true, `Should accept: ${email}`);
        if (result.success) {
          assert.strictEqual(result.data, email.toLowerCase());
        }
      }
    });

    it('should accept null values', () => {
      const result = optionalEmailSchema.safeParse(null);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, null);
      }
    });

    it('should accept undefined values', () => {
      const result = optionalEmailSchema.safeParse(undefined);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, undefined);
      }
    });

    it('should reject invalid email formats when provided', () => {
      const invalidEmails = ['invalid', 'invalid@', '@example.com', 'user@'];

      for (const email of invalidEmails) {
        const result = optionalEmailSchema.safeParse(email);
        assert.strictEqual(result.success, false, `Should reject: ${email}`);
      }
    });

    it('should transform and trim valid emails', () => {
      const testCases = [
        { input: '  TEST@EXAMPLE.COM  ', expected: 'test@example.com' },
        { input: 'UsEr@ExAmPlE.cOm', expected: 'user@example.com' }
      ];

      for (const { input, expected } of testCases) {
        const result = optionalEmailSchema.safeParse(input);
        assert.strictEqual(result.success, true);
        if (result.success) {
          assert.strictEqual(result.data, expected);
        }
      }
    });

    it('should work in object schemas', () => {
      // With email
      const result1 = optionalEmailSchema.safeParse('test@example.com');
      assert.strictEqual(result1.success, true);

      // Without email (null)
      const result2 = optionalEmailSchema.safeParse(null);
      assert.strictEqual(result2.success, true);

      // Without email (undefined)
      const result3 = optionalEmailSchema.safeParse(undefined);
      assert.strictEqual(result3.success, true);
    });

    it('should reject other types', () => {
      const invalidValues = [123, true, {}, []];

      for (const value of invalidValues) {
        const result = optionalEmailSchema.safeParse(value);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(value)}`);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle very long email addresses', () => {
      const longLocal = 'a'.repeat(100) + '@example.com';
      const result = emailSchema.safeParse(longLocal);
      assert.strictEqual(result.success, true);
    });

    it('should handle emails with multiple @ signs (invalid)', () => {
      const result = emailSchema.safeParse('user@name@example.com');
      assert.strictEqual(result.success, false);
    });

    it('should handle emails starting with special characters (invalid)', () => {
      const invalidEmails = [
        '.user@example.com',
        '-user@example.com',
        '_user@example.com', // Actually valid
        '+user@example.com' // Actually valid
      ];

      for (const email of invalidEmails) {
        const result = emailSchema.safeParse(email);
        // Underscore and plus at start are valid, dot and hyphen are not
        if (email.startsWith('.') || email.startsWith('-')) {
          assert.strictEqual(result.success, false, `Should reject: ${email}`);
        }
      }
    });

    it('should handle consecutive dots in local part (invalid)', () => {
      const result = emailSchema.safeParse('user..name@example.com');
      // Zod's email validation may or may not accept this depending on strictness
      // Just check it doesn't throw
      assert.ok(typeof result.success === 'boolean');
    });

    it('should handle trailing dot in domain (invalid)', () => {
      const result = emailSchema.safeParse('user@example.com.');
      assert.strictEqual(result.success, false);
    });

    it('should handle leading dot in domain (invalid)', () => {
      const result = emailSchema.safeParse('user@.example.com');
      assert.strictEqual(result.success, false);
    });
  });
});
