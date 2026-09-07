/**
 * Tests for array/chunk.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { chunk } from './chunk.js';

describe('array/chunk', () => {
  describe('chunk', () => {
    it('should split array into chunks of specified size', () => {
      assert.deepStrictEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
      assert.deepStrictEqual(chunk([1, 2, 3, 4, 5], 3), [
        [1, 2, 3],
        [4, 5]
      ]);
    });

    it('should handle exact division', () => {
      assert.deepStrictEqual(chunk([1, 2, 3, 4, 5, 6], 2), [
        [1, 2],
        [3, 4],
        [5, 6]
      ]);
      assert.deepStrictEqual(chunk([1, 2, 3, 4, 5, 6], 3), [
        [1, 2, 3],
        [4, 5, 6]
      ]);
    });

    it('should handle chunk size of 1', () => {
      assert.deepStrictEqual(chunk([1, 2, 3], 1), [[1], [2], [3]]);
    });

    it('should handle chunk size larger than array', () => {
      assert.deepStrictEqual(chunk([1, 2, 3], 5), [[1, 2, 3]]);
      assert.deepStrictEqual(chunk([1, 2, 3], 3), [[1, 2, 3]]);
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(chunk([], 3), []);
    });

    it('should throw error for size <= 0', () => {
      assert.throws(() => chunk([1, 2, 3], 0), { message: 'Chunk size must be greater than 0' });
      assert.throws(() => chunk([1, 2, 3], -1), { message: 'Chunk size must be greater than 0' });
    });

    it('should handle single element array', () => {
      assert.deepStrictEqual(chunk([1], 1), [[1]]);
      assert.deepStrictEqual(chunk([1], 5), [[1]]);
    });

    it('should handle readonly arrays', () => {
      const arr = [1, 2, 3] as const;
      assert.deepStrictEqual(chunk(arr, 2), [[1, 2], [3]]);
    });

    it('should preserve array elements', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const result = chunk([obj1, obj2], 1);
      assert.strictEqual(result[0]?.[0], obj1);
      assert.strictEqual(result[1]?.[0], obj2);
    });
  });
});
