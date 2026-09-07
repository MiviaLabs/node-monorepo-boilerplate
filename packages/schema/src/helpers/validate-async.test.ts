/**
 * Tests for async validation helpers
 */

import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';

import { z } from 'zod';

import { validateAsync } from './validate-async';

describe('validate-async', () => {
  describe('validateAsync', () => {
    // eslint-disable-next-line max-lines-per-function
    // eslint-disable-next-line max-lines-per-function
    it('should return success and data for valid input', async () => {
      const schema = z.string().min(3);
      const result = await validateAsync(schema, 'hello');

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, 'hello');
        assert.strictEqual(result.errors, undefined);
      }
    });

    it('should return errors for invalid input', async () => {
      const schema = z.string().min(5);
      const result = await validateAsync(schema, 'abc');

      assert.strictEqual(result.success, false);
      if (!result.success && result.errors) {
        assert.strictEqual(result.errors.length, 1);
        const firstError = result.errors[0];
        if (firstError) {
          assert.ok(firstError.message.includes('5'));
        }
      }
    });

    it('should handle async refinements', async () => {
      const schema = z.string().refine(
        async (val) => {
          await Promise.resolve();
          return val !== 'forbidden';
        },
        { message: 'This value is forbidden' }
      );

      const validResult = await validateAsync(schema, 'allowed');
      assert.strictEqual(validResult.success, true);

      const invalidResult = await validateAsync(schema, 'forbidden');
      assert.strictEqual(invalidResult.success, false);
      if (!invalidResult.success) {
        assert.ok(invalidResult.errors?.some((e) => e.message === 'This value is forbidden'));
      }
    });

    it('should work with async transforms', async () => {
      const schema = z.string().transform(async (val) => {
        await Promise.resolve();
        return val.toUpperCase();
      });

      const result = await validateAsync(schema, 'hello');
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, 'HELLO');
      }
    });

    it('should handle complex object schemas', async () => {
      const schema = z.object({
        username: z.string().min(3),
        email: z.string().email(),
        age: z.number().int().positive()
      });

      const validData = {
        username: 'john_doe',
        email: 'john@example.com',
        age: 25
      };

      const result = await validateAsync(schema, validData);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.deepStrictEqual(result.data, validData);
      }
    });

    it('should return multiple errors for object with multiple issues', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
        name: z.string().min(2)
      });

      const invalidData = { email: 'invalid', age: 15, name: 'A' };

      const result = await validateAsync(schema, invalidData);
      assert.strictEqual(result.success, false);
      if (!result.success && result.errors) {
        assert.ok(result.errors.length >= 3);
      }
    });

    it('should handle nested object schemas', async () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string().min(3)
          })
        })
      });

      const validData = { user: { profile: { name: 'John' } } };
      const result = await validateAsync(schema, validData);
      assert.strictEqual(result.success, true);

      const invalidData = { user: { profile: { name: 'Jo' } } };
      const invalidResult = await validateAsync(schema, invalidData);
      assert.strictEqual(invalidResult.success, false);
    });

    it('should handle array schemas', async () => {
      const schema = z.array(z.string().min(3));

      const validData = ['hello', 'world'];
      const result = await validateAsync(schema, validData);
      assert.strictEqual(result.success, true);

      const invalidData = ['ok', 'hi'];
      const invalidResult = await validateAsync(schema, invalidData);
      assert.strictEqual(invalidResult.success, false);
    });

    it('should work with optional and nullable fields', async () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
        nullable: z.string().nullable().optional()
      });

      const result1 = await validateAsync(schema, {
        required: 'value',
        optional: undefined,
        nullable: null
      });
      assert.strictEqual(result1.success, true);

      const result2 = await validateAsync(schema, {
        required: 'value'
      });
      assert.strictEqual(result2.success, true);
    });

    it('should handle default values', async () => {
      const schema = z.object({
        name: z.string(),
        count: z.number().default(0),
        active: z.boolean().default(true)
      });

      const result = await validateAsync(schema, { name: 'test' });
      assert.strictEqual(result.success, true);
      if (result.success && result.data) {
        assert.strictEqual(result.data.count, 0);
        assert.strictEqual(result.data.active, true);
      }
    });

    it('should work with enum schemas', async () => {
      const schema = z.enum(['admin', 'user', 'guest']);

      const validResult = await validateAsync(schema, 'admin');
      assert.strictEqual(validResult.success, true);

      const invalidResult = await validateAsync(schema, 'superadmin');
      assert.strictEqual(invalidResult.success, false);
    });

    it('should work with union schemas', async () => {
      const schema = z.union([z.string(), z.number()]);

      const result1 = await validateAsync(schema, 'hello');
      assert.strictEqual(result1.success, true);

      const result2 = await validateAsync(schema, 123);
      assert.strictEqual(result2.success, true);

      const result3 = await validateAsync(schema, true);
      assert.strictEqual(result3.success, false);
    });

    it('should handle discriminated unions', async () => {
      const schema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('circle'), radius: z.number() }),
        z.object({ type: z.literal('square'), side: z.number() })
      ]);

      const result1 = await validateAsync(schema, { type: 'circle', radius: 5 });
      assert.strictEqual(result1.success, true);

      const result2 = await validateAsync(schema, { type: 'square', side: 10 });
      assert.strictEqual(result2.success, true);

      const result3 = await validateAsync(schema, { type: 'triangle', base: 5 });
      assert.strictEqual(result3.success, false);
    });

    it('should handle coercion schemas', async () => {
      const schema = z.object({
        count: z.coerce.number(),
        flag: z.coerce.boolean()
      });

      const result = await validateAsync(schema, { count: '123', flag: 'true' });
      assert.strictEqual(result.success, true);
      if (result.success && result.data) {
        assert.strictEqual(result.data.count, 123);
        assert.strictEqual(result.data.flag, true);
      }
    });

    it('should throw non-ZodError errors', async () => {
      const schema = z.string().transform(() => {
        throw new Error('Unexpected error');
      });

      await assert.rejects(
        async () => await validateAsync(schema, 'test'),
        (error: unknown) => {
          return error instanceof Error && error.message === 'Unexpected error';
        }
      );
    });

    it('should work with refinements', async () => {
      const schema = z.number().refine((n) => n % 2 === 0, {
        message: 'Must be even'
      });

      const result1 = await validateAsync(schema, 4);
      assert.strictEqual(result1.success, true);

      const result2 = await validateAsync(schema, 3);
      assert.strictEqual(result2.success, false);
      if (!result2.success) {
        assert.ok(result2.errors?.some((e) => e.message === 'Must be even'));
      }
    });

    it('should handle complex validation with multiple async refinements', async () => {
      const isUsernameUnique = mock.fn(async (username) => {
        return username !== 'taken';
      });

      const isEmailValid = mock.fn(async (email) => {
        return !email.startsWith('blocked@');
      });

      const schema = z.object({
        username: z
          .string()
          .min(3)
          .refine(async (val) => await isUsernameUnique(val), {
            message: 'Username is already taken'
          }),
        email: z
          .string()
          .email()
          .refine(async (val) => await isEmailValid(val), {
            message: 'Email is blocked'
          })
      });

      const validData = { username: 'newuser', email: 'test@example.com' };
      const result1 = await validateAsync(schema, validData);
      assert.strictEqual(result1.success, true);

      const invalidData = { username: 'taken', email: 'blocked@example.com' };
      const result2 = await validateAsync(schema, invalidData);
      assert.strictEqual(result2.success, false);
      if (!result2.success) {
        assert.ok(
          result2.errors?.some(
            (e) => e.message.includes('already taken') || e.message.includes('blocked')
          )
        );
      }
    });
  });
});
