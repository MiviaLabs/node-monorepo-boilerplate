/**
 * Tests for error formatting utilities
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { z } from 'zod';

import { formatZodError, formatZodErrorMessage } from './error-formatter';

describe('error-formatter', () => {
  describe('formatZodError', () => {
    // eslint-disable-next-line max-lines-per-function
    it('should format single error', () => {
      const schema = z.string().min(5);
      const result = schema.safeParse('abc');

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.strictEqual(formatted.length, 1);
        assert.strictEqual(formatted[0]?.field, '');
        assert.ok(formatted[0]?.message.includes('5'));
        assert.strictEqual(formatted[0]?.code, 'too_small');
      }
    });

    it('should format multiple errors', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().min(18),
        email: z.string().email()
      });
      const result = schema.safeParse({ name: 'Jo', age: 15, email: 'invalid' });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.ok(formatted.length >= 3);
        assert.ok(formatted.some((e) => e.field === 'name'));
        assert.ok(formatted.some((e) => e.field === 'age'));
        assert.ok(formatted.some((e) => e.field === 'email'));
      }
    });

    it('should include error codes', () => {
      const testCases = [
        { schema: z.string().min(5), input: 'abc', expectedCode: 'too_small' },
        { schema: z.string().max(3), input: 'abcdef', expectedCode: 'too_big' },
        { schema: z.string().email(), input: 'invalid', expectedCode: 'invalid_format' },
        { schema: z.number().int(), input: 1.5, expectedCode: 'invalid_type' }
      ];

      for (const { schema, input, expectedCode } of testCases) {
        const result = schema.safeParse(input);
        assert.strictEqual(result.success, false);
        if (!result.success) {
          const formatted = formatZodError(result.error);
          assert.ok(formatted.some((e) => e.code === expectedCode));
        }
      }
    });

    it('should format nested field paths correctly', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string().min(3)
          })
        })
      });
      const result = schema.safeParse({ user: { profile: { name: 'Jo' } } });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.ok(formatted.some((e) => e.field === 'user.profile.name'));
      }
    });

    it('should format array field paths correctly', () => {
      const schema = z.object({
        items: z.array(z.object({ name: z.string().min(3) }))
      });
      const result = schema.safeParse({ items: [{ name: 'Ok' }, { name: 'Ba' }] });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.ok(formatted.some((e) => e.field === 'items.1.name'));
      }
    });

    it('should handle complex nested structures', () => {
      const schema = z.object({
        data: z.object({
          users: z.array(
            z.object({
              name: z.string().min(3),
              posts: z.array(
                z.object({
                  title: z.string().min(5)
                })
              )
            })
          )
        })
      });

      const input = {
        data: {
          users: [{ name: 'Jo', posts: [{ title: 'Hi' }] }]
        }
      };

      const result = schema.safeParse(input);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.ok(formatted.length >= 2);
        assert.ok(formatted.some((e) => e.field === 'data.users.0.name'));
        assert.ok(formatted.some((e) => e.field === 'data.users.0.posts.0.title'));
      }
    });

    it('should handle root level errors', () => {
      const schema = z.string();
      const result = schema.safeParse(123);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.strictEqual(formatted.length, 1);
        assert.strictEqual(formatted[0]?.field, '');
      }
    });

    it('should work with union errors', () => {
      const schema = z.union([z.string(), z.number()]);
      const result = schema.safeParse(true);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.ok(formatted.length >= 1);
      }
    });

    it('should format refinement errors', () => {
      const schema = z.number().refine((n) => n % 2 === 0, {
        message: 'Must be an even number'
      });
      const result = schema.safeParse(3);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        assert.strictEqual(formatted.length, 1);
        assert.strictEqual(formatted[0]?.message, 'Must be an even number');
        assert.strictEqual(formatted[0]?.code, 'custom');
      }
    });
  });

  describe('formatZodErrorMessage', () => {
    it('should format single error as message', () => {
      const schema = z.string().min(5);
      const result = schema.safeParse('abc');

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        assert.ok(message.includes('5'));
      }
    });

    it('should format multiple errors as comma-separated message', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().min(18)
      });
      const result = schema.safeParse({ name: 'Jo', age: 15 });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        assert.ok(message.includes(', '));
        assert.ok(message.includes('name:'));
        assert.ok(message.includes('age:'));
      }
    });

    it('should include field paths in message', () => {
      const schema = z.object({
        user: z.object({
          name: z.string().min(3)
        })
      });
      const result = schema.safeParse({ user: { name: 'Jo' } });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        assert.ok(message.includes('user.name:'));
      }
    });

    it('should handle root level errors without field prefix', () => {
      const schema = z.string();
      const result = schema.safeParse(123);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        // Should start with ': ' for root level, not 'field:'
        assert.ok(message.includes(':'));
      }
    });

    it('should join multiple errors with comma and space', () => {
      const schema = z.object({
        a: z.string().min(3),
        b: z.string().min(3),
        c: z.string().min(3)
      });
      const result = schema.safeParse({ a: 'x', b: 'y', c: 'z' });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        // Should have commas between errors
        const commaCount = (message.match(/,/g) || []).length;
        assert.ok(commaCount >= 2, 'Should have at least 2 commas separating 3 errors');
      }
    });

    it('should handle array indices in paths', () => {
      const schema = z.array(z.string().min(3));
      const result = schema.safeParse(['ok', 'no', 'good']);

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        assert.ok(message.includes('1:'));
      }
    });

    it('should work with custom error messages', () => {
      const schema = z
        .string()
        .min(5, 'This is way too short, my friend!')
        .max(10, 'This is way too long, buddy!');
      const result = schema.safeParse('abc');

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        assert.ok(message.includes('This is way too short, my friend!'));
      }
    });

    it('should handle empty field path correctly', () => {
      const schema = z.string().min(1, 'Value is required');
      const result = schema.safeParse('');

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        // For empty path, should just have ': message'
        assert.ok(message.includes('Value is required'));
      }
    });

    it('should format discriminated union errors', () => {
      const schema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('circle'), radius: z.number() }),
        z.object({ type: z.literal('square'), side: z.number() })
      ]);
      const result = schema.safeParse({ type: 'triangle', base: 5 });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const message = formatZodErrorMessage(result.error);
        assert.ok(message.length > 0);
      }
    });
  });

  describe('Integration tests', () => {
    it('should handle real-world form validation errors', () => {
      const registrationSchema = z.object({
        username: z
          .string()
          .min(3, 'Username must be at least 3 characters')
          .max(20, 'Username must be at most 20 characters')
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            'Username can only contain letters, numbers, underscores, and hyphens'
          ),
        email: z.string().email('Invalid email address'),
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
          .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
          .regex(/\d/, 'Password must contain at least one number'),
        age: z.coerce.number().int().positive('Age must be a positive number')
      });

      const invalidInput = {
        username: 'a',
        email: 'not-an-email',
        password: 'weak',
        age: -5
      };

      const result = registrationSchema.safeParse(invalidInput);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        const message = formatZodErrorMessage(result.error);

        // Should have multiple errors
        assert.ok(formatted.length >= 4);
        assert.ok(message.includes(', '));

        // Should have proper field paths
        assert.ok(formatted.some((e) => e.field === 'username'));
        assert.ok(formatted.some((e) => e.field === 'email'));
        assert.ok(formatted.some((e) => e.field === 'password'));
        assert.ok(formatted.some((e) => e.field === 'age'));
      }
    });
  });
});
