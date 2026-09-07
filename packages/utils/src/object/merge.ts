/**
 * Object merging utilities for combining multiple objects
 */

/**
 * Deeply merges multiple source objects into a target object.
 *
 * Recursively merges nested objects. Arrays are **replaced**, not merged
 * or concatenated. Primitive values from later sources override earlier ones.
 *
 * **Important:** This function **mutates** the target object. If you need
 * an immutable merge, pass an empty object as target: `deepMerge({}, obj1, obj2)`.
 *
 * @typeParam T - The type of the target object
 * @param target - The target object to merge into (will be mutated)
 * @param sources - One or more source objects to merge from
 * @returns The mutated target object with all sources merged in
 *
 * @example
 * ```ts
 * // Basic nested merge
 * const target = { a: 1, b: { x: 1, y: 2 } };
 * const source = { b: { y: 3, z: 4 }, c: 5 };
 * deepMerge(target, source);
 * // target is now { a: 1, b: { x: 1, y: 3, z: 4 }, c: 5 }
 *
 * // Arrays are replaced, not merged
 * const obj1 = { items: [1, 2, 3] };
 * const obj2 = { items: [4, 5] };
 * deepMerge(obj1, obj2);
 * // obj1.items is [4, 5], not [1, 2, 3, 4, 5]
 *
 * // Immutable merge pattern
 * const result = deepMerge({}, defaults, userOptions);
 * // defaults and userOptions unchanged
 *
 * // Multiple sources (later sources override earlier)
 * deepMerge({}, { a: 1 }, { a: 2 }, { a: 3 }); // { a: 3 }
 * ```
 */
export function deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T {
  if (!sources.length) return target;

  const source = sources.shift();
  if (!source) return target;

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key as keyof T];
        const targetValue = target[key as keyof T];

        // If source value is an object (not array), deeply merge
        if (isObject(sourceValue)) {
          // If target value is an array or not an object, replace it
          if (!isObject(targetValue) || Array.isArray(targetValue)) {
            (target as Record<string, unknown>)[key] = {};
          }
          deepMerge(target[key as keyof T] as object, sourceValue as Partial<T[keyof T]>);
        } else {
          // For primitives, arrays, and other non-object values, replace
          Object.assign(target, { [key]: sourceValue });
        }
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Shallowly merges multiple objects into a new object.
 *
 * Creates a new object containing all properties from target and sources.
 * Unlike {@link deepMerge}, this does **not** mutate the target object.
 * Nested objects are not recursively merged—later sources completely
 * replace properties from earlier ones.
 *
 * Uses `Object.assign` semantics: properties from later sources override
 * earlier ones.
 *
 * @typeParam T - The type of the target object
 * @param target - The base object to merge from
 * @param sources - One or more source objects to merge
 * @returns A new object with all sources merged
 *
 * @example
 * ```ts
 * const defaults = { theme: 'light', debug: false };
 * const userPrefs = { theme: 'dark' };
 * const result = shallowMerge(defaults, userPrefs);
 * // result: { theme: 'dark', debug: false }
 * // defaults unchanged: { theme: 'light', debug: false }
 *
 * // Nested objects are replaced, not merged
 * const a = { config: { x: 1, y: 2 } };
 * const b = { config: { y: 3 } };
 * shallowMerge(a, b);
 * // { config: { y: 3 } } — x is lost!
 * ```
 */
export function shallowMerge<T extends object>(target: T, ...sources: Partial<T>[]): T {
  return Object.assign({}, target, ...sources);
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}
