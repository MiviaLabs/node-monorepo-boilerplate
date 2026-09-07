/**
 * Random number utilities
 *
 * **SECURITY WARNING:** All functions in this module use `Math.random()`,
 * which is **NOT cryptographically secure**. Do NOT use these functions for:
 * - Password generation
 * - Cryptographic keys or tokens
 * - Session IDs or authentication tokens
 * - Any security-sensitive random values
 *
 * For cryptographic purposes, use `crypto.randomUUID()` or
 * `crypto.getRandomValues()` instead.
 */

/**
 * Generates a random integer within a range (inclusive on both ends).
 *
 * **WARNING:** Uses `Math.random()` which is NOT cryptographically secure.
 * Do not use for security-sensitive applications.
 *
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (inclusive)
 * @returns A random integer where min <= result <= max
 *
 * @example
 * ```ts
 * randomInt(1, 10); // Random integer from 1 to 10 (inclusive)
 * randomInt(0, 1); // Either 0 or 1
 * randomInt(-5, 5); // Random integer from -5 to 5
 * randomInt(5, 5); // Always 5 (when min equals max)
 *
 * // Dice roll
 * const diceRoll = randomInt(1, 6);
 *
 * // Array index selection
 * const items = ['a', 'b', 'c'];
 * const randomItem = items[randomInt(0, items.length - 1)];
 * ```
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a random floating-point number within a range.
 *
 * The range is inclusive of min but exclusive of max: [min, max).
 * This matches the behavior of `Math.random()`.
 *
 * **WARNING:** Uses `Math.random()` which is NOT cryptographically secure.
 * Do not use for security-sensitive applications.
 *
 * @param min - The minimum value (inclusive)
 * @param max - The maximum value (exclusive)
 * @returns A random float where min <= result < max
 *
 * @example
 * ```ts
 * randomFloat(0, 1); // Same as Math.random()
 * randomFloat(0, 100); // Random float from 0 to 99.999...
 * randomFloat(-1, 1); // Random float from -1 to 0.999...
 * randomFloat(5, 5); // Always 5 (when min equals max)
 *
 * // Random percentage
 * const percent = randomFloat(0, 100);
 *
 * // Random coordinate
 * const lat = randomFloat(-90, 90);
 * const lng = randomFloat(-180, 180);
 * ```
 */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generates a random UUID v4 string.
 *
 * Generates a universally unique identifier in the standard UUID v4 format:
 * `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` where `x` is a random hex digit
 * and `y` is one of 8, 9, a, or b (indicating the UUID variant).
 *
 * **WARNING:** Uses `Math.random()` which is NOT cryptographically secure.
 * For secure UUIDs, use `crypto.randomUUID()` instead.
 *
 * @returns A UUID v4 string in lowercase
 *
 * @example
 * ```ts
 * randomUUID(); // e.g., '550e8400-e29b-41d4-a716-446655440000'
 * randomUUID(); // e.g., '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
 *
 * // For cryptographically secure UUIDs, use:
 * // crypto.randomUUID() (Node.js 14.17.0+, browsers via Web Crypto API)
 * ```
 */
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
