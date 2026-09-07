/**
 * Object transformation utilities for mapping keys and values
 */

/**
 * Creates a new object with keys transformed by a mapping function.
 *
 * Iterates over the object's own enumerable properties (using `hasOwnProperty`)
 * and applies the key mapper to each key. The values remain unchanged.
 * Inherited properties and symbol keys are not processed.
 *
 * **Note:** If the mapper produces duplicate keys, later values will
 * overwrite earlier ones.
 *
 * @typeParam T - The type of the source object
 * @typeParam K - The type of the new keys (must be string)
 * @param obj - The source object to transform
 * @param keyMapper - Function that receives each key and returns the new key
 * @returns A new object with transformed keys
 *
 * @example
 * ```ts
 * // Convert keys to uppercase
 * const obj = { name: 'Alice', age: 30 };
 * mapKeys(obj, (key) => key.toUpperCase());
 * // { NAME: 'Alice', AGE: 30 }
 *
 * // Add prefix to keys
 * mapKeys({ x: 1, y: 2 }, (key) => `data_${String(key)}`);
 * // { data_x: 1, data_y: 2 }
 *
 * // Rename keys using a mapping
 * const keyMap = { oldName: 'newName', oldId: 'newId' } as const;
 * mapKeys({ oldName: 'test', oldId: 123 }, (key) => keyMap[key] ?? key);
 * // { newName: 'test', newId: 123 }
 *
 * // Caution: duplicate keys overwrite
 * mapKeys({ a: 1, b: 2 }, () => 'same'); // { same: 2 }
 * ```
 */
export function mapKeys<T extends object, K extends string>(
  obj: T,
  keyMapper: (key: keyof T) => K
): Record<K, T[keyof T]> {
  const result = {} as Record<K, T[keyof T]>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[keyMapper(key)] = obj[key];
    }
  }
  return result;
}

/**
 * Creates a new object with values transformed by a mapping function.
 *
 * Iterates over the object's own enumerable properties (using `hasOwnProperty`)
 * and applies the value mapper to each value. The keys remain unchanged.
 * Inherited properties and symbol keys are not processed.
 *
 * @typeParam T - The type of the source object
 * @typeParam V - The type of the new values
 * @param obj - The source object to transform
 * @param valueMapper - Function that receives each value and key, returns the new value
 * @returns A new object with transformed values
 *
 * @example
 * ```ts
 * // Double all numeric values
 * const prices = { apple: 1.5, banana: 0.75 };
 * mapValues(prices, (price) => price * 2);
 * // { apple: 3, banana: 1.5 }
 *
 * // Convert all values to strings
 * mapValues({ a: 1, b: true, c: null }, (v) => String(v));
 * // { a: '1', b: 'true', c: 'null' }
 *
 * // Use key in transformation
 * mapValues({ width: 100, height: 50 }, (value, key) => `${key}: ${value}px`);
 * // { width: 'width: 100px', height: 'height: 50px' }
 *
 * // Transform nested structures
 * const users = { alice: { score: 10 }, bob: { score: 20 } };
 * mapValues(users, (user) => ({ ...user, score: user.score * 2 }));
 * // { alice: { score: 20 }, bob: { score: 40 } }
 * ```
 */
export function mapValues<T extends object, V>(
  obj: T,
  valueMapper: (value: T[keyof T], key: keyof T) => V
): Record<keyof T, V> {
  const result = {} as Record<keyof T, V>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = valueMapper(obj[key], key);
    }
  }
  return result;
}
