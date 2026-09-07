/**
 * Application limit constants
 *
 * Centralized configuration values for validation, security, and resource protection.
 * These limits prevent abuse, ensure consistent behavior, and protect system resources.
 *
 * **Security Rationale:**
 * - File size limits prevent storage abuse and potential DoS via large uploads
 * - String length limits prevent database bloat and buffer overflow attempts
 * - Rate limits protect against brute force attacks and API abuse
 * - Pagination limits prevent memory exhaustion from unbounded queries
 *
 * **Current Enforcement Status:**
 * ⚠️ **Important:** Many of these limits are currently hardcoded in individual
 * validators (DTOs, Zod schemas) rather than imported from this file. This file
 * serves as the canonical reference for what the limits SHOULD be. A future
 * refactoring task should update validators to import from this file.
 *
 * **Enforcement Gaps (Known):**
 * - File upload limits: Not currently enforced server-side (relies on client)
 * - Rate limiting: Partially implemented via `@Throttle()` decorator
 * - String limits: Hardcoded in DTOs (e.g., `@MaxLength(100)`)
 *
 * @see apps/api/src/modules/auth/dto/register.dto.ts - Uses hardcoded string limits
 * @see apps/api/src/common/guards/throttle.guard.ts - Rate limiting implementation
 * @see packages/schema/src/base/string.schema.ts - Zod schema limits
 *
 * @example
 * ```typescript
 * import { LIMITS } from '@package/constants/domain';
 *
 * // In DTO validator (recommended pattern)
 * @MaxLength(LIMITS.MAX_NAME_LENGTH)
 * name: string;
 *
 * // In file upload handler
 * if (file.size > LIMITS.MAX_FILE_SIZE) {
 *   throw Errors.filefileSizeSizemb003({
 *     size: file.size / (1024 * 1024),
 *     maxSize: LIMITS.MAX_FILE_SIZE / (1024 * 1024)
 *   });
 * }
 * ```
 */

export const LIMITS = {
  // ──────────────────────────────────────────────────────────────────────────
  // File size limits (in bytes)
  // Security: Prevent storage abuse, DoS via large uploads, and memory exhaustion
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Maximum general file upload size: 10MB
   *
   * **Security rationale:** Prevents storage exhaustion attacks and limits
   * memory usage during file processing. Large files should use multipart
   * upload with streaming.
   *
   * **Use cases:** Document uploads, attachments, exports
   * **Enforcement:** ⚠️ NOT CURRENTLY ENFORCED server-side
   *
   * Recommended implementation: Add file size validation in upload middleware
   */
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  /**
   * Maximum image upload size: 5MB
   *
   * **Security rationale:** Images require processing (resize, compression)
   * which is CPU-intensive. Smaller limit reduces processing load and
   * prevents image-based attacks (e.g., decompression bombs).
   *
   * **Use cases:** Content images, thumbnails, product photos
   * **Enforcement:** ⚠️ NOT CURRENTLY ENFORCED server-side
   */
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB

  /**
   * Maximum avatar upload size: 2MB
   *
   * **Security rationale:** Avatars are frequently loaded and should be
   * optimized. Smaller limit encourages proper image optimization and
   * reduces CDN storage costs.
   *
   * **Use cases:** User profile pictures, team avatars
   * **Enforcement:** ⚠️ NOT CURRENTLY ENFORCED server-side
   */
  MAX_AVATAR_SIZE: 2 * 1024 * 1024, // 2MB

  // ──────────────────────────────────────────────────────────────────────────
  // String length limits
  // Database: Matches VARCHAR column sizes, prevents truncation errors
  // UX: Ensures reasonable display in UI components
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Maximum name field length: 100 characters
   *
   * **Database:** Matches VARCHAR(100) columns for names
   * **UX:** Fits comfortably in UI headers, lists, and cards
   * **Security:** Prevents extremely long strings that could break layouts
   *
   * **Use cases:** User names, organization names, project names
   * **Enforcement:** Hardcoded in DTOs as `@MaxLength(100)`
   *
   * @see apps/api/src/modules/auth/dto/register.dto.ts
   */
  MAX_NAME_LENGTH: 100,

  /**
   * Maximum description field length: 5000 characters
   *
   * **Database:** Matches TEXT columns with application-level limit
   * **UX:** Allows detailed descriptions while preventing abuse
   * **Security:** Prevents massive text payloads in API requests
   *
   * **Use cases:** Project descriptions, bio fields, rich text content
   * **Enforcement:** Hardcoded in DTOs as `@MaxLength(5000)`
   */
  MAX_DESCRIPTION_LENGTH: 5000,

  /**
   * Maximum slug field length: 100 characters
   *
   * **Database:** Matches VARCHAR(100) for URL-safe identifiers
   * **UX:** Keeps URLs readable and shareable
   * **Security:** Prevents URL length issues in browsers
   *
   * **Use cases:** URL slugs, tenant slugs, resource identifiers
   * **Enforcement:** Hardcoded in validators
   */
  MAX_SLUG_LENGTH: 100,

  /**
   * Maximum email field length: 255 characters
   *
   * **Database:** Standard VARCHAR(255) for email columns
   * **Standard:** RFC 5321 allows up to 254 characters for email addresses
   * **Security:** Prevents email header injection with oversized addresses
   *
   * **Use cases:** User email, contact email, notification addresses
   * **Enforcement:** Hardcoded in Zod schemas and DTOs
   */
  MAX_EMAIL_LENGTH: 255,

  // ──────────────────────────────────────────────────────────────────────────
  // Pagination limits
  // Performance: Prevents memory exhaustion from large result sets
  // See also: PAGINATION constants for dedicated pagination config
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Maximum page size: 100 items
   *
   * **Performance:** Prevents memory exhaustion and slow queries
   * **Database:** Limits result set size for query optimization
   * **UX:** Balances data loading with render performance
   *
   * Unbounded pagination is dangerous because:
   * - Large result sets exhaust server memory
   * - Slow queries block database connections
   * - Network payloads become unmanageable
   *
   * @see packages/schema/src/domain/pagination.schema.ts
   */
  MAX_PAGE_SIZE: 100,

  /**
   * Default page size: 20 items
   *
   * **Rationale:** Balances data availability with performance
   * - Small enough for fast initial loads
   * - Large enough to be useful without immediate pagination
   * - Matches common UI patterns (lists, tables, grids)
   */
  DEFAULT_PAGE_SIZE: 20,

  // ──────────────────────────────────────────────────────────────────────────
  // Rate limiting
  // Security: DDoS prevention, brute force protection, API abuse prevention
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Maximum API requests per minute: 60
   *
   * **Security:** Prevents API abuse and DDoS attacks
   * **Fair usage:** Ensures resources available for all users
   * **Cost:** Limits cloud compute costs from runaway scripts
   *
   * **Enforcement:** Partially via `@Throttle()` decorator
   *
   * @see apps/api/src/common/guards/throttle.guard.ts
   * @see apps/api/src/common/decorators/throttle.decorator.ts
   */
  MAX_REQUESTS_PER_MINUTE: 60,

  /**
   * Maximum failed login attempts: 5
   *
   * **Security:** Brute force protection for credential guessing
   * **Balance:** Allows for typos while blocking automated attacks
   * **Standard:** OWASP recommendation for account lockout
   *
   * After 5 failed attempts, account is locked for LOCKOUT_DURATION_MINUTES
   *
   * @see apps/api/src/modules/auth/services/auth.service.ts
   */
  MAX_LOGIN_ATTEMPTS: 5,

  /**
   * Account lockout duration: 15 minutes
   *
   * **Security:** Temporary lockout after failed login attempts
   * **Balance:** Short enough for legitimate users, long enough to deter attacks
   * **Standard:** OWASP recommendation for lockout duration
   *
   * Exponential backoff could be implemented for repeated lockouts
   */
  LOCKOUT_DURATION_MINUTES: 15
} as const;

export type Limits = typeof LIMITS;
export type LimitKey = keyof typeof LIMITS;
