/**
 * Tests for object/merge.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { deepMerge, shallowMerge } from './merge.js';

describe('object/merge', () => {
  describe('deepMerge', () => {
    it('should deep merge two objects', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 } as unknown as Partial<typeof target>;
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, {
        a: 1,
        b: { c: 2, d: 3 },
        e: 4
      });
    });

    it('should merge multiple objects', () => {
      const target = { a: 1 };
      const source1 = { b: 2 } as Partial<typeof target>;
      const source2 = { c: 3 } as Partial<typeof target>;
      const result = deepMerge(target, source1, source2);
      assert.deepStrictEqual(result, { a: 1, b: 2, c: 3 });
    });

    it('should override primitive values', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 } as typeof target & { c: number };
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
    });

    it('should deeply merge nested objects', () => {
      const target = {
        a: { x: 1, y: 2 },
        b: { z: 3 }
      };
      const source = {
        a: { x: 1, y: 20, w: 4 }
      } as typeof target & { a: { x: number; y: number; w: number } };
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, {
        a: { x: 1, y: 20, w: 4 },
        b: { z: 3 }
      });
    });

    it('should add new properties from source', () => {
      const target = { a: 1 };
      const source = { b: 2, c: 3 } as Partial<typeof target> & { b: number; c: number };
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, { a: 1, b: 2, c: 3 });
    });

    it('should handle empty source', () => {
      const target = { a: 1 };
      const result = deepMerge(target, {});
      assert.deepStrictEqual(result, { a: 1 });
    });

    it('should handle empty target', () => {
      const target = {} as Record<string, unknown>;
      const source = { a: 1 };
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, { a: 1 });
    });

    it('should mutate target object', () => {
      const target = { a: 1 };
      const source = { b: 2 } as Partial<typeof target> & { b: number };
      const result = deepMerge(target, source);
      assert.strictEqual(result, target);
    });

    it('should handle empty sources array', () => {
      const target = { a: 1 };
      const result = deepMerge(target);
      assert.strictEqual(result, target);
    });

    it('should handle null and undefined values in source', () => {
      const target = { a: 1, b: 2, c: 3 };
      const source = { b: null as null | undefined, c: undefined } as unknown as Partial<
        typeof target
      >;
      const result = deepMerge(target, source);
      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.b, null);
      assert.strictEqual(result.c, undefined);
    });

    it('should not merge arrays', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, { arr: [3, 4] });
    });

    it('should handle arrays in nested objects', () => {
      const target = { config: { items: [1, 2] } };
      const source = {
        config: { items: [1, 2], name: 'test' }
      } as typeof target & { config: { items: number[]; name: string } };
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, {
        config: { items: [1, 2], name: 'test' }
      });
    });

    it('should replace arrays with objects from source', () => {
      const target = { data: [1, 2, 3] };
      const source = { data: { a: 1 } } as unknown as typeof target;
      const result = deepMerge(target, source);
      assert.deepStrictEqual(result, { data: { a: 1 } });
    });
  });

  describe('shallowMerge', () => {
    it('should shallow merge two objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = shallowMerge(target, source);
      assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
    });

    it('should merge multiple objects', () => {
      const target = { a: 1 };
      const source1 = { b: 2 } as Partial<typeof target> & { b: number };
      const source2 = { c: 3 } as Partial<typeof target> & { c: number };
      const source3 = { d: 4 } as Partial<typeof target> & { d: number };
      const result = shallowMerge(target, source1, source2, source3);
      assert.deepStrictEqual(result, { a: 1, b: 2, c: 3, d: 4 });
    });

    it('should not mutate target object', () => {
      const target = { a: 1 };
      const source = { b: 2 } as Partial<typeof target> & { b: number };
      const result = shallowMerge(target, source);
      assert.notStrictEqual(result, target);
      assert.deepStrictEqual(target, { a: 1 });
    });

    it('should create new object with all properties', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 } as Partial<typeof target> & {
        b: { d: number };
        e: number;
      };
      const result = shallowMerge(target, source) as typeof target & typeof source;
      assert.strictEqual(result.b, source.b); // Shallow, so source.b is used
      assert.strictEqual(result.e, 4);
      assert.strictEqual(result.a, 1);
    });

    it('should handle empty source', () => {
      const target = { a: 1 };
      const result = shallowMerge(target, {});
      assert.deepStrictEqual(result, { a: 1 });
      assert.notStrictEqual(result, target);
    });

    it('should handle empty target', () => {
      const target = {} as Record<string, unknown>;
      const source = { a: 1 };
      const result = shallowMerge(target, source);
      assert.deepStrictEqual(result, { a: 1 });
    });

    it('should handle empty sources array', () => {
      const target = { a: 1 };
      const result = shallowMerge(target);
      assert.deepStrictEqual(result, { a: 1 });
      assert.notStrictEqual(result, target);
    });

    it('should handle null and undefined values', () => {
      const target = { a: 1, b: 2 };
      const source = {
        b: null as null | undefined,
        c: undefined as null | undefined,
        d: 3
      } as Partial<typeof target> & { b: null | undefined; c: undefined; d: number };
      const result = shallowMerge(target, source);
      assert.strictEqual(result.a, 1);
      assert.strictEqual(result.b, null);
    });

    it('should use Object.assign behavior', () => {
      const target = { a: 1 };
      const source = { b: 2 } as Partial<typeof target> & { b: number };
      const result = shallowMerge(target, source);
      const expected = Object.assign({}, target, source);
      assert.deepStrictEqual(result, expected);
    });
  });
});
