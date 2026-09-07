/**
 * Date formatting utilities using Intl.DateTimeFormat
 *
 * All functions in this module use the browser's native `Intl` API for
 * locale-aware date and time formatting. The format output varies by locale.
 */

/**
 * Formats a Date object to a localized date string (date only, no time).
 *
 * Uses `Date.toLocaleDateString()` internally with `Intl.DateTimeFormat`.
 * The output format varies by locale (e.g., MM/DD/YYYY for en-US,
 * DD/MM/YYYY for en-GB).
 *
 * @param date - The Date object to format
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns The formatted date string in locale-specific format
 *
 * @example
 * ```ts
 * const date = new Date('2024-03-15');
 *
 * formatDate(date); // '3/15/2024' (en-US)
 * formatDate(date, 'en-GB'); // '15/03/2024'
 * formatDate(date, 'de-DE'); // '15.3.2024'
 * formatDate(date, 'ja-JP'); // '2024/3/15'
 * formatDate(date, 'ar-SA'); // '١٥‏/٣‏/٢٠٢٤' (Arabic numerals)
 * ```
 */
export function formatDate(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale);
}

/**
 * Formats a Date object to a localized date and time string.
 *
 * Uses `Date.toLocaleString()` internally with `Intl.DateTimeFormat`.
 * Includes both date and time components in locale-specific format.
 *
 * @param date - The Date object to format
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns The formatted date-time string in locale-specific format
 *
 * @example
 * ```ts
 * const date = new Date('2024-03-15T14:30:00');
 *
 * formatDateTime(date); // '3/15/2024, 2:30:00 PM' (en-US)
 * formatDateTime(date, 'en-GB'); // '15/03/2024, 14:30:00'
 * formatDateTime(date, 'de-DE'); // '15.3.2024, 14:30:00'
 * formatDateTime(date, 'ja-JP'); // '2024/3/15 14:30:00'
 * ```
 */
export function formatDateTime(date: Date, locale = 'en-US'): string {
  return date.toLocaleString(locale);
}

/**
 * Formats a Date object to a localized time string (time only, no date).
 *
 * Uses `Date.toLocaleTimeString()` internally with `Intl.DateTimeFormat`.
 * The output includes hours, minutes, and seconds in locale-specific format.
 *
 * @param date - The Date object to format
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns The formatted time string in locale-specific format
 *
 * @example
 * ```ts
 * const date = new Date('2024-03-15T14:30:45');
 *
 * formatTime(date); // '2:30:45 PM' (en-US, 12-hour)
 * formatTime(date, 'en-GB'); // '14:30:45' (24-hour)
 * formatTime(date, 'de-DE'); // '14:30:45'
 * formatTime(date, 'ja-JP'); // '14:30:45'
 * ```
 */
export function formatTime(date: Date, locale = 'en-US'): string {
  return date.toLocaleTimeString(locale);
}

/**
 * Formats a date relative to the current time using human-readable text.
 *
 * Uses `Intl.RelativeTimeFormat` internally for locale-aware relative time
 * formatting. The output uses natural language like "2 hours ago",
 * "yesterday", "in 3 days", etc.
 *
 * **Behavior by time difference:**
 * - Less than 1 minute: "X seconds ago"
 * - Less than 1 hour: "X minutes ago"
 * - Less than 1 day: "X hours ago"
 * - 1-7 days: "yesterday", "2 days ago", etc.
 * - More than 7 days: Falls back to {@link formatDate}
 *
 * @param date - The Date object to format relative to now
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns Human-readable relative time string
 *
 * @example
 * ```ts
 * const now = new Date();
 *
 * // 30 seconds ago
 * formatRelative(new Date(now.getTime() - 30000)); // '30 seconds ago'
 *
 * // 5 minutes ago
 * formatRelative(new Date(now.getTime() - 300000)); // '5 minutes ago'
 *
 * // 2 hours ago
 * formatRelative(new Date(now.getTime() - 7200000)); // '2 hours ago'
 *
 * // Yesterday
 * formatRelative(new Date(now.getTime() - 86400000)); // 'yesterday'
 *
 * // Localized output
 * formatRelative(new Date(now.getTime() - 7200000), 'de-DE'); // 'vor 2 Stunden'
 * formatRelative(new Date(now.getTime() - 86400000), 'es-ES'); // 'ayer'
 *
 * // Future dates work too
 * formatRelative(new Date(now.getTime() + 3600000)); // 'in 1 hour'
 * ```
 */
export function formatRelative(date: Date, locale = 'en-US'): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (days > 7) {
    return formatDate(date, locale);
  }
  if (days > 0) {
    return rtf.format(-days, 'day');
  }
  if (hours > 0) {
    return rtf.format(-hours, 'hour');
  }
  if (minutes > 0) {
    return rtf.format(-minutes, 'minute');
  }
  return rtf.format(-seconds, 'second');
}
