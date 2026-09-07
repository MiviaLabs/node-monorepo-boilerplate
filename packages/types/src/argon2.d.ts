/**
 * Type definitions for argon2 package
 *
 * Argon2 is a password hashing algorithm designed for secure password storage.
 * It won the Password Hashing Competition in 2015.
 */
declare module 'argon2' {
  /**
   * Configuration options for Argon2 hashing
   */
  export interface Argon2Options {
    /** Custom salt (if not provided, a random one is generated) */
    salt?: string | Buffer;
    /** Length of the generated salt in bytes */
    saltLength?: number;
    /** Memory cost parameter in KiB */
    memoryCost?: number;
    /** Time cost (number of iterations) */
    timeCost?: number;
    /** Degree of parallelism */
    parallelism?: number;
    /** Desired hash length in bytes */
    hashLength?: number;
    /** Argon2 version to use */
    version?: number;
    /** If true, returns raw hash bytes instead of encoded string */
    raw?: boolean;
    /** Additional data to include in hash */
    associatedData?: Buffer | null;
  }

  /**
   * Hash a password using Argon2
   *
   * @param plain - Plain text password to hash
   * @param options - Argon2 configuration options
   * @returns Promise resolving to the hashed password string
   * @throws Error if options are invalid (e.g., memoryCost too low) or memory allocation fails
   * @example
   * ```typescript
   * import argon2 from 'argon2';
   *
   * const hash = await argon2.hash('password123');
   * // Returns: '$argon2id$v=19$m=65536,t=3,p=4$...'
   *
   * // With custom options
   * const hashWithOptions = await argon2.hash('password123', {
   *   memoryCost: 2 ** 16,
   *   timeCost: 3,
   *   parallelism: 4
   * });
   * ```
   */
  export function hash(plain: string | Buffer, options?: Argon2Options): Promise<string>;

  /**
   * Verify a password against an Argon2 hash
   *
   * @param hash - Argon2 hash to verify against
   * @param plain - Plain text password to verify
   * @returns Promise resolving to true if password matches, false otherwise
   * @throws Error if hash string is malformed or uses an unsupported Argon2 variant
   * @example
   * ```typescript
   * import argon2 from 'argon2';
   *
   * const hash = '$argon2id$v=19$m=65536,t=3,p=4$...';
   * const isValid = await argon2.verify(hash, 'password123');
   * // Returns: true if password matches, false otherwise
   * ```
   */
  export function verify(hash: string | Buffer, plain: string | Buffer): Promise<boolean>;

  /**
   * Generate a cryptographically secure salt
   *
   * @param length - Length of salt in bytes (default: 16)
   * @returns Promise resolving to the generated salt buffer
   * @throws Error if length is invalid (e.g., negative or too large) or RNG fails
   * @example
   * ```typescript
   * import argon2 from 'argon2';
   *
   * const salt = await argon2.generateSalt();
   * // Returns: Buffer of 16 random bytes
   *
   * const customSalt = await argon2.generateSalt(32);
   * // Returns: Buffer of 32 random bytes
   * ```
   */
  export function generateSalt(length?: number): Promise<Buffer>;
}
