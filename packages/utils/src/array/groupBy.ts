/**
 * Array grouping utilities for categorizing elements
 */

/**
 * Groups array elements by a key derived from each element.
 *
 * Applies the key function to each element and groups elements with the
 * same key together. The result is a record where keys are the derived
 * values and values are arrays of elements that produced that key.
 *
 * @typeParam T - The type of elements in the array
 * @typeParam K - The type of the grouping key (must be string or number)
 * @param arr - The array to group
 * @param keyFn - A function that returns the grouping key for each element
 * @returns A record mapping each unique key to an array of elements with that key
 *
 * @example
 * ```ts
 * const users = [
 *   { name: 'Alice', role: 'admin' },
 *   { name: 'Bob', role: 'user' },
 *   { name: 'Charlie', role: 'admin' }
 * ];
 * groupBy(users, u => u.role);
 * // {
 * //   admin: [{ name: 'Alice', role: 'admin' }, { name: 'Charlie', role: 'admin' }],
 * //   user: [{ name: 'Bob', role: 'user' }]
 * // }
 *
 * groupBy([1, 2, 3, 4, 5], n => n % 2 === 0 ? 'even' : 'odd');
 * // { odd: [1, 3, 5], even: [2, 4] }
 *
 * groupBy([], x => x); // {}
 * ```
 */
export function groupBy<T, K extends string | number>(
  arr: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    },
    {} as Record<K, T[]>
  );
}
