/**
 * Unit tests for deep-freeze utility
 *
 * Tests the deepFreeze function for recursive object immutability.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { deepFreeze } from '../../../src/utils/deep-freeze';

describe('deepFreeze', () => {
  describe('nested objects', () => {
    it('should freeze nested objects recursively', () => {
      const obj = {
        a: 1,
        nested: { b: 2, deeper: { c: 3 } }
      };

      const frozen = deepFreeze(obj);

      // Main object should be frozen
      assert.ok(Object.isFrozen(frozen));
      // Nested objects should be frozen
      assert.ok(Object.isFrozen(frozen.nested));
      assert.ok(Object.isFrozen(frozen.nested.deeper));
    });

    it('should freeze deeply nested structures', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep'
              }
            }
          }
        }
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.level1));
      assert.ok(Object.isFrozen(frozen.level1.level2));
      assert.ok(Object.isFrozen(frozen.level1.level2.level3));
      assert.ok(Object.isFrozen(frozen.level1.level2.level3.level4));
    });

    it('should freeze multiple properties at same level', () => {
      const obj = {
        prop1: { value: 1 },
        prop2: { value: 2 },
        prop3: { value: 3 }
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen.prop1));
      assert.ok(Object.isFrozen(frozen.prop2));
      assert.ok(Object.isFrozen(frozen.prop3));
    });
  });

  describe('primitive values', () => {
    it('should return numbers as-is', () => {
      const num = 42;
      const result = deepFreeze(num);
      assert.equal(result, num);
    });

    it('should return strings as-is', () => {
      const str = 'hello';
      const result = deepFreeze(str);
      assert.equal(result, str);
    });

    it('should return booleans as-is', () => {
      const bool = true;
      const result = deepFreeze(bool);
      assert.equal(result, bool);
    });

    it('should return undefined as-is', () => {
      const undef = undefined;
      const result = deepFreeze(undef);
      assert.equal(result, undef);
    });

    it('should return null as-is', () => {
      const result = deepFreeze(null);
      assert.equal(result, null);
    });
  });

  describe('already frozen objects', () => {
    it('should return already frozen objects without error', () => {
      const obj = { a: 1 };
      Object.freeze(obj);

      const result = deepFreeze(obj);

      assert.ok(Object.isFrozen(result));
      assert.equal(result.a, 1);
    });

    it('should handle partially frozen nested objects', () => {
      const nested = { b: 2 };
      Object.freeze(nested);

      const obj = { a: 1, nested };
      const result = deepFreeze(obj);

      assert.ok(Object.isFrozen(result));
      assert.ok(Object.isFrozen(result.nested));
    });
  });

  describe('arrays', () => {
    it('should freeze arrays with nested objects', () => {
      const arr = [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' }
      ];

      const frozen = deepFreeze(arr);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen[0]));
      assert.ok(Object.isFrozen(frozen[1]));
    });

    it('should freeze arrays with primitive values', () => {
      const arr = [1, 2, 3, 'four', true];

      const frozen = deepFreeze(arr);

      assert.ok(Object.isFrozen(frozen));
    });

    it('should freeze nested arrays', () => {
      const arr = [
        [1, 2],
        [3, 4]
      ];

      const frozen = deepFreeze(arr);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen[0]));
      assert.ok(Object.isFrozen(frozen[1]));
    });

    it('should freeze arrays with mixed nested structures', () => {
      const arr = [{ items: [1, 2, 3] }, [4, 5], 'string', 42];

      const frozen = deepFreeze(arr);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen[0]));
      assert.ok(Object.isFrozen(frozen[0].items));
      assert.ok(Object.isFrozen(frozen[1]));
    });
  });

  describe('mutation prevention', () => {
    it('should prevent mutation of frozen objects in strict mode', () => {
      const obj = {
        a: 1,
        nested: { b: 2 }
      };

      const frozen = deepFreeze(obj);

      // In strict mode, these would throw TypeError
      // In non-strict mode, they silently fail
      // We just verify the object is frozen
      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.nested));
    });

    it('should prevent adding new properties', () => {
      const obj = { a: 1 };
      const frozen = deepFreeze(obj);

      assert.throws(
        () => {
          (frozen as { b: number }).b = 2;
        },
        /Cannot add/,
        'Should not allow adding new properties in strict mode'
      );
    });

    it('should prevent deleting properties', () => {
      const obj = { a: 1 };
      const frozen = deepFreeze(obj);

      assert.throws(
        () => {
          delete (frozen as { a?: number }).a;
        },
        /Cannot delete/,
        'Should not allow deleting properties in strict mode'
      );
    });

    it('should prevent modifying nested properties', () => {
      const obj = {
        nested: { value: 1 }
      };
      const frozen = deepFreeze(obj);

      assert.throws(
        () => {
          (frozen.nested as { value: number }).value = 2;
        },
        /Cannot assign/,
        'Should not allow modifying nested properties in strict mode'
      );
    });
  });

  describe('special objects', () => {
    it('should freeze Date objects (container only)', () => {
      const date = new Date('2024-01-01');
      const frozen = deepFreeze({ date });

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.date));
    });

    it('should freeze RegExp objects (container only)', () => {
      const regex = /test/g;
      const frozen = deepFreeze({ pattern: regex });

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.pattern));
    });

    it('should handle objects with Date properties', () => {
      const obj = {
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-12-31')
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.createdAt));
      assert.ok(Object.isFrozen(frozen.updatedAt));
    });

    it('should handle objects with RegExp properties', () => {
      const obj = {
        emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phonePattern: /^\d{10}$/
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.emailPattern));
      assert.ok(Object.isFrozen(frozen.phonePattern));
    });
  });

  describe('empty objects and arrays', () => {
    it('should freeze empty objects', () => {
      const obj = {};
      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
    });

    it('should freeze empty arrays', () => {
      const arr: never[] = [];
      const frozen = deepFreeze(arr);

      assert.ok(Object.isFrozen(frozen));
    });

    it('should freeze arrays with empty objects', () => {
      const arr = [{}];
      const frozen = deepFreeze(arr);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen[0]));
    });

    it('should freeze objects with empty arrays', () => {
      const obj = { items: [] };
      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.items));
    });
  });

  describe('edge cases', () => {
    it('should handle objects with null properties', () => {
      const obj = {
        a: null,
        nested: { b: null }
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.nested));
      assert.equal(frozen.a, null);
      assert.equal(frozen.nested.b, null);
    });

    it('should handle objects with undefined properties', () => {
      const obj = {
        a: undefined,
        nested: { b: undefined }
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.nested));
      assert.equal(frozen.a, undefined);
      assert.equal(frozen.nested.b, undefined);
    });

    it('should return the same object reference', () => {
      const obj = { a: 1 };
      const frozen = deepFreeze(obj);

      assert.equal(frozen, obj);
    });

    it('should handle circular references (if any)', () => {
      const obj = { a: 1 } as { a: number; self?: unknown };
      obj.self = obj;

      // This should not throw an infinite loop
      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
    });
  });

  describe('complex structures', () => {
    it('should freeze complex nested structures', () => {
      const obj = {
        users: [
          { id: 1, profile: { name: 'Alice', settings: { theme: 'dark' } } },
          { id: 2, profile: { name: 'Bob', settings: { theme: 'light' } } }
        ],
        metadata: {
          count: 2,
          tags: ['admin', 'user']
        }
      };

      const frozen = deepFreeze(obj);

      // Verify all levels are frozen
      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.users));
      assert.ok(Object.isFrozen(frozen.users[0]));
      assert.ok(Object.isFrozen(frozen.users[0].profile));
      assert.ok(Object.isFrozen(frozen.users[0].profile.settings));
      assert.ok(Object.isFrozen(frozen.metadata));
      assert.ok(Object.isFrozen(frozen.metadata.tags));
    });

    it('should freeze objects with mixed property types', () => {
      const obj = {
        string: 'text',
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        object: { nested: true },
        array: [1, 2, 3],
        date: new Date(),
        regex: /test/
      };

      const frozen = deepFreeze(obj);

      assert.ok(Object.isFrozen(frozen));
      assert.ok(Object.isFrozen(frozen.object));
      assert.ok(Object.isFrozen(frozen.array));
      assert.ok(Object.isFrozen(frozen.date));
      assert.ok(Object.isFrozen(frozen.regex));
    });
  });
});
