/**
 * Date parsing utilities for converting strings to Date objects
 *
 * All parse functions return `null` for invalid inputs rather than throwing
 * errors. This allows for safe parsing without try-catch blocks.
 */

/**
 * Checks if a date string represents a valid date without auto-correction.
 *
 * Validates ISO-format date strings to reject invalid months (e.g., month 13).
 * Allows JavaScript's day auto-correction (e.g., Feb 30 → March 1/2).
 *
 * @param dateStr - The date string to validate
 * @returns True if the date string is valid, false otherwise
 * @internal
 */
function isValidDateString(dateStr: string): boolean {
  // Check if it's a valid ISO date format (YYYY-MM-DD or similar)
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;
  if (isoDateRegex.test(dateStr)) {
    // Extract month from the string to check validity
    const match = dateStr.match(/^\d{4}-(\d{2})-\d{2}/);
    if (match && match[1]) {
      const month = parseInt(match[1], 10);

      // Check if month is valid (1-12)
      // Invalid months like 13, 14, etc. should be rejected
      if (month < 1 || month > 12) {
        return false;
      }

      // For valid months, allow day auto-correction by JavaScript
      // E.g., Feb 30 becomes March 1/2, which is acceptable
    }
  }

  return true;
}

/**
 * Parses a date string into a Date object.
 *
 * Returns `null` for invalid inputs instead of throwing an error.
 * Validates month values (1-12) to prevent JavaScript's auto-correction
 * of invalid months.
 *
 * **Supported formats:**
 * - ISO 8601: `'2024-03-15'`, `'2024-03-15T14:30:00'`
 * - ISO with timezone: `'2024-03-15T14:30:00Z'`, `'2024-03-15T14:30:00+05:30'`
 * - Slash-separated: `'3/15/2024'` (locale-dependent)
 * - Most formats accepted by `new Date()`
 *
 * @param dateStr - The date string to parse
 * @returns A Date object if valid, or `null` if invalid
 *
 * @example
 * ```ts
 * parseDate('2024-03-15'); // Date object for March 15, 2024
 * parseDate('2024-03-15T14:30:00'); // Date with time
 * parseDate('2024-03-15T14:30:00Z'); // Date with UTC timezone
 * parseDate('invalid'); // null
 * parseDate(''); // null
 * parseDate('2024-13-01'); // null (invalid month)
 * ```
 */
export function parseDate(dateStr: string): Date | null {
  // Validate date string to prevent auto-correction for invalid months
  if (!isValidDateString(dateStr)) {
    return null;
  }

  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parses a date-time string into a Date object.
 *
 * Alias for {@link parseDate}. Returns `null` for invalid inputs instead
 * of throwing. Useful for semantic clarity when parsing date-time strings.
 *
 * **Supported formats:**
 * - ISO 8601 with time: `'2024-03-15T14:30:00'`
 * - ISO with timezone: `'2024-03-15T14:30:00Z'`, `'2024-03-15T14:30:00+05:30'`
 * - ISO with milliseconds: `'2024-03-15T14:30:00.123Z'`
 *
 * @param dateStr - The date-time string to parse
 * @returns A Date object if valid, or `null` if invalid
 *
 * @example
 * ```ts
 * parseDateTime('2024-03-15T14:30:00'); // Date with local time
 * parseDateTime('2024-03-15T14:30:00Z'); // Date with UTC
 * parseDateTime('2024-03-15T14:30:00+05:30'); // Date with offset
 * parseDateTime('invalid'); // null
 * ```
 */
export function parseDateTime(dateStr: string): Date | null {
  return parseDate(dateStr);
}

/**
 * Parses an ISO 8601 formatted date string into a Date object.
 *
 * Alias for {@link parseDate}. Returns `null` for invalid inputs instead
 * of throwing. Provides semantic clarity when working specifically with
 * ISO 8601 strings.
 *
 * **Supported ISO 8601 formats:**
 * - Date only: `'2024-03-15'`
 * - Date and time: `'2024-03-15T14:30:00'`
 * - With UTC indicator: `'2024-03-15T14:30:00Z'`
 * - With timezone offset: `'2024-03-15T14:30:00+05:30'`
 * - With milliseconds: `'2024-03-15T14:30:00.123Z'`
 *
 * @param dateStr - The ISO 8601 date string to parse
 * @returns A Date object if valid, or `null` if invalid
 *
 * @example
 * ```ts
 * parseISO('2024-03-15'); // Date object
 * parseISO('2024-03-15T14:30:00Z'); // Date with UTC
 * parseISO('2024-03-15T14:30:00.123+05:30'); // Full ISO format
 * parseISO('not-a-date'); // null
 * parseISO('2024-13-01'); // null (invalid month)
 * ```
 */
export function parseISO(dateStr: string): Date | null {
  return parseDate(dateStr);
}

/**
 * Checks if a Date object represents a valid date.
 *
 * Returns `false` for:
 * - `Invalid Date` objects (created from invalid input)
 * - Non-Date objects that may have been passed incorrectly
 *
 * This is useful for validating Date objects that may have been created
 * from user input or external sources.
 *
 * @param date - The Date object to validate
 * @returns `true` if the date is valid, `false` otherwise
 *
 * @example
 * ```ts
 * isValidDate(new Date()); // true
 * isValidDate(new Date('2024-03-15')); // true
 * isValidDate(new Date('invalid')); // false (Invalid Date)
 * isValidDate(new Date(NaN)); // false
 *
 * // Common validation pattern
 * const userDate = new Date(userInput);
 * if (isValidDate(userDate)) {
 *   // Safe to use userDate
 * }
 * ```
 */
export function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}
