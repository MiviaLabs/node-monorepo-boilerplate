/**
 * String validation utilities for common formats
 */

/**
 * Checks if a string is a valid email address.
 *
 * Uses a regex pattern that validates:
 * - Local part: alphanumeric with `.`, `_`, `%`, `+`, `-`
 * - Domain: alphanumeric with `.` and `-`
 * - TLD: at least 2 alphabetic characters
 * - No consecutive dots allowed
 *
 * @param str - The string to validate
 * @returns True if the string is a valid email format, false otherwise
 *
 * @example
 * ```ts
 * isEmail('user@example.com'); // true
 * isEmail('user.name+tag@example.co.uk'); // true
 * isEmail('invalid'); // false
 * isEmail('user@'); // false
 * isEmail('user..name@example.com'); // false
 * ```
 */
export function isEmail(str: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  // Check for consecutive dots which are invalid
  if (/\.\./.test(str)) return false;
  return emailRegex.test(str);
}

/**
 * Checks if a string is a valid UUID (versions 1-5).
 *
 * Validates the standard UUID format: 8-4-4-4-12 hexadecimal characters.
 * Supports UUID versions 1 through 5, with variant bits in the 9th position
 * of the 4th group being 8, 9, a, or b.
 *
 * @param str - The string to validate
 * @returns True if the string is a valid UUID format, false otherwise
 *
 * @example
 * ```ts
 * isUUID('550e8400-e29b-41d4-a716-446655440000'); // true (v4)
 * isUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8'); // true (v1)
 * isUUID('550e8400-e29b-41d4-a716'); // false (incomplete)
 * isUUID('not-a-uuid'); // false
 * isUUID('550e8400e29b41d4a716446655440000'); // false (no hyphens)
 * ```
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Checks if a string is a valid URL.
 *
 * Uses the native URL constructor for validation, which supports:
 * - HTTP/HTTPS protocols
 * - FTP, file, and other valid URL schemes
 * - IPv4 and IPv6 addresses
 * - Ports, paths, query strings, and fragments
 *
 * @param str - The string to validate
 * @returns True if the string is a valid URL, false otherwise
 *
 * @example
 * ```ts
 * isURL('https://example.com'); // true
 * isURL('http://localhost:3000/path?query=1'); // true
 * isURL('ftp://files.example.com'); // true
 * isURL('example.com'); // false (no protocol)
 * isURL('not a url'); // false
 * ```
 */
export function isURL(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a string is empty or contains only whitespace.
 *
 * Trims the string and checks if the result has zero length.
 * Considers spaces, tabs, newlines, and other whitespace characters.
 *
 * @param str - The string to check
 * @returns True if the string is empty or whitespace-only, false otherwise
 *
 * @example
 * ```ts
 * isEmpty(''); // true
 * isEmpty('   '); // true
 * isEmpty('\t\n'); // true
 * isEmpty('hello'); // false
 * isEmpty(' hello '); // false
 * ```
 */
export function isEmpty(str: string): boolean {
  return str.trim().length === 0;
}

/**
 * Checks if a string represents a valid numeric value.
 *
 * Returns true if the string can be converted to a valid number using
 * JavaScript's Number() function. Empty strings and whitespace-only
 * strings return false.
 *
 * @param str - The string to check
 * @returns True if the string is a valid numeric representation, false otherwise
 *
 * @example
 * ```ts
 * isNumeric('123'); // true
 * isNumeric('-456.78'); // true
 * isNumeric('1e10'); // true
 * isNumeric('  42  '); // true
 * isNumeric(''); // false
 * isNumeric('abc'); // false
 * isNumeric('12abc'); // false
 * ```
 */
export function isNumeric(str: string): boolean {
  return !Number.isNaN(Number(str)) && str.trim() !== '';
}
