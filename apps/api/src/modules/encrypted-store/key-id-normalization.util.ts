/**
 * Normalize KMS key identifier variants into a stable, version-preserving format.
 *
 * @param keyId - The key identifier to normalize (can be full resource path or local ID)
 * @returns Normalized key identifier in format `<key>` or `<key>/cryptoKeyVersions/<version>`
 *
 * @example
 * // Full resource key version
 * normalizeEncryptedStoreKeyId('projects/.../cryptoKeys/my-key/cryptoKeyVersions/1')
 * // Returns: 'my-key/cryptoKeyVersions/1'
 *
 * @example
 * // Full resource key
 * normalizeEncryptedStoreKeyId('projects/.../cryptoKeys/my-key')
 * // Returns: 'my-key'
 *
 * @example
 * // Already normalized/local ID
 * normalizeEncryptedStoreKeyId('my-key')
 * // Returns: 'my-key'
 */
export function normalizeEncryptedStoreKeyId(keyId: string): string {
  const trimmed = keyId.trim();

  const fullVersionMatch = trimmed.match(
    /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/([^/]+)\/cryptoKeyVersions\/([^/]+)$/
  );
  if (fullVersionMatch?.[1] && fullVersionMatch[2]) {
    return `${fullVersionMatch[1]}/cryptoKeyVersions/${fullVersionMatch[2]}`;
  }

  const fullKeyMatch = trimmed.match(
    /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/([^/]+)$/
  );
  if (fullKeyMatch?.[1]) {
    return fullKeyMatch[1];
  }

  return trimmed;
}

/**
 * Extract the base key ID without version suffix.
 *
 * Used for EnvVarProvider which doesn't support versioned keys.
 * GCP KMS can decrypt with any version if the base key ID matches.
 *
 * @param keyId - The key identifier (may include version suffix)
 * @returns Base key ID without version
 *
 * @example
 * // Versioned key
 * extractBaseKeyId('my-key/cryptoKeyVersions/1')
 * // Returns: 'my-key'
 *
 * @example
 * // Unversioned key
 * extractBaseKeyId('my-key')
 * // Returns: 'my-key'
 */
export function extractBaseKeyId(keyId: string): string {
  const normalized = normalizeEncryptedStoreKeyId(keyId);
  // Strip version suffix if present: 'my-key/cryptoKeyVersions/1' -> 'my-key'
  const versionIndex = normalized.indexOf('/cryptoKeyVersions/');
  if (versionIndex !== -1) {
    return normalized.slice(0, versionIndex);
  }
  return normalized;
}
