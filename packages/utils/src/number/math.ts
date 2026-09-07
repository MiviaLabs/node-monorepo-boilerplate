/**
 * Math utilities for common numerical operations
 */

/**
 * Constrains a number to be within a specified range.
 *
 * If the value is less than min, returns min. If greater than max, returns max.
 * Otherwise returns the original value.
 *
 * @param value - The number to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value within [min, max]
 * @throws {RangeError} Throws if min is greater than max
 *
 * @example
 * ```ts
 * clamp(5, 0, 10); // 5 (within range)
 * clamp(-5, 0, 10); // 0 (below min)
 * clamp(15, 0, 10); // 10 (above max)
 * clamp(0.5, 0, 1); // 0.5 (decimals work)
 * clamp(-10, -5, -1); // -5 (negative range)
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp: min (${min}) must be less than or equal to max (${max})`);
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Rounds a number to a specified number of decimal places.
 *
 * Uses standard rounding rules (0.5 rounds up). Supports negative decimal
 * places to round to the left of the decimal point.
 *
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 0). Can be negative
 *   to round to tens, hundreds, etc.
 * @returns The rounded number
 *
 * @example
 * ```ts
 * round(3.14159); // 3
 * round(3.14159, 2); // 3.14
 * round(3.14159, 4); // 3.1416
 * round(2.5); // 3 (rounds up)
 * round(1234, -2); // 1200 (rounds to hundreds)
 * round(1567, -3); // 2000 (rounds to thousands)
 * round(-2.5); // -2 (JavaScript's rounding behavior)
 * ```
 */
export function round(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Rounds a number down to the nearest integer.
 *
 * Always rounds toward negative infinity. For positive numbers, this
 * truncates the decimal part. For negative numbers, this rounds away
 * from zero.
 *
 * @param value - The number to round down
 * @returns The largest integer less than or equal to value
 *
 * @example
 * ```ts
 * floor(3.7); // 3
 * floor(3.2); // 3
 * floor(-3.2); // -4 (rounds toward negative infinity)
 * floor(-3.7); // -4
 * floor(5); // 5 (integers unchanged)
 * ```
 */
export function floor(value: number): number {
  return Math.floor(value);
}

/**
 * Rounds a number up to the nearest integer.
 *
 * Always rounds toward positive infinity. For positive numbers with
 * decimals, this rounds up. For negative numbers, this rounds toward zero.
 *
 * **Edge case:** Converts -0 to 0 for consistency (Math.ceil(-0.1) normally
 * returns -0).
 *
 * @param value - The number to round up
 * @returns The smallest integer greater than or equal to value
 *
 * @example
 * ```ts
 * ceil(3.2); // 4
 * ceil(3.7); // 4
 * ceil(-3.2); // -3 (rounds toward zero)
 * ceil(-3.7); // -3
 * ceil(5); // 5 (integers unchanged)
 * ceil(-0.1); // 0 (not -0)
 * ```
 */
export function ceil(value: number): number {
  const result = Math.ceil(value);
  // Handle -0 case: Math.ceil(-0.1) returns -0, but we want 0
  return Object.is(result, -0) ? 0 : result;
}

/**
 * Divides two numbers safely, returning a fallback when dividing by zero.
 *
 * Avoids the JavaScript behavior where division by zero returns `Infinity`
 * or `-Infinity`. Instead returns a configurable fallback value.
 *
 * @param numerator - The dividend
 * @param denominator - The divisor
 * @param fallback - Value to return when denominator is zero (default: 0)
 * @returns The quotient, or fallback if denominator is zero
 *
 * @example
 * ```ts
 * safeDivide(10, 2); // 5
 * safeDivide(10, 0); // 0 (default fallback)
 * safeDivide(10, 0, -1); // -1 (custom fallback)
 * safeDivide(0, 5); // 0 (zero numerator works normally)
 * safeDivide(-10, 2); // -5 (negatives work)
 * safeDivide(10, 0, Infinity); // Infinity (if you really want it)
 * ```
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  return denominator === 0 ? fallback : numerator / denominator;
}
