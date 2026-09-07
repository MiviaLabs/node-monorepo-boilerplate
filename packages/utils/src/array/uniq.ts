/**
 * Array unique value utilities for deduplication
 */

/**
 * Returns an array with unique values, removing duplicates.
 *
 * Uses Set for deduplication, which means:
 * - Primitive values are compared by value
 * - Objects are compared by reference
 * - NaN values are considered equal (only one NaN is kept)
 * - First occurrence is preserved, subsequent duplicates are removed
 *
 * @typeParam T - The type of elements in the array
 * @param arr - The array to deduplicate
 * @returns A new array containing only unique values in their original order
 *
 * @example
 * ```ts
 * uniq([1, 2, 2, 3, 1]); // [1, 2, 3]
 * uniq(['a', 'b', 'a']); // ['a', 'b']
 * uniq([NaN, NaN]); // [NaN]
 * uniq([]); // []
 *
 * // Objects are compared by reference
 * const obj = { id: 1 };
 * uniq([obj, obj, { id: 1 }]); // [obj, { id: 1 }] - 2 elements
 * ```
 */
export function uniq<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Returns an array with unique values based on a key derived from each element.
 *
 * Applies the key function to each element and keeps only the first element
 * for each unique key. Useful for deduplicating objects by a specific property.
 *
 * @typeParam T - The type of elements in the array
 * @typeParam K - The type of the uniqueness key
 * @param arr - The array to deduplicate
 * @param keyFn - A function that returns the uniqueness key for each element.
 *   Receives the item and its index as arguments.
 * @returns A new array containing the first element for each unique key
 *
 * @example
 * ```ts
 * const users = [
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' },
 *   { id: 1, name: 'Alice Clone' }
 * ];
 *
 * uniqBy(users, u => u.id);
 * // [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
 *
 * // Using index parameter
 * uniqBy([1, 2, 3, 4], (n, i) => i % 2); // [1, 2] (first even-indexed, first odd-indexed)
 *
 * uniqBy([{ x: 1 }, { x: 2 }, { x: 1 }], o => o.x);
 * // [{ x: 1 }, { x: 2 }]
 * ```
 */
export function uniqBy<T, K>(arr: readonly T[], keyFn: (item: T, index: number) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];

  for (const [index, item] of arr.entries()) {
    const key = keyFn(item, index);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}
