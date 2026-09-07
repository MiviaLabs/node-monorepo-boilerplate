/**
 * Tests for array/sortBy.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { sortBy, sortWith } from './sortBy.js';

describe('array/sortBy', () => {
  describe('sortBy', () => {
    it('should sort array by key function in ascending order', () => {
      const arr = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 }
      ];
      const result = sortBy(arr, (x) => x.age);
      assert.deepStrictEqual(result, [
        { name: 'Alice', age: 25 },
        { name: 'Charlie', age: 30 },
        { name: 'Bob', age: 35 }
      ]);
    });

    it('should sort array by key function in descending order', () => {
      const arr = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 }
      ];
      const result = sortBy(arr, (x) => x.age, 'desc');
      assert.deepStrictEqual(result, [
        { name: 'Bob', age: 35 },
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 }
      ]);
    });

    it('should handle string keys', () => {
      const arr = [{ name: 'Charlie' }, { name: 'Alice' }, { name: 'Bob' }];
      const result = sortBy(arr, (x) => x.name);
      assert.deepStrictEqual(result, [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }]);
    });

    it('should not mutate original array', () => {
      const arr = [3, 1, 2];
      const original = [...arr];
      sortBy(arr, (x) => x);
      assert.deepStrictEqual(arr, original);
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(
        sortBy([], (x) => x),
        []
      );
    });

    it('should handle single element array', () => {
      assert.deepStrictEqual(
        sortBy([1], (x) => x),
        [1]
      );
    });

    it('should handle arrays with same key values', () => {
      const arr = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' }
      ];
      const result = sortBy(arr, () => 0);
      // Order should be preserved for equal keys (stable sort)
      assert.deepStrictEqual(result, [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' }
      ]);
    });

    it('should handle negative numbers', () => {
      const arr = [3, -1, 2, -5];
      const result = sortBy(arr, (x) => x);
      assert.deepStrictEqual(result, [-5, -1, 2, 3]);
    });

    it('should handle readonly arrays', () => {
      const arr = [3, 1, 2] as const;
      const result = sortBy(arr, (x) => x);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
  });

  describe('sortWith', () => {
    it('should sort array with custom compare function', () => {
      const arr = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 }
      ];
      const result = sortWith(arr, (a, b) => a.age - b.age);
      assert.deepStrictEqual(result, [
        { name: 'Alice', age: 25 },
        { name: 'Charlie', age: 30 },
        { name: 'Bob', age: 35 }
      ]);
    });

    it('should handle descending sort', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = sortWith(arr, (a, b) => b - a);
      assert.deepStrictEqual(result, [5, 4, 3, 2, 1]);
    });

    it('should not mutate original array', () => {
      const arr = [3, 1, 2];
      const original = [...arr];
      sortWith(arr, (a, b) => a - b);
      assert.deepStrictEqual(arr, original);
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(
        sortWith([], (a, b) => a - b),
        []
      );
    });

    it('should handle single element array', () => {
      assert.deepStrictEqual(
        sortWith([1], (a, b) => a - b),
        [1]
      );
    });

    it('should handle complex comparison logic', () => {
      const arr = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 30 }
      ];
      // Sort by age, then by name
      const result = sortWith(arr, (a, b) => {
        if (a.age !== b.age) return a.age - b.age;
        return a.name.localeCompare(b.name);
      });
      assert.deepStrictEqual(result, [
        { name: 'Bob', age: 25 },
        { name: 'Alice', age: 30 },
        { name: 'Charlie', age: 30 }
      ]);
    });

    it('should handle strings with locale compare', () => {
      const arr = ['banana', 'Apple', 'cherry'];
      const result = sortWith(arr, (a, b) => a.localeCompare(b));
      assert.deepStrictEqual(result, ['Apple', 'banana', 'cherry']);
    });

    it('should handle readonly arrays', () => {
      const arr = [3, 1, 2] as const;
      const result = sortWith(arr, (a, b) => a - b);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
  });
});
