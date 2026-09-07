/**
 * Array chunking utilities for splitting arrays into smaller pieces
 */

/**
 * Splits an array into chunks of a specified size.
 *
 * Creates a new array of arrays, where each inner array contains up to
 * `size` elements from the original array. The last chunk may contain
 * fewer elements if the array length is not evenly divisible by size.
 *
 * @typeParam T - The type of elements in the array
 * @param arr - The array to split into chunks
 * @param size - The maximum size of each chunk (must be greater than 0)
 * @returns A readonly array of chunks, each containing up to `size` elements
 * @throws {Error} Throws an error if size is less than or equal to 0
 *
 * @example
 * ```ts
 * chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
 * chunk([1, 2, 3, 4], 2); // [[1, 2], [3, 4]]
 * chunk([1, 2, 3], 5); // [[1, 2, 3]]
 * chunk([], 2); // []
 * chunk([1, 2, 3], 0); // throws Error: 'Chunk size must be greater than 0'
 * ```
 */
export function chunk<T>(arr: readonly T[], size: number): readonly T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
