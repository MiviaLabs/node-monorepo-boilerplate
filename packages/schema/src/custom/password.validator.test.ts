/**
 * Tests for password validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  strongPasswordSchema,
  mediumPasswordSchema,
  basicPasswordSchema
} from './password.validator';

describe('password.validator', () => {
  describe('strongPasswordSchema', () => {
    it('should accept valid strong passwords', () => {
      const validPasswords = ['StrongPass123!', 'MyP@ssw0rd', 'Complex!234', 'Aa1!Bb2@Cc3#'];

      for (const password of validPasswords) {
        const result = strongPasswordSchema.safeParse(password);
        assert.strictEqual(result.success, true, `Should accept: ${password}`);
        if (result.success) {
          assert.strictEqual(result.data, password);
        }
      }
    });

    it('should reject passwords shorter than 8 characters', () => {
      const result = strongPasswordSchema.safeParse('Str1!');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at least 8 characters'))
        );
      }
    });

    it('should reject passwords without lowercase letters', () => {
      const result = strongPasswordSchema.safeParse('STRONGPASS123!');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('lowercase')));
      }
    });

    it('should reject passwords without uppercase letters', () => {
      const result = strongPasswordSchema.safeParse('strongpass123!');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('uppercase')));
      }
    });

    it('should reject passwords without numbers', () => {
      const result = strongPasswordSchema.safeParse('StrongPassword!');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('number')));
      }
    });

    it('should reject passwords without special characters', () => {
      const result = strongPasswordSchema.safeParse('StrongPass123');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('special character')));
      }
    });

    it('should reject non-string values', () => {
      const result = strongPasswordSchema.safeParse(12345678);
      assert.strictEqual(result.success, false);
    });
  });

  describe('mediumPasswordSchema', () => {
    it('should accept valid medium passwords', () => {
      const validPasswords = ['MediumPass123', 'MyPassw0rd', 'Abc12345', 'Test1234'];

      for (const password of validPasswords) {
        const result = mediumPasswordSchema.safeParse(password);
        assert.strictEqual(result.success, true, `Should accept: ${password}`);
        if (result.success) {
          assert.strictEqual(result.data, password);
        }
      }
    });

    it('should reject passwords shorter than 8 characters', () => {
      const result = mediumPasswordSchema.safeParse('Med1');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some((issue) => issue.message.includes('at least 8 characters'))
        );
      }
    });

    it('should reject passwords without lowercase letters', () => {
      const result = mediumPasswordSchema.safeParse('MEDIUMPASS123');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('lowercase')));
      }
    });

    it('should reject passwords without uppercase letters', () => {
      const result = mediumPasswordSchema.safeParse('mediumpass123');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('uppercase')));
      }
    });

    it('should reject passwords without numbers', () => {
      const result = mediumPasswordSchema.safeParse('MediumPassword');
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues.some((issue) => issue.message.includes('number')));
      }
    });

    it('should accept passwords without special characters', () => {
      const result = mediumPasswordSchema.safeParse('MediumPass123');
      assert.strictEqual(result.success, true);
    });

    it('should reject non-string values', () => {
      const result = mediumPasswordSchema.safeParse(null);
      assert.strictEqual(result.success, false);
    });
  });

  describe('basicPasswordSchema', () => {
    it('should accept valid basic passwords (8+ characters)', () => {
      const validPasswords = ['password', '12345678', 'abcdefgh', 'PASSWORD', 'Pass123!'];

      for (const password of validPasswords) {
        const result = basicPasswordSchema.safeParse(password);
        assert.strictEqual(result.success, true, `Should accept: ${password}`);
        if (result.success) {
          assert.strictEqual(result.data, password);
        }
      }
    });

    it('should reject passwords shorter than 8 characters', () => {
      const shortPasswords = ['pass', '1234567', '      '];

      for (const password of shortPasswords) {
        const result = basicPasswordSchema.safeParse(password);
        assert.strictEqual(result.success, false, `Should reject: ${password}`);
      }
    });

    it('should reject non-string values', () => {
      const result = basicPasswordSchema.safeParse(undefined);
      assert.strictEqual(result.success, false);
    });

    it('should accept any string with 8 or more characters', () => {
      const result = basicPasswordSchema.safeParse('        '); // 8 spaces
      assert.strictEqual(result.success, true);
    });
  });
});
