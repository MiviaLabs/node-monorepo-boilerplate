/**
 * Object property selection utilities for extracting or excluding keys
 */

/**
 * Creates a new object with only the specified keys from the source object.
 *
 * Returns a new object containing only the properties whose keys are in
 * the provided array. Keys that don't exist in the source object are
 * silently ignored. Uses the `in` operator, so inherited properties
 * are included.
 *
 * TypeScript infers the return type as `Pick<T, K>`, providing full
 * type safety for the resulting object.
 *
 * @typeParam T - The type of the source object
 * @typeParam K - The union type of keys to pick
 * @param obj - The source object to pick properties from
 * @param keys - Array of keys to include in the result
 * @returns A new object containing only the specified keys
 *
 * @example
 * ```ts
 * const user = { id: 1, name: 'Alice', email: 'alice@example.com', password: 'secret' };
 *
 * // Pick specific fields for a public response
 * const publicUser = pick(user, ['id', 'name']);
 * // { id: 1, name: 'Alice' }
 *
 * // TypeScript knows the shape
 * publicUser.id; // number
 * publicUser.email; // Error: Property 'email' does not exist
 *
 * // Non-existent keys are ignored
 * const obj = { a: 1 };
 * pick(obj, ['a', 'b' as keyof typeof obj]); // { a: 1 }
 *
 * // Preserves undefined values
 * pick({ a: 1, b: undefined }, ['a', 'b']); // { a: 1, b: undefined }
 * ```
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Creates a new object with all properties except the specified keys.
 *
 * Returns a shallow copy of the source object with the specified keys
 * removed. The original object is not modified. Keys that don't exist
 * in the source object are silently ignored.
 *
 * TypeScript infers the return type as `Omit<T, K>`, ensuring type
 * safety when accessing properties on the result.
 *
 * @typeParam T - The type of the source object
 * @typeParam K - The union type of keys to omit
 * @param obj - The source object to omit properties from
 * @param keys - Array of keys to exclude from the result
 * @returns A new object with the specified keys removed
 *
 * @example
 * ```ts
 * const user = { id: 1, name: 'Alice', password: 'secret', token: 'abc123' };
 *
 * // Remove sensitive fields before sending to client
 * const safeUser = omit(user, ['password', 'token']);
 * // { id: 1, name: 'Alice' }
 *
 * // TypeScript knows the shape
 * safeUser.name; // string
 * safeUser.password; // Error: Property 'password' does not exist
 *
 * // Original object unchanged
 * console.log(user.password); // 'secret'
 *
 * // Non-existent keys are ignored
 * const obj = { a: 1, b: 2 };
 * omit(obj, ['b', 'c' as keyof typeof obj]); // { a: 1 }
 * ```
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}
