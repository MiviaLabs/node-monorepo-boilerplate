/**
 * Object cloning utilities for creating copies of objects and arrays
 */

/**
 * Creates a deep clone of an object, recursively copying all nested objects
 * and arrays.
 *
 * **Limitations:**
 * - No circular reference detection - will cause stack overflow on circular structures
 * - Only handles plain objects, Arrays, and Dates
 * - Does not clone Map, Set, RegExp, WeakMap, WeakSet, or other built-in objects
 * - Date objects are treated as primitives (same reference returned, not cloned)
 * - Functions are not cloned (same reference returned)
 * - Symbol keys are not copied
 *
 * @typeParam T - The type of the object to clone
 * @param obj - The object to deep clone
 * @returns A deep copy of the object, or the original value if primitive
 *
 * @example
 * ```ts
 * const original = { a: 1, b: { c: 2 } };
 * const cloned = deepClone(original);
 * cloned.b.c = 3;
 * console.log(original.b.c); // 2 (unchanged)
 *
 * // Arrays are deeply cloned
 * const arr = [{ x: 1 }, { x: 2 }];
 * const clonedArr = deepClone(arr);
 * clonedArr[0].x = 99;
 * console.log(arr[0].x); // 1 (unchanged)
 *
 * // Primitives returned as-is
 * deepClone(42); // 42
 * deepClone('hello'); // 'hello'
 * deepClone(null); // null
 * ```
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Date objects are returned as-is (treated like primitives)
  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Creates a shallow clone of an object or array.
 *
 * Only the top-level properties are copied; nested objects and arrays
 * retain their original references. For deep copying, use {@link deepClone}.
 *
 * @typeParam T - The type of the object to clone
 * @param obj - The object or array to shallow clone
 * @returns A shallow copy of the object, or the original value if primitive
 *
 * @example
 * ```ts
 * const original = { a: 1, b: { c: 2 } };
 * const cloned = shallowClone(original);
 *
 * cloned.a = 99;
 * console.log(original.a); // 1 (unchanged)
 *
 * cloned.b.c = 99;
 * console.log(original.b.c); // 99 (changed! nested object is shared)
 *
 * // Arrays are shallow cloned
 * const arr = [1, 2, 3];
 * const clonedArr = shallowClone(arr);
 * clonedArr.push(4);
 * console.log(arr); // [1, 2, 3] (unchanged)
 *
 * // Primitives returned as-is
 * shallowClone(42); // 42
 * ```
 */
export function shallowClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return [...obj] as T;
  }

  return { ...obj };
}
