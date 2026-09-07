/**
 * Array sorting utilities for ordering elements
 */

/**
 * Sorts an array by a key derived from each element.
 *
 * Creates a new sorted array without modifying the original (non-mutating).
 * The sort is stable, meaning elements with equal keys maintain their
 * relative order from the original array.
 *
 * @typeParam T - The type of elements in the array
 * @typeParam K - The type of the sort key (must be string or number for comparison)
 * @param arr - The array to sort
 * @param keyFn - A function that returns the sort key for each element
 * @param order - Sort direction: 'asc' for ascending (default), 'desc' for descending
 * @returns A new sorted array
 *
 * @example
 * ```ts
 * const users = [
 *   { name: 'Charlie', age: 30 },
 *   { name: 'Alice', age: 25 },
 *   { name: 'Bob', age: 30 }
 * ];
 *
 * sortBy(users, u => u.age);
 * // [{ name: 'Alice', age: 25 }, { name: 'Charlie', age: 30 }, { name: 'Bob', age: 30 }]
 *
 * sortBy(users, u => u.name, 'desc');
 * // [{ name: 'Charlie', age: 30 }, { name: 'Bob', age: 30 }, { name: 'Alice', age: 25 }]
 *
 * sortBy([3, 1, 2], n => n); // [1, 2, 3]
 * sortBy([3, 1, 2], n => n, 'desc'); // [3, 2, 1]
 * ```
 */
export function sortBy<T, K extends string | number>(
  arr: readonly T[],
  keyFn: (item: T) => K,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...arr].sort((a, b) => {
    const aKey = keyFn(a);
    const bKey = keyFn(b);

    if (aKey < bKey) return order === 'asc' ? -1 : 1;
    if (aKey > bKey) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Sorts an array using a custom comparison function.
 *
 * Creates a new sorted array without modifying the original (non-mutating).
 * Uses JavaScript's native Array.sort() with the provided comparison function.
 * The sort is stable in modern JavaScript engines.
 *
 * @typeParam T - The type of elements in the array
 * @param arr - The array to sort
 * @param compareFn - A comparison function that returns:
 *   - negative number if a should come before b
 *   - positive number if a should come after b
 *   - 0 if a and b are equal
 * @returns A new sorted array
 *
 * @example
 * ```ts
 * const users = [
 *   { name: 'Alice', age: 25 },
 *   { name: 'Bob', age: 30 }
 * ];
 *
 * sortWith(users, (a, b) => a.age - b.age);
 * // [{ name: 'Alice', age: 25 }, { name: 'Bob', age: 30 }]
 *
 * sortWith([3, 1, 2], (a, b) => b - a); // [3, 2, 1] (descending)
 *
 * // Multi-field sort: by age, then by name
 * sortWith(users, (a, b) => a.age - b.age || a.name.localeCompare(b.name));
 * ```
 */
export function sortWith<T>(arr: readonly T[], compareFn: (a: T, b: T) => number): T[] {
  return [...arr].sort(compareFn);
}
