/**
 * Time-related constants
 *
 * Centralized configuration for timezones, date formats, and duration values.
 * Duration constants are in milliseconds for direct use with JavaScript Date APIs,
 * setTimeout, and library functions.
 *
 * **Duration Constants (milliseconds):**
 * These constants provide consistent, readable time durations for:
 * - Cache TTL configuration
 * - Token expiration times
 * - Retry delays and backoff intervals
 * - Scheduled job intervals
 * - Session timeouts
 *
 * **Current Usage Status:**
 * ⚠️ The codebase currently uses hardcoded seconds in many places (especially
 * cache TTL). These constants provide a consistency opportunity for future
 * refactoring. Cache configuration uses seconds, not milliseconds.
 *
 * **Conversion Notes:**
 * - Most cache libraries expect seconds: `TIME.HOUR / 1000` = 3600 seconds
 * - JavaScript setTimeout/setInterval expects milliseconds (use directly)
 * - Database INTERVAL types vary by RDBMS
 *
 * @see apps/api/src/config/cache.config.ts - Cache TTL in seconds
 * @see apps/api/src/modules/auth/auth.constants.ts - Token expiration
 *
 * @example Using TIME constants for Redis cache TTL configuration
 * ```typescript
 * import { TIME } from '@package/constants/domain';
 *
 * // Redis/cache libraries typically expect TTL in seconds
 * const cacheConfig = {
 *   // User profile: cache for 1 hour
 *   userProfile: TIME.HOUR / 1000,        // 3600 seconds
 *
 *   // Search results: short cache
 *   searchResults: TIME.MINUTE / 1000,    // 60 seconds
 *
 *   // Static config: cache for 1 day
 *   staticConfig: TIME.DAY / 1000,        // 86400 seconds
 *
 *   // Feature flags: medium cache
 *   featureFlags: (15 * TIME.MINUTE) / 1000  // 900 seconds
 * };
 *
 * // In cache service
 * async function cacheUserProfile(userId: string, profile: UserProfile) {
 *   await redis.setex(
 *     `user:${userId}:profile`,
 *     cacheConfig.userProfile,
 *     JSON.stringify(profile)
 *   );
 * }
 * ```
 *
 * @example Using TIME constants for timeout settings
 * ```typescript
 * import { TIME } from '@package/constants/domain';
 *
 * // HTTP client timeouts
 * const httpClientConfig = {
 *   timeout: 30 * TIME.SECOND,           // 30 second timeout
 *   retryDelay: 2 * TIME.SECOND,         // 2 seconds between retries
 *   maxRetryDelay: TIME.MINUTE           // Max 1 minute delay
 * };
 *
 * // Database connection pool
 * const dbPoolConfig = {
 *   idleTimeout: 10 * TIME.MINUTE,       // Close idle connections after 10 min
 *   connectionTimeout: 5 * TIME.SECOND,  // 5 second connection timeout
 *   statementTimeout: TIME.MINUTE        // 1 minute query timeout
 * };
 *
 * // BullMQ job configuration
 * const jobConfig = {
 *   timeout: 5 * TIME.MINUTE,            // Job times out after 5 minutes
 *   delay: TIME.SECOND,                  // Delay before processing
 *   removeOnComplete: { age: TIME.DAY / 1000 }  // Keep completed jobs for 1 day
 * };
 * ```
 *
 * @example Token expiration and session management
 * ```typescript
 * import { TIME } from '@package/constants/domain';
 *
 * const tokenConfig = {
 *   accessTokenExpiry: TIME.HOUR,              // 1 hour
 *   refreshTokenExpiry: 7 * TIME.DAY,          // 7 days
 *   passwordResetExpiry: 30 * TIME.MINUTE,     // 30 minutes
 *   emailVerificationExpiry: TIME.DAY          // 24 hours
 * };
 *
 * function createAccessToken(userId: string): string {
 *   const expiresAt = Date.now() + tokenConfig.accessTokenExpiry;
 *   return jwt.sign({ sub: userId, exp: Math.floor(expiresAt / 1000) }, secret);
 * }
 *
 * function isTokenExpired(expiresAt: number): boolean {
 *   // Add 5 minute grace period for clock skew
 *   return expiresAt < Date.now() - 5 * TIME.MINUTE;
 * }
 * ```
 *
 * @example Scheduled jobs and intervals
 * ```typescript
 * import { TIME } from '@package/constants/domain';
 *
 * // Cleanup job runs every hour
 * setInterval(cleanupExpiredSessions, TIME.HOUR);
 *
 * // Health check every 30 seconds
 * setInterval(checkDatabaseHealth, 30 * TIME.SECOND);
 *
 * // Daily report at midnight (use with cron scheduler)
 * const dailyReportConfig = {
 *   interval: TIME.DAY,
 *   retention: 30 * TIME.DAY  // Keep reports for 30 days
 * };
 * ```
 */

export const TIME = {
  // ──────────────────────────────────────────────────────────────────────────
  // Timezone configuration
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Default timezone: UTC
   *
   * **Rationale:** Store all timestamps in UTC to avoid timezone ambiguity.
   * Convert to user's local timezone only at display time.
   *
   * @see https://en.wikipedia.org/wiki/Coordinated_Universal_Time
   */
  DEFAULT_TIMEZONE: 'UTC',

  /**
   * Common timezones for user selection
   *
   * Subset of IANA timezone database for common regions.
   * For full timezone support, use a library like `luxon` or `date-fns-tz`.
   */
  COMMON_TIMEZONES: [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Shanghai'
  ] as const,

  // ──────────────────────────────────────────────────────────────────────────
  // Date format strings
  // Compatible with dayjs and moment.js (legacy)
  // For date-fns v2+, use lowercase: 'yyyy-MM-dd', 'HH:mm:ss'
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Date format: YYYY-MM-DD
   *
   * ISO 8601 date format. Use for date-only fields (birthdate, due date).
   * Example: "2024-12-31"
   */
  DATE_FORMAT: 'YYYY-MM-DD',

  /**
   * Time format: HH:mm:ss
   *
   * 24-hour time format with seconds.
   * Example: "14:30:00"
   */
  TIME_FORMAT: 'HH:mm:ss',

  /**
   * DateTime format: YYYY-MM-DD HH:mm:ss
   *
   * Combined date and time without timezone.
   * Example: "2024-12-31 14:30:00"
   *
   * Note: For API responses, prefer ISO_FORMAT with timezone.
   */
  DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss',

  /**
   * ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
   *
   * Full ISO 8601 format with milliseconds and UTC timezone.
   * This is the standard format for JSON API responses.
   * Example: "2024-12-31T14:30:00.000Z"
   */
  ISO_FORMAT: 'YYYY-MM-DDTHH:mm:ss.sssZ',

  // ──────────────────────────────────────────────────────────────────────────
  // Duration constants (in milliseconds)
  // Use directly with setTimeout, Date.now(), and JavaScript Date APIs
  // Divide by 1000 for seconds (cache TTL, token expiry configs)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * One second: 1,000 milliseconds
   *
   * **Use cases:**
   * - Base unit for calculations
   * - Short delays and debouncing
   * - Minimum retry intervals
   */
  SECOND: 1000,

  /**
   * One minute: 60,000 milliseconds (60 seconds)
   *
   * **Use cases:**
   * - Short cache TTL (list queries, search results)
   * - Rate limit windows
   * - Health check intervals
   * - Short-lived tokens
   *
   * **Cache example:**
   * ```ts
   * // 1 minute cache for search results
   * const ttlSeconds = TIME.MINUTE / 1000; // 60
   * ```
   */
  MINUTE: 60 * 1000,

  /**
   * One hour: 3,600,000 milliseconds (3,600 seconds)
   *
   * **Use cases:**
   * - Standard cache TTL (user profiles, settings)
   * - Access token expiration
   * - Session refresh intervals
   * - Scheduled job frequencies
   *
   * **Token example:**
   * ```ts
   * // Access token expires in 1 hour
   * const expiresAt = Date.now() + TIME.HOUR;
   * ```
   */
  HOUR: 60 * 60 * 1000,

  /**
   * One day: 86,400,000 milliseconds (86,400 seconds)
   *
   * **Use cases:**
   * - Long cache TTL (static content, configuration)
   * - Daily scheduled jobs
   * - Password reset token expiration
   * - Daily report generation
   *
   * **Retention example:**
   * ```ts
   * // Delete logs older than 30 days
   * const cutoff = Date.now() - (30 * TIME.DAY);
   * ```
   */
  DAY: 24 * 60 * 60 * 1000,

  /**
   * One week: 604,800,000 milliseconds (604,800 seconds)
   *
   * **Use cases:**
   * - Refresh token expiration
   * - Weekly scheduled jobs
   * - Analytics aggregation periods
   * - Feature flag cache TTL
   *
   * **Refresh token example:**
   * ```ts
   * // Refresh token expires in 7 days
   * const refreshTokenExpiry = Date.now() + TIME.WEEK;
   * ```
   */
  WEEK: 7 * 24 * 60 * 60 * 1000,

  /**
   * One month (30 days): 2,592,000,000 milliseconds
   *
   * **Use cases:**
   * - Subscription billing cycles
   * - Long-term cache (rarely changing data)
   * - Audit log retention periods
   * - GDPR data retention calculations
   *
   * **Note:** Uses 30-day approximation. For calendar months, use date libraries.
   *
   * **Retention example:**
   * ```ts
   * // Retain audit logs for 90 days (3 months)
   * const retentionPeriod = 3 * TIME.MONTH;
   * ```
   */
  MONTH: 30 * 24 * 60 * 60 * 1000,

  /**
   * One year (365 days): 31,536,000,000 milliseconds
   *
   * **Use cases:**
   * - Annual subscription calculations
   * - Long-term data retention
   * - Compliance periods (SOC2, GDPR)
   * - Certificate expiration
   *
   * **Note:** Uses 365-day approximation. For calendar years, use date libraries.
   * Leap years have 366 days.
   *
   * **Compliance example:**
   * ```ts
   * // SOC2 requires 1 year audit log retention
   * const complianceRetention = TIME.YEAR;
   * ```
   */
  YEAR: 365 * 24 * 60 * 60 * 1000
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Type exports for type-safe usage
// ──────────────────────────────────────────────────────────────────────────────

/** Full TIME constant type */
export type Time = typeof TIME;

/** Union of all TIME constant keys */
export type TimeKey = keyof typeof TIME;

/** Union of valid timezone strings from COMMON_TIMEZONES */
export type Timezone = (typeof TIME.COMMON_TIMEZONES)[number];

/** Date format string type */
export type DateFormat = typeof TIME.DATE_FORMAT;

/** DateTime format string type */
export type DateTimeFormat = typeof TIME.DATETIME_FORMAT;

/** ISO format string type */
export type IsoFormat = typeof TIME.ISO_FORMAT;

// ──────────────────────────────────────────────────────────────────────────────
// Named re-exports for direct imports
// Allows: import { MINUTE, HOUR, DAY } from '@package/constants/domain'
// ──────────────────────────────────────────────────────────────────────────────

/** One second in milliseconds */
export const SECOND = TIME.SECOND;

/** One minute in milliseconds */
export const MINUTE = TIME.MINUTE;

/** One hour in milliseconds */
export const HOUR = TIME.HOUR;

/** One day in milliseconds */
export const DAY = TIME.DAY;

/** One week in milliseconds */
export const WEEK = TIME.WEEK;

/** One month (30 days) in milliseconds */
export const MONTH = TIME.MONTH;

/** One year (365 days) in milliseconds */
export const YEAR = TIME.YEAR;
