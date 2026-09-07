/**
 * Tests for object/clone.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { deepClone, shallowClone } from './clone.js';

describe('object/clone', () => {
  describe('deepClone', () => {
    it('should deep clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned.b, obj.b);
    });

    it('should handle nested objects', () => {
      const obj = {
        a: {
          b: {
            c: {
              d: 1
            }
          }
        }
      };
      const cloned = deepClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned.a, obj.a);
      assert.notStrictEqual(cloned.a.b, obj.a.b);
      assert.notStrictEqual(cloned.a.b.c, obj.a.b.c);
    });

    it('should deep clone arrays', () => {
      const arr = [1, [2, [3]]];
      const cloned = deepClone(arr);
      assert.deepStrictEqual(cloned, arr);
      assert.notStrictEqual(cloned, arr);
      const clonedInner = cloned[1] as Array<unknown>;
      const arrInner = arr[1] as Array<unknown>;
      assert.notStrictEqual(clonedInner, arrInner);
      assert.notStrictEqual(clonedInner[1], arrInner[1]);
    });

    it('should clone objects with arrays', () => {
      const obj = { arr: [1, 2, 3], num: 42 };
      const cloned = deepClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned.arr, obj.arr);
    });

    it('should clone arrays with objects', () => {
      const arr = [{ a: 1 }, { b: 2 }];
      const cloned = deepClone(arr);
      assert.deepStrictEqual(cloned, arr);
      assert.notStrictEqual(cloned, arr);
      assert.notStrictEqual(cloned[0], arr[0]);
      assert.notStrictEqual(cloned[1], arr[1]);
    });

    it('should handle primitives', () => {
      assert.strictEqual(deepClone(1), 1);
      assert.strictEqual(deepClone('string'), 'string');
      assert.strictEqual(deepClone(true), true);
      assert.strictEqual(deepClone(null), null);
      assert.strictEqual(deepClone(undefined), undefined);
    });

    it('should handle empty object', () => {
      const obj = {};
      const cloned = deepClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
    });

    it('should handle empty array', () => {
      const arr: unknown[] = [];
      const cloned = deepClone(arr);
      assert.deepStrictEqual(cloned, arr);
      assert.notStrictEqual(cloned, arr);
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01');
      const cloned = deepClone(date);
      assert.strictEqual(cloned, date); // Primitives returned as-is
    });

    it('should not clone functions', () => {
      const obj = {
        fn: () => 'hello',
        value: 42
      };
      const cloned = deepClone(obj);
      assert.strictEqual(cloned.fn, obj.fn);
      assert.strictEqual(cloned.value, 42);
    });

    it('should handle null values', () => {
      const obj = { a: null, b: 1 };
      const cloned = deepClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
    });
  });

  describe('shallowClone', () => {
    it('should shallow clone objects', () => {
      const obj = { a: 1, b: 2 };
      const cloned = shallowClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
    });

    it('should not deep clone nested objects', () => {
      const nested = { c: 2 };
      const obj = { a: 1, b: nested };
      const cloned = shallowClone(obj);
      assert.strictEqual(cloned.b, nested);
      assert.strictEqual(cloned.b.c, 2);
    });

    it('should shallow clone arrays', () => {
      const arr = [1, 2, 3];
      const cloned = shallowClone(arr);
      assert.deepStrictEqual(cloned, arr);
      assert.notStrictEqual(cloned, arr);
    });

    it('should not deep clone nested arrays', () => {
      const nested = [4, 5, 6];
      const arr = [1, 2, 3, nested];
      const cloned = shallowClone(arr);
      assert.strictEqual(cloned[3], nested);
    });

    it('should handle primitives', () => {
      assert.strictEqual(shallowClone(1), 1);
      assert.strictEqual(shallowClone('string'), 'string');
      assert.strictEqual(shallowClone(true), true);
      assert.strictEqual(shallowClone(null), null);
      assert.strictEqual(shallowClone(undefined), undefined);
    });

    it('should handle empty object', () => {
      const obj = {};
      const cloned = shallowClone(obj);
      assert.deepStrictEqual(cloned, obj);
      assert.notStrictEqual(cloned, obj);
    });

    it('should handle empty array', () => {
      const arr: unknown[] = [];
      const cloned = shallowClone(arr);
      assert.deepStrictEqual(cloned, arr);
      assert.notStrictEqual(cloned, arr);
    });

    it('should create new array reference', () => {
      const arr = [1, 2, 3];
      const cloned = shallowClone(arr);
      arr.push(4);
      assert.strictEqual(cloned.length, 3);
      assert.strictEqual(arr.length, 4);
    });

    it('should create new object reference', () => {
      const obj = { a: 1 };
      const cloned = shallowClone(obj);
      (obj as { a: number; b?: number }).b = 2;
      assert.strictEqual('b' in cloned, false);
    });
  });
});
