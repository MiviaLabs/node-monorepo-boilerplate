import { createHash } from 'node:crypto';

/**
 * Hash an email address for secure storage/lookup
 * Uses SHA-256 for deterministic hashing
 *
 * NOTE: This is NOT for password hashing. SHA-256 is intentionally used for
 * fast, deterministic email lookups in the database. The actual email is stored
 * encrypted (AES-256-GCM) separately. Passwords are hashed using bcrypt with salt.
 *
 * Security Context:
 * - Email hash (this function): For indexed lookups without exposing plaintext
 * - Email encryption (separate): AES-256-GCM for actual email storage
 * - Password hashing (separate): bcrypt with salt rounds for credential storage
 *
 * CodeQL False Positive Suppression:
 * The js/insufficient-password-hash alert is a false positive. This function
 * is used for deterministic email hashing for database lookups (indexed column),
 * NOT for password hashing. Passwords are hashed separately using bcrypt with salt.
 *
 * Alert suppression is configured in: .github/codeql/alert-suppressions.yml
 * Inline suppression comments (lgtm/codeql) are insufficient for this rule.
 *
 * @param email - Email address to hash
 * @returns Hex-encoded SHA-256 hash of lowercase trimmed email
 *
 * @example
 * ```typescript
 * import { hashEmail } from '@package/utils';
 *
 * const hash = hashEmail('user@example.com');
 * // Returns: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'
 * ```
 */
export function hashEmail(email: string): string {
  // lgtm[js/insufficient-password-hash] codeql[js/insufficient-password-hash]
  // CodeQL alert is also suppressed via .github/codeql/alert-suppressions.yml
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}
