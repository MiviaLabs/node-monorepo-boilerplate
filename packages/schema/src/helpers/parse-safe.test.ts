/**
 * Tests for parse-safe helper functions
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { z } from 'zod';

import { parseSafe, parseOrThrow } from './parse-safe';

describe('parse-safe > parseSafe > valid input', () => {
  it('should return success and data for valid input', () => {
    const schema = z.string().min(3);
    const result = parseSafe(schema, 'hello');

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data, 'hello');
      assert.strictEqual(result.errors, undefined);
    }
  });

  it('should work with complex schemas', () => {
    const schema = z
      .object({
        username: z.string().min(3).max(20),
        email: z.string().email(),
        age: z.number().int().positive()
      })
      .strict();

    const validData = {
      username: 'john_doe',
      email: 'john@example.com',
      age: 25
    };

    const result = parseSafe(schema, validData);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.deepStrictEqual(result.data, validData);
    }
  });
});

describe('parse-safe > parseSafe > error handling', () => {
  it('should return errors for invalid input', () => {
    const schema = z.string().min(5);
    const result = parseSafe(schema, 'abc');

    assert.strictEqual(result.success, false);
    if (!result.success && result.errors) {
      assert.strictEqual(result.errors.length, 1);
      const firstError = result.errors[0];
      if (firstError) {
        assert.strictEqual(firstError.field, '');
        assert.ok(firstError.message.includes('5'));
      }
    }
  });

  it('should return multiple errors', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
      name: z.string().min(2)
    });
    const result = parseSafe(schema, { email: 'invalid', age: 15, name: 'A' });

    assert.strictEqual(result.success, false);
    if (!result.success && result.errors) {
      assert.ok(result.errors.length >= 3);
    }
  });
});

describe('parse-safe > parseSafe > field paths', () => {
  it('should include field path in errors', () => {
    const schema = z.object({
      name: z.string().min(3),
      age: z.number().min(18)
    });
    const result = parseSafe(schema, { name: 'Jo', age: 15 });

    assert.strictEqual(result.success, false);
    if (!result.success && result.errors) {
      assert.ok(result.errors.some((e) => e.field === 'name'));
      assert.ok(result.errors.some((e) => e.field === 'age'));
    }
  });

  it('should handle nested field paths', () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string().min(3)
        })
      })
    });
    const result = parseSafe(schema, { user: { profile: { name: 'Jo' } } });

    assert.strictEqual(result.success, false);
    if (!result.success && result.errors) {
      assert.ok(result.errors.some((e) => e.field === 'user.profile.name'));
    }
  });

  it('should handle array field paths', () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string().min(3) }))
    });
    const result = parseSafe(schema, { items: [{ name: 'Ok' }, { name: 'Ba' }] });

    assert.strictEqual(result.success, false);
    if (!result.success && result.errors) {
      assert.ok(result.errors.some((e) => e.field === 'items.1.name'));
    }
  });
});

describe('parse-safe > parseSafe > edge cases', () => {
  it('should handle undefined input', () => {
    const schema = z.string();
    const result = parseSafe(schema, undefined);

    assert.strictEqual(result.success, false);
  });

  it('should handle null input', () => {
    const schema = z.string();
    const result = parseSafe(schema, null);

    assert.strictEqual(result.success, false);
  });

  it('should reject extra fields with strict schema', () => {
    const schema = z.object({ name: z.string() }).strict();
    const result = parseSafe(schema, { name: 'John', extra: 'field' });

    assert.strictEqual(result.success, false);
  });
});

describe('parse-safe > parseOrThrow > valid input', () => {
  it('should return parsed data for valid input', () => {
    const schema = z.string().min(3);
    const result = parseOrThrow(schema, 'hello');

    assert.strictEqual(result, 'hello');
  });

  it('should transform data when schema has transformations', () => {
    const schema = z.string().transform((val) => val.toUpperCase());
    const result = parseOrThrow(schema, 'hello');

    assert.strictEqual(result, 'HELLO');
  });

  it('should handle coercion schemas', () => {
    const schema = z.coerce.number();
    const result = parseOrThrow(schema, '123');

    assert.strictEqual(result, 123);
  });

  it('should work with default values', () => {
    const schema = z.object({
      name: z.string(),
      role: z.string().default('user')
    });

    const result = parseOrThrow(schema, { name: 'John' });
    assert.strictEqual(result.name, 'John');
    assert.strictEqual(result.role, 'user');
  });

  it('should validate with refine', () => {
    const schema = z.number().refine((n) => n % 2 === 0, {
      message: 'Must be even'
    });

    assert.throws(() => parseOrThrow(schema, 3));

    const result = parseOrThrow(schema, 4);
    assert.strictEqual(result, 4);
  });
});

describe('parse-safe > parseOrThrow > error handling', () => {
  it('should throw ZodError for invalid input', () => {
    const schema = z.string().min(5);

    assert.throws(
      () => parseOrThrow(schema, 'abc'),
      (error: unknown) => error instanceof z.ZodError
    );
  });

  it('should include error details in thrown error', () => {
    const schema = z.object({
      name: z.string().min(3),
      age: z.number().min(18)
    });

    try {
      parseOrThrow(schema, { name: 'Jo', age: 15 });
      assert.fail('Should have thrown ZodError');
    } catch (error) {
      assert.ok(error instanceof z.ZodError);
      if (error instanceof z.ZodError) {
        assert.ok(error.issues.length >= 1);
      }
    }
  });

  it('should throw for undefined input when not optional', () => {
    const schema = z.string();

    assert.throws(() => parseOrThrow(schema, undefined));
  });

  it('should throw for null input when not nullable', () => {
    const schema = z.string();

    assert.throws(() => parseOrThrow(schema, null));
  });
});

describe('parse-safe > Zod features integration', () => {
  it('should work with optional fields', () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().optional()
    });

    const result = parseSafe(schema, { name: 'John' });
    assert.strictEqual(result.success, true);
  });

  it('should work with nullable fields', () => {
    const schema = z.object({
      name: z.string(),
      nickname: z.string().nullable()
    });

    const result = parseSafe(schema, { name: 'John', nickname: null });
    assert.strictEqual(result.success, true);
  });

  it('should work with default values', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().default(0)
    });

    const result = parseSafe(schema, { name: 'John' });
    assert.strictEqual(result.success, true);
    if (result.success && result.data) {
      assert.strictEqual(result.data.count, 0);
    }
  });

  it('should work with enum schemas', () => {
    const schema = z.enum(['admin', 'user', 'guest']);

    const result = parseSafe(schema, 'admin');
    assert.strictEqual(result.success, true);

    const invalidResult = parseSafe(schema, 'superadmin');
    assert.strictEqual(invalidResult.success, false);
  });

  it('should work with union schemas', () => {
    const schema = z.union([z.string(), z.number()]);

    assert.strictEqual(parseSafe(schema, 'hello').success, true);
    assert.strictEqual(parseSafe(schema, 123).success, true);
    assert.strictEqual(parseSafe(schema, true).success, false);
  });

  it('should work with discriminated unions', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('circle'), radius: z.number() }),
      z.object({ type: z.literal('square'), side: z.number() })
    ]);

    const result1 = parseSafe(schema, { type: 'circle', radius: 5 });
    assert.strictEqual(result1.success, true);

    const result2 = parseSafe(schema, { type: 'square', side: 10 });
    assert.strictEqual(result2.success, true);

    const result3 = parseSafe(schema, { type: 'triangle', base: 5 });
    assert.strictEqual(result3.success, false);
  });
});
