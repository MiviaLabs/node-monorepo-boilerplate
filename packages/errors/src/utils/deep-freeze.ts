/**
 * Deep Freeze Utility
 *
 * Recursively freezes an object to make it deeply immutable.
 * This ensures that all nested properties cannot be modified.
 *
 * @packageDocumentation
 */

/**
 * Deep freezes an object recursively
 *
 * This function makes an object and all its nested properties
 * completely immutable by applying Object.freeze() recursively.
 *
 * @template T - The type of the object to freeze
 * @param obj - The object to freeze (can be any value)
 * @returns The frozen object (same type as input)
 *
 * @example
 * ```ts
 * import { deepFreeze } from './deep-freeze';
 *
 * const obj = {
 *   a: 1,
 *   nested: { b: 2, deeper: { c: 3 } }
 * };
 *
 * const frozen = deepFreeze(obj);
 * frozen.a = 5; // Silently fails in strict mode
 * frozen.nested.b = 10; // Silently fails in strict mode
 * ```
 *
 * @remarks
 * - Primitive values are returned as-is (they're already immutable)
 * - null is returned as-is
 * - Objects, arrays, and other complex types are recursively frozen
 * - Already frozen objects are not re-processed (performance optimization)
 */
export function deepFreeze<T>(obj: T): T {
  // Return primitives and null as-is (already immutable)
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Freeze the current object
  Object.freeze(obj);

  // Recursively freeze all properties
  for (const value of Object.values(obj)) {
    // Only freeze objects that are:
    // 1. Not null
    // 2. Of type 'object' (includes arrays)
    // 3. Not already frozen (performance optimization)
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj;
}
