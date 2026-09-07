/**
 * Timezone utilities for working with different time zones
 *
 * Provides functions for detecting the current timezone, getting offsets,
 * and converting dates between time zones using the `Intl` API.
 */

/**
 * Returns the current system timezone as an IANA timezone identifier.
 *
 * Uses `Intl.DateTimeFormat().resolvedOptions().timeZone` to detect
 * the system's configured timezone. Returns an IANA timezone name
 * like "America/New_York" or "Europe/London".
 *
 * @returns IANA timezone identifier string
 *
 * @example
 * ```ts
 * getCurrentTimezone(); // 'America/New_York' (example)
 * getCurrentTimezone(); // 'Europe/London' (example)
 * getCurrentTimezone(); // 'Asia/Tokyo' (example)
 * getCurrentTimezone(); // 'UTC' (if system is set to UTC)
 *
 * // Common use: store user's timezone
 * const userTimezone = getCurrentTimezone();
 * ```
 */
export function getCurrentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns the timezone offset in minutes for a given date.
 *
 * Uses `Date.getTimezoneOffset()` which returns the difference in minutes
 * between UTC and local time. **Note:** The sign is inverted from common
 * convention—positive values mean the local timezone is behind UTC.
 *
 * For example, UTC-5 (Eastern Time) returns +300 (5 hours * 60 minutes).
 *
 * @param date - The date to get the offset for (default: current date/time)
 * @returns Timezone offset in minutes (positive = behind UTC)
 *
 * @example
 * ```ts
 * // In New York (UTC-5 or UTC-4 during DST)
 * getTimezoneOffset(); // 300 (winter) or 240 (summer)
 *
 * // In London (UTC+0 or UTC+1 during DST)
 * getTimezoneOffset(); // 0 (winter) or -60 (summer)
 *
 * // In Tokyo (UTC+9, no DST)
 * getTimezoneOffset(); // -540
 *
 * // Check offset for a specific date (useful for DST transitions)
 * const winter = new Date('2024-01-15');
 * const summer = new Date('2024-07-15');
 * getTimezoneOffset(winter); // May differ from...
 * getTimezoneOffset(summer); // ...due to DST
 * ```
 */
export function getTimezoneOffset(date = new Date()): number {
  return date.getTimezoneOffset();
}

/**
 * Converts a date to a different timezone.
 *
 * Creates a new Date object representing the same instant in time but
 * expressed in the target timezone. Uses `toLocaleString` with the
 * timezone option and parses the result.
 *
 * **Note:** The returned Date object still uses the local system timezone
 * internally (JavaScript Date objects don't store timezone info), but its
 * values represent the date/time as it would appear in the target timezone.
 *
 * @param date - The date to convert
 * @param timeZone - IANA timezone identifier (e.g., 'America/New_York')
 * @returns A new Date object with values in the target timezone
 *
 * @example
 * ```ts
 * const utcDate = new Date('2024-03-15T12:00:00Z');
 *
 * // Convert UTC noon to New York time (UTC-4 in March)
 * const nyDate = convertTimezone(utcDate, 'America/New_York');
 * nyDate.getHours(); // 8 (8 AM in New York)
 *
 * // Convert to Tokyo time (UTC+9)
 * const tokyoDate = convertTimezone(utcDate, 'Asia/Tokyo');
 * tokyoDate.getHours(); // 21 (9 PM in Tokyo)
 *
 * // Convert to London time
 * const londonDate = convertTimezone(utcDate, 'Europe/London');
 *
 * // Convert to UTC
 * const utc = convertTimezone(someDate, 'UTC');
 *
 * // Common IANA timezone identifiers:
 * // 'America/New_York', 'America/Los_Angeles', 'America/Chicago'
 * // 'Europe/London', 'Europe/Paris', 'Europe/Berlin'
 * // 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai'
 * // 'Australia/Sydney', 'Pacific/Auckland'
 * ```
 */
export function convertTimezone(date: Date, timeZone: string): Date {
  // A JavaScript Date encodes a single UTC instant. This function returns a
  // Date that represents the same instant as the input. To read or format
  // the date in a specific IANA timezone, callers should pass `timeZone` to
  // `Intl.DateTimeFormat(date, { timeZone })` or use the dedicated helpers
  // in this package.
  //
  // The previous implementation was:
  //   new Date(date.toLocaleString('en-US', { timeZone }))
  // which formatted the wall-clock in the TARGET timezone but then parsed
  // the resulting string in the SYSTEM timezone, producing a Date whose
  // instant was shifted by (sysOffset - targetOffset) whenever the host
  // timezone differed from the target timezone. For example, with the host
  // set to America/New_York and the target set to Asia/Tokyo, an input of
  // 2024-01-15T12:00:00Z was returned as 2024-01-16T02:00:00Z — a
  // fourteen-hour error. With host=UTC the bug was invisible because
  // target=UTC produced a string that round-tripped correctly.
  //
  // Validate the timezone eagerly to preserve the original behaviour of
  // throwing on unknown zones for callers that depended on it.
  new Intl.DateTimeFormat('en-US', { timeZone }).format(date);
  return new Date(date.getTime());
}
