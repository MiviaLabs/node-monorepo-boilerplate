/**
 * Date range utilities for working with time periods
 *
 * Provides functions for creating, validating, and comparing date ranges.
 * Useful for scheduling, booking systems, and time-based filtering.
 */

/**
 * Represents a date range with a start and end date.
 *
 * Both start and end are inclusive. The range is readonly to prevent
 * accidental mutation after creation.
 *
 * @example
 * ```ts
 * const range: DateRange = {
 *   start: new Date('2024-03-01'),
 *   end: new Date('2024-03-31')
 * };
 * ```
 */
export interface DateRange {
  /** The start date of the range (inclusive) */
  readonly start: Date;
  /** The end date of the range (inclusive) */
  readonly end: Date;
}

/**
 * Creates a validated date range from start and end dates.
 *
 * Validates that start date is not after end date. Use this function
 * instead of creating `DateRange` objects directly to ensure validity.
 *
 * @param start - The start date of the range (inclusive)
 * @param end - The end date of the range (inclusive)
 * @returns A readonly DateRange object
 * @throws {Error} Throws if start date is after end date
 *
 * @example
 * ```ts
 * // Valid range
 * const march = createDateRange(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-31')
 * );
 *
 * // Same start and end is valid (single point in time)
 * const singleDay = createDateRange(
 *   new Date('2024-03-15'),
 *   new Date('2024-03-15')
 * );
 *
 * // Throws Error: 'Start date must be before end date'
 * createDateRange(
 *   new Date('2024-03-31'),
 *   new Date('2024-03-01')
 * );
 * ```
 */
export function createDateRange(start: Date, end: Date): DateRange {
  if (start > end) {
    throw new Error('Start date must be before end date');
  }
  return { start, end };
}

/**
 * Checks if a date falls within a date range (inclusive).
 *
 * Returns true if the date is greater than or equal to the range start
 * AND less than or equal to the range end.
 *
 * @param date - The date to check
 * @param range - The date range to check against
 * @returns `true` if the date is within the range, `false` otherwise
 *
 * @example
 * ```ts
 * const march = createDateRange(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-31')
 * );
 *
 * isDateInRange(new Date('2024-03-15'), march); // true (middle)
 * isDateInRange(new Date('2024-03-01'), march); // true (start boundary)
 * isDateInRange(new Date('2024-03-31'), march); // true (end boundary)
 * isDateInRange(new Date('2024-02-28'), march); // false (before)
 * isDateInRange(new Date('2024-04-01'), march); // false (after)
 * ```
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * Checks if two date ranges overlap.
 *
 * Returns true if any part of the two ranges intersect. Ranges that share
 * the exact same boundary timestamp are considered overlapping (e.g., if
 * range1.end equals range2.start, they overlap).
 *
 * @param range1 - The first date range
 * @param range2 - The second date range
 * @returns `true` if the ranges overlap, `false` otherwise
 *
 * @example
 * ```ts
 * const march = createDateRange(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-31')
 * );
 * const midMarch = createDateRange(
 *   new Date('2024-03-15'),
 *   new Date('2024-04-15')
 * );
 * const april = createDateRange(
 *   new Date('2024-04-01'),
 *   new Date('2024-04-30')
 * );
 * const touchingApril = createDateRange(
 *   new Date('2024-03-31'), // starts exactly when march ends
 *   new Date('2024-04-30')
 * );
 *
 * overlapRanges(march, midMarch); // true (partial overlap)
 * overlapRanges(march, april); // false (adjacent but not overlapping)
 * overlapRanges(march, touchingApril); // true (share boundary timestamp)
 * overlapRanges(march, march); // true (same range)
 * ```
 */
export function overlapRanges(range1: DateRange, range2: DateRange): boolean {
  return range1.start <= range2.end && range1.end >= range2.start;
}

/**
 * Calculates the duration of a date range in milliseconds.
 *
 * Returns the difference between end and start timestamps. Use this
 * value with time constants to convert to other units.
 *
 * @param range - The date range to measure
 * @returns Duration in milliseconds (end - start)
 *
 * @example
 * ```ts
 * const oneDay = createDateRange(
 *   new Date('2024-03-01T00:00:00'),
 *   new Date('2024-03-02T00:00:00')
 * );
 * getRangeDuration(oneDay); // 86400000 (24 * 60 * 60 * 1000)
 *
 * const oneWeek = createDateRange(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-08')
 * );
 * const durationMs = getRangeDuration(oneWeek);
 * const durationDays = durationMs / (1000 * 60 * 60 * 24); // 7
 *
 * // Zero duration for same start/end
 * const instant = createDateRange(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-01')
 * );
 * getRangeDuration(instant); // 0
 * ```
 */
export function getRangeDuration(range: DateRange): number {
  return range.end.getTime() - range.start.getTime();
}
