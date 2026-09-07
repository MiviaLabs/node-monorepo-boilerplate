/**
 * Tests for object/pick.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { pick, omit } from './pick.js';

describe('object/pick', () => {
  describe('pick', () => {
    it('should pick specified keys from object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pick(obj, ['a', 'c']);
      assert.deepStrictEqual(result, { a: 1, c: 3 });
    });

    it('should handle single key', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pick(obj, ['b']);
      assert.deepStrictEqual(result, { b: 2 });
    });

    it('should handle empty keys array', () => {
      const obj = { a: 1, b: 2 };
      const result = pick(obj, []);
      assert.deepStrictEqual(result, {});
    });

    it('should not include keys that do not exist in object', () => {
      const obj = { a: 1, b: 2 };
      const keys = ['a', 'c'] as const;
      const result = pick(obj, keys as unknown as Array<keyof typeof obj>);
      assert.deepStrictEqual(result, { a: 1 });
    });

    it('should preserve values including undefined', () => {
      const obj = { a: 1, b: undefined, c: null };
      const result = pick(obj, ['a', 'b', 'c']);
      assert.deepStrictEqual(result, { a: 1, b: undefined, c: null });
    });

    it('should handle nested objects', () => {
      const obj = {
        a: 1,
        nested: { deep: 'value' }
      };
      const result = pick(obj, ['nested']);
      assert.deepStrictEqual(result, {
        nested: { deep: 'value' }
      });
    });

    it('should handle objects with methods', () => {
      const obj = {
        a: 1,
        fn: () => 'hello'
      };
      const result = pick(obj, ['fn']);
      assert.strictEqual(result.fn, obj.fn);
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      const obj = { a: 1, [sym]: 'symbol' };
      const result = pick(obj, ['a']);
      assert.deepStrictEqual(result, { a: 1 });
    });

    it('should return new object', () => {
      const obj = { a: 1, b: 2 };
      const result = pick(obj, ['a']);
      assert.notStrictEqual(result, obj);
    });

    it('should not mutate original object', () => {
      const obj = { a: 1, b: 2 };
      pick(obj, ['a']);
      assert.deepStrictEqual(obj, { a: 1, b: 2 });
    });

    it('should pick keys with special characters', () => {
      const obj = { 'foo-bar': 1, foo_baz: 2 };
      const result = pick(obj, ['foo-bar']);
      assert.deepStrictEqual(result, { 'foo-bar': 1 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys from object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, ['a', 'c']);
      assert.deepStrictEqual(result, { b: 2 });
    });

    it('should handle single key to omit', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, ['b']);
      assert.deepStrictEqual(result, { a: 1, c: 3 });
    });

    it('should handle empty keys array', () => {
      const obj = { a: 1, b: 2 };
      const result = omit(obj, []);
      assert.deepStrictEqual(result, { a: 1, b: 2 });
    });

    it('should handle keys that do not exist', () => {
      const obj = { a: 1, b: 2 };
      const keys = ['a', 'c'] as const;
      const result = omit(obj, keys as unknown as Array<keyof typeof obj>);
      assert.deepStrictEqual(result, { b: 2 });
    });

    it('should preserve values including undefined and null', () => {
      const obj = { a: 1, b: undefined, c: null };
      const result = omit(obj, ['a']);
      assert.deepStrictEqual(result, { b: undefined, c: null });
    });

    it('should handle nested objects', () => {
      const obj = {
        a: 1,
        nested: { deep: 'value' }
      };
      const result = omit(obj, ['a']);
      assert.deepStrictEqual(result, {
        nested: { deep: 'value' }
      });
    });

    it('should handle objects with methods', () => {
      const obj = {
        a: 1,
        fn: () => 'hello'
      };
      const result = omit(obj, ['a']);
      assert.strictEqual(result.fn, obj.fn);
    });

    it('should return new object', () => {
      const obj = { a: 1, b: 2 };
      const result = omit(obj, ['a']);
      assert.notStrictEqual(result, obj);
    });

    it('should not mutate original object', () => {
      const obj = { a: 1, b: 2 };
      omit(obj, ['a']);
      assert.deepStrictEqual(obj, { a: 1, b: 2 });
    });

    it('should omit multiple keys', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      const result = omit(obj, ['b', 'd']);
      assert.deepStrictEqual(result, { a: 1, c: 3 });
    });

    it('should omit all keys', () => {
      const obj = { a: 1, b: 2 };
      const result = omit(obj, ['a', 'b']);
      assert.deepStrictEqual(result, {});
    });
  });
});
