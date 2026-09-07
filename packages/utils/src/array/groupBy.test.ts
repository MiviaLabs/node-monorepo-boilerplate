/**
 * Tests for array/groupBy.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { groupBy } from './groupBy.js';

describe('array/groupBy', () => {
  describe('groupBy', () => {
    it('should group array elements by key function', () => {
      const arr = [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
        { type: 'vegetable', name: 'carrot' }
      ];
      const result = groupBy(arr, (item) => item.type);
      assert.deepStrictEqual(result, {
        fruit: [
          { type: 'fruit', name: 'apple' },
          { type: 'fruit', name: 'banana' }
        ],
        vegetable: [{ type: 'vegetable', name: 'carrot' }]
      });
    });

    it('should group by numeric keys', () => {
      const arr = [
        { category: 1, name: 'a' },
        { category: 2, name: 'b' },
        { category: 1, name: 'c' }
      ];
      const result = groupBy(arr, (item) => item.category);
      assert.deepStrictEqual(result, {
        1: [
          { category: 1, name: 'a' },
          { category: 1, name: 'c' }
        ],
        2: [{ category: 2, name: 'b' }]
      });
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(
        groupBy([], (x) => x),
        {}
      );
    });

    it('should handle single element array', () => {
      const arr = [{ type: 'fruit', name: 'apple' }];
      const result = groupBy(arr, (item) => item.type);
      assert.deepStrictEqual(result, {
        fruit: [{ type: 'fruit', name: 'apple' }]
      });
    });

    it('should handle primitive values', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = groupBy(arr, (x) => (x % 2 === 0 ? 'even' : 'odd'));
      assert.deepStrictEqual(result, {
        odd: [1, 3, 5],
        even: [2, 4]
      });
    });

    it('should handle group function returning numbers', () => {
      const arr = ['a', 'bb', 'ccc', 'dd'];
      const result = groupBy(arr, (s) => s.length);
      assert.deepStrictEqual(result, {
        1: ['a'],
        2: ['bb', 'dd'],
        3: ['ccc']
      });
    });

    it('should preserve element references', () => {
      const obj1 = { type: 'a' };
      const obj2 = { type: 'b' };
      const arr = [obj1, obj2];
      const result = groupBy(arr, (x) => x.type);
      assert.strictEqual(result['a']?.[0], obj1);
      assert.strictEqual(result['b']?.[0], obj2);
    });

    it('should handle readonly arrays', () => {
      const arr = [1, 2, 3] as const;
      const result = groupBy(arr, (x) => x % 2);
      assert.deepStrictEqual(result, {
        1: [1, 3],
        0: [2]
      });
    });
  });
});
