/**
 * URL validation schemas
 *
 * Provides Zod schemas for validating URL strings with various
 * protocol requirements (any protocol, HTTPS only, HTTP/HTTPS).
 *
 * @module url.schema
 */

import { z } from 'zod';

/**
 * URL schema for any valid URL.
 *
 * Validates that a string is a properly formatted URL.
 * Uses Zod's built-in URL validation which follows the WHATWG URL Standard.
 *
 * Validation rules:
 * - Must be a string type
 * - Must be a valid URL per WHATWG URL Standard
 * - Any protocol is accepted (http, https, ftp, mailto, etc.)
 *
 * @example
 * // Valid inputs
 * urlSchema.parse('https://example.com');           // Returns the URL
 * urlSchema.parse('http://localhost:3000');         // Returns the URL
 * urlSchema.parse('https://sub.domain.com/path');   // Returns the URL
 * urlSchema.parse('ftp://files.example.com');       // Returns the URL
 * urlSchema.parse('mailto:user@example.com');       // Returns the URL
 * urlSchema.parse('https://example.com?q=search');  // Returns the URL
 *
 * @example
 * // Invalid inputs - throws ZodError
 * urlSchema.parse('');                              // Error: 'Invalid URL format'
 * urlSchema.parse('not-a-url');                     // Error: 'Invalid URL format'
 * urlSchema.parse('example.com');                   // Error: 'Invalid URL format' (no protocol)
 * urlSchema.parse('://missing-protocol.com');       // Error: 'Invalid URL format'
 * urlSchema.parse('http://');                       // Error: 'Invalid URL format' (no host)
 *
 * @returns A Zod schema that validates URL format strings
 */
export const urlSchema = z.string().url('Invalid URL format');

/** Inferred type for {@link urlSchema} schema */
export type UrlSchemaType = z.infer<typeof urlSchema>;

/**
 * HTTPS-only URL schema for secure URLs.
 *
 * Validates that a string is a well-formed URL AND uses the HTTPS protocol.
 * Use this for URLs that must be secure (e.g., API endpoints, webhooks, OAuth callbacks).
 *
 * Validation rules:
 * - Must be a string type
 * - Must be a valid URL per WHATWG URL Standard
 * - Must use HTTPS protocol (case-insensitive)
 *
 * @example
 * // Valid inputs
 * httpsUrlSchema.parse('https://example.com');           // Returns the URL
 * httpsUrlSchema.parse('https://api.example.com/v1');    // Returns the URL
 * httpsUrlSchema.parse('https://localhost:3000');        // Returns the URL
 * httpsUrlSchema.parse('https://sub.domain.com/path?q=1'); // Returns the URL
 *
 * @example
 * // Invalid inputs - throws ZodError
 * httpsUrlSchema.parse('');                              // Error: 'Invalid URL format'
 * httpsUrlSchema.parse('not-a-url');                     // Error: 'Invalid URL format'
 * httpsUrlSchema.parse('https://not a valid url');       // Error: 'Invalid URL format'
 * httpsUrlSchema.parse('http://example.com');            // Error: 'URL must use HTTPS protocol'
 * httpsUrlSchema.parse('ftp://files.example.com');       // Error: 'URL must use HTTPS protocol'
 * httpsUrlSchema.parse('example.com');                   // Error: 'Invalid URL format'
 *
 * @returns A Zod schema that validates HTTPS URL strings
 */
export const httpsUrlSchema = urlSchema.refine((url) => url.toLowerCase().startsWith('https://'), {
  message: 'URL must use HTTPS protocol'
});

/** Inferred type for {@link httpsUrlSchema} schema */
export type HttpsUrlSchemaType = z.infer<typeof httpsUrlSchema>;

/**
 * HTTP or HTTPS URL schema for web URLs.
 *
 * Validates that a string is a well-formed URL AND uses HTTP or HTTPS protocol.
 * Use this for general web URLs where both protocols are acceptable.
 *
 * Validation rules:
 * - Must be a string type
 * - Must be a valid URL per WHATWG URL Standard
 * - Must use HTTP or HTTPS protocol (case-insensitive)
 *
 * @example
 * // Valid inputs
 * httpUrlSchema.parse('https://example.com');            // Returns the URL
 * httpUrlSchema.parse('http://example.com');             // Returns the URL
 * httpUrlSchema.parse('https://api.example.com/v1');     // Returns the URL
 * httpUrlSchema.parse('http://localhost:3000');          // Returns the URL
 * httpUrlSchema.parse('https://example.com/path?q=test'); // Returns the URL
 *
 * @example
 * // Invalid inputs - throws ZodError
 * httpUrlSchema.parse('');                               // Error: 'Invalid URL format'
 * httpUrlSchema.parse('not-a-url');                      // Error: 'Invalid URL format'
 * httpUrlSchema.parse('http://not a valid url');         // Error: 'Invalid URL format'
 * httpUrlSchema.parse('ftp://files.example.com');        // Error: 'URL must use HTTP or HTTPS protocol'
 * httpUrlSchema.parse('mailto:user@example.com');        // Error: 'URL must use HTTP or HTTPS protocol'
 * httpUrlSchema.parse('example.com');                    // Error: 'Invalid URL format'
 * httpUrlSchema.parse('file:///local/path');             // Error: 'URL must use HTTP or HTTPS protocol'
 *
 * @returns A Zod schema that validates HTTP/HTTPS URL strings
 */
export const httpUrlSchema = urlSchema.refine(
  (url) => {
    const lower = url.toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  },
  { message: 'URL must use HTTP or HTTPS protocol' }
);

/** Inferred type for {@link httpUrlSchema} schema */
export type HttpUrlSchemaType = z.infer<typeof httpUrlSchema>;
