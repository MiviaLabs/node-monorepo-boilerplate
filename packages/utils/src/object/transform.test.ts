/**
 * Tests for object/transform.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { mapKeys, mapValues } from './transform.js';

describe('object/transform', () => {
  describe('mapKeys', () => {
    it('should map keys of an object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = mapKeys(obj, (key) => key.toUpperCase());
      assert.deepStrictEqual(result, { A: 1, B: 2, C: 3 });
    });

    it('should preserve values', () => {
      const obj = { a: 'hello', b: 'world' };
      const result = mapKeys(obj, (key) => `key_${key}`);
      assert.deepStrictEqual(result, {
        key_a: 'hello',
        key_b: 'world'
      });
    });

    it('should handle empty object', () => {
      const result = mapKeys({}, (key) => key);
      assert.deepStrictEqual(result, {});
    });

    it('should handle single key object', () => {
      const obj = { a: 1 };
      const result = mapKeys(obj, (key) => key.toUpperCase());
      assert.deepStrictEqual(result, { A: 1 });
    });

    it('should allow key mapping to same key', () => {
      const obj = { a: 1, b: 2 };
      const result = mapKeys(obj, (key) => key);
      assert.deepStrictEqual(result, { a: 1, b: 2 });
    });

    it('should handle key collisions', () => {
      const obj = { a: 1, b: 2 };
      const result = mapKeys(obj, () => 'same');
      // Last value wins for collisions
      assert.deepStrictEqual(result, { same: 2 });
    });

    it('should work with numeric keys', () => {
      const obj = { 1: 'a', 2: 'b' };
      const result = mapKeys(obj, (key) => `num_${key}`);
      assert.deepStrictEqual(result, {
        num_1: 'a',
        num_2: 'b'
      });
    });

    it('should preserve nested object values', () => {
      const obj = { a: { nested: true } };
      const result = mapKeys(obj, (key) => key.toUpperCase());
      assert.deepStrictEqual(result, { A: { nested: true } });
    });

    it('should preserve array values', () => {
      const obj = { a: [1, 2, 3] };
      const result = mapKeys(obj, (key) => `key_${key}`);
      assert.deepStrictEqual(result, { key_a: [1, 2, 3] });
    });

    it('should not mutate original object', () => {
      const obj = { a: 1, b: 2 };
      mapKeys(obj, (key) => key.toUpperCase());
      assert.deepStrictEqual(obj, { a: 1, b: 2 });
    });
  });

  describe('mapValues', () => {
    it('should map values of an object', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = mapValues(obj, (value) => value * 2);
      assert.deepStrictEqual(result, { a: 2, b: 4, c: 6 });
    });

    it('should pass key to mapper function', () => {
      const obj = { a: 1, b: 2 };
      const result = mapValues(obj, (value, key) => `${key}:${value}`);
      assert.deepStrictEqual(result, { a: 'a:1', b: 'b:2' });
    });

    it('should handle empty object', () => {
      const result = mapValues({}, (value) => value);
      assert.deepStrictEqual(result, {});
    });

    it('should handle single value object', () => {
      const obj = { a: 1 };
      const result = mapValues(obj, (value) => value * 2);
      assert.deepStrictEqual(result, { a: 2 });
    });

    it('should allow value mapping to same value', () => {
      const obj = { a: 1, b: 2 };
      const result = mapValues(obj, (value) => value);
      assert.deepStrictEqual(result, { a: 1, b: 2 });
    });

    it('should handle string values', () => {
      const obj = { a: 'hello', b: 'world' };
      const result = mapValues(obj, (value) => value.toUpperCase());
      assert.deepStrictEqual(result, { a: 'HELLO', b: 'WORLD' });
    });

    it('should handle null and undefined values', () => {
      const obj = { a: null, b: undefined, c: 1 };
      const result = mapValues(obj, (value) => (value === null ? 'NULL' : value));
      assert.deepStrictEqual(result, { a: 'NULL', b: undefined, c: 1 });
    });

    it('should preserve nested object values', () => {
      const obj = { a: { x: 1 } };
      const result = mapValues(obj, (value) => ({ ...value, y: 2 }));
      assert.deepStrictEqual(result, { a: { x: 1, y: 2 } });
    });

    it('should map array values', () => {
      const obj = { a: [1, 2], b: [3, 4] };
      const result = mapValues(obj, (value) => value.length);
      assert.deepStrictEqual(result, { a: 2, b: 2 });
    });

    it('should not mutate original object', () => {
      const obj = { a: 1, b: 2 };
      mapValues(obj, (value) => value * 2);
      assert.deepStrictEqual(obj, { a: 1, b: 2 });
    });

    it('should preserve key types', () => {
      type Obj = { a: number; b: number };
      const obj: Obj = { a: 1, b: 2 };
      const result = mapValues(obj, (v) => v.toString());
      assert.deepStrictEqual(result, { a: '1', b: '2' });
    });
  });
});
