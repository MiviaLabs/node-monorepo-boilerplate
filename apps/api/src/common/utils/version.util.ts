/**
 * Error thrown when version string is invalid
 */
export class InvalidVersionError extends Error {
  constructor(version: string, reason: string) {
    super(`Invalid version "${version}": ${reason}`);
    this.name = 'InvalidVersionError';
  }
}

/**
 * Normalize version string to semantic version format
 *
 * Converts various version formats to semver:
 * - 'v1' -> '1.0.0'
 * - '1' -> '1.0.0'
 * - '1.0' -> '1.0.0'
 * - 'v1.0' -> '1.0.0'
 * - '1.0.0' -> '1.0.0' (no change)
 *
 * @param version - Version string to normalize (with or without 'v' prefix)
 * @returns Normalized semantic version string (major.minor.patch)
 * @throws {InvalidVersionError} When version string is invalid
 *
 * @example
 * ```typescript
 * normalizeSemanticVersion('1')      // '1.0.0'
 * normalizeSemanticVersion('1.0')    // '1.0.0'
 * normalizeSemanticVersion('v1')     // '1.0.0'
 * normalizeSemanticVersion('v1.0')   // '1.0.0'
 * normalizeSemanticVersion('1.0.0')  // '1.0.0'
 * normalizeSemanticVersion('vabc')   // throws InvalidVersionError
 * normalizeSemanticVersion('1.x.0')  // throws InvalidVersionError
 * ```
 */
export function normalizeSemanticVersion(version: string): string {
  if (!version || typeof version !== 'string') {
    throw new InvalidVersionError(version, 'Version must be a non-empty string');
  }

  // Remove 'v' prefix if present
  const normalized = version.replace(/^v/i, '');
  const trimmed = normalized.trim();

  if (!trimmed) {
    throw new InvalidVersionError(version, 'Version is empty after removing prefix');
  }

  // Split into parts
  const parts = trimmed.split('.');

  // Validate and pad to 3 parts
  if (parts.length > 3) {
    throw new InvalidVersionError(
      version,
      `Version has too many parts (${parts.length}). Expected 1-3 parts.`
    );
  }

  // Validate each part is numeric
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || !/^\d+$/.test(part)) {
      throw new InvalidVersionError(
        version,
        `Version part "${part ?? '(empty)'}" is not a valid number`
      );
    }
  }

  // Pad to 3 parts (major.minor.patch)
  const major = parts[0] ?? '0';
  const minor = parts[1] ?? '0';
  const patch = parts[2] ?? '0';

  return `${major}.${minor}.${patch}`;
}
