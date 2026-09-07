/**
 * JWT Secret Validator
 *
 * Validates JWT secret keys for strength and security.
 * Prevents use of weak, common, or easily guessable secrets.
 *
 * @packageDocumentation
 */

import { InvalidAuthProviderConfigError } from '../errors';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the secret is valid */
  valid: boolean;
  /** Array of error messages (empty if valid) */
  errors: string[];
}

/**
 * List of common/weak secrets that should never be used
 */
const COMMON_SECRETS = [
  'secret',
  'password',
  'jwt-secret',
  'jwtsecret',
  'change-me',
  'changeme',
  'test-secret',
  'test',
  'demo',
  'example',
  'default',
  'admin',
  '123456',
  'password123',
  'secret123'
] as const;

/**
 * Minimum requirements for JWT secrets
 */
const MIN_LENGTH = 32;
const MIN_ENTROPY_SCORE = 3; // Number of character type requirements to pass

/**
 * JWT Secret Validator
 *
 * Validates JWT signing secrets for:
 * - Minimum length (32 characters)
 * - Character variety (uppercase, lowercase, digits, special)
 * - Absence of common/weak secrets
 * - Sufficient entropy
 */
export class JwtSecretValidator {
  /**
   * Validate a JWT secret key
   *
   * @param secret - The secret to validate
   * @returns Validation result with errors if invalid
   */
  static validate(secret: string): ValidationResult {
    const errors: string[] = [];

    // Check length
    if (secret.length < MIN_LENGTH) {
      errors.push(
        `JWT_SECRET must be at least ${MIN_LENGTH} characters (current: ${secret.length})`
      );
    }

    // Check character variety (entropy)
    const hasUpperCase = /[A-Z]/.test(secret);
    const hasLowerCase = /[a-z]/.test(secret);
    const hasDigits = /\d/.test(secret);
    const hasSpecial = /[^A-Za-z0-9]/.test(secret);

    const entropyScore = [hasUpperCase, hasLowerCase, hasDigits, hasSpecial].filter(Boolean).length;

    if (entropyScore < MIN_ENTROPY_SCORE) {
      errors.push(
        `JWT_SECRET must contain at least ${MIN_ENTROPY_SCORE} of the following: uppercase letters, lowercase letters, digits, special characters`
      );
    }

    // Check for common/weak secrets
    const lowerSecret = secret.toLowerCase();
    for (const commonSecret of COMMON_SECRETS) {
      if (lowerSecret.includes(commonSecret)) {
        errors.push(
          `JWT_SECRET is too common. Use a randomly generated secret with at least ${MIN_LENGTH} characters`
        );
        break; // Only report this error once
      }
    }

    // Check for repeating patterns (e.g., "aaaa", "1111")
    if (/(.)\1{3,}/.test(secret)) {
      errors.push('JWT_SECRET contains repeating patterns. Use a randomly generated secret.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate and throw if invalid
   *
   * @param secret - The secret to validate
   * @throws InvalidAuthProviderConfigError if secret is invalid
   */
  static validateOrThrow(secret: string): void {
    const result = this.validate(secret);

    if (!result.valid) {
      throw new InvalidAuthProviderConfigError(`Invalid JWT_SECRET: ${result.errors.join(', ')}`);
    }
  }

  /**
   * Check if a secret meets minimum requirements (without throwing)
   *
   * @param secret - The secret to check
   * @returns true if secret meets minimum requirements
   */
  static isValid(secret: string): boolean {
    return this.validate(secret).valid;
  }

  /**
   * Generate a cryptographically secure random secret
   *
   * @param length - Length of the secret to generate (default: 64)
   * @returns A secure random secret
   */
  static generateSecureSecret(length: number = 64): string {
    /* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe: array access is within bounds, modulo ensures charIndex is valid */
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);

    let result = '';
    for (let i = 0; i < length; i++) {
      const charIndex = randomValues[i]! % chars.length;
      // The modulo operation ensures charIndex is always valid
      result += chars[charIndex]!;
    }

    return result;
  }
}

/**
 * Polyfill for crypto in Node.js environment
 */
declare const crypto: {
  getRandomValues: (array: Uint8Array) => void;
};
