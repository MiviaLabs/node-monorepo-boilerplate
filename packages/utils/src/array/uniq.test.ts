/**
 * Tests for array/uniq.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { uniq, uniqBy } from './uniq.js';

describe('array/uniq', () => {
  describe('uniq', () => {
    it('should remove duplicates from array', () => {
      assert.deepStrictEqual(uniq([1, 2, 2, 3, 3, 3]), [1, 2, 3]);
      assert.deepStrictEqual(uniq([1, 1, 1, 1]), [1]);
    });

    it('should handle array with no duplicates', () => {
      assert.deepStrictEqual(uniq([1, 2, 3]), [1, 2, 3]);
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(uniq([]), []);
    });

    it('should handle single element array', () => {
      assert.deepStrictEqual(uniq([1]), [1]);
    });

    it('should handle mixed types', () => {
      assert.deepStrictEqual(uniq([1, '1', 2, '2', 1, '1']), [1, '1', 2, '2']);
    });

    it('should handle objects by reference', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 1 };
      const obj3 = obj1;
      assert.deepStrictEqual(uniq([obj1, obj2, obj3]), [obj1, obj2]);
    });

    it('should handle null and undefined', () => {
      assert.deepStrictEqual(uniq([null, null, undefined, undefined]), [null, undefined]);
    });

    it('should handle boolean values', () => {
      assert.deepStrictEqual(uniq([true, false, true, false]), [true, false]);
    });

    it('should handle NaN', () => {
      // Set treats NaN as equal to NaN
      const result = uniq([NaN, NaN, 1]);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(Number.isNaN(result[0]), true);
      assert.strictEqual(result[1], 1);
    });
  });

  describe('uniqBy', () => {
    it('should remove duplicates based on key function', () => {
      const arr = [
        { id: 1, name: 'a' },
        { id: 1, name: 'b' },
        { id: 2, name: 'c' }
      ];
      const result = uniqBy(arr, (x) => x.id);
      assert.deepStrictEqual(result, [
        { id: 1, name: 'a' },
        { id: 2, name: 'c' }
      ]);
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(
        uniqBy([], (x) => x),
        []
      );
    });

    it('should handle single element array', () => {
      const arr = [{ id: 1, name: 'a' }];
      const result = uniqBy(arr, (x) => x.id);
      assert.deepStrictEqual(result, [{ id: 1, name: 'a' }]);
    });

    it('should preserve first occurrence of each key', () => {
      const arr = [
        { id: 1, value: 'first' },
        { id: 1, value: 'second' },
        { id: 2, value: 'third' }
      ];
      const result = uniqBy(arr, (x) => x.id);
      assert.strictEqual(result[0]?.value, 'first');
    });

    it('should handle primitive key functions', () => {
      const arr = ['aa', 'ab', 'ba', 'bb'];
      const result = uniqBy(arr, (s) => s[0]);
      assert.deepStrictEqual(result, ['aa', 'ba']);
    });

    it('should handle numeric keys', () => {
      const arr = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
      const result = uniqBy(arr, (_, i) => i % 2);
      assert.deepStrictEqual(result, [{ value: 'a' }, { value: 'b' }]);
    });

    it('should handle null and undefined keys', () => {
      const arr = [
        { key: null, value: 'a' },
        { key: null, value: 'b' },
        { key: undefined, value: 'c' },
        { key: undefined, value: 'd' }
      ];
      const result = uniqBy(arr, (x) => x.key);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0]?.value, 'a');
      assert.strictEqual(result[1]?.value, 'c');
    });

    it('should handle readonly arrays', () => {
      const arr = [{ id: 1 }, { id: 1 }, { id: 2 }] as const;
      const result = uniqBy(arr, (x) => x.id);
      assert.deepStrictEqual(result, [{ id: 1 }, { id: 2 }]);
    });
  });
});
