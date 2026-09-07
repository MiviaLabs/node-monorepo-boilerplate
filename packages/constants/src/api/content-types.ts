/**
 * Content type constants (MIME types)
 *
 * MIME types used in HTTP Content-Type and Accept headers to indicate
 * the media type of request/response bodies. These constants provide
 * type-safe alternatives to string literals in content negotiation.
 *
 * Content-Type header usage:
 * - Request: Indicates format of request body (POST, PUT, PATCH)
 * - Response: Indicates format of response body
 *
 * Accept header usage:
 * - Request: Indicates acceptable response formats (content negotiation)
 *
 * Common scenarios in this codebase:
 * - API requests/responses: `application/json`
 * - File uploads: `multipart/form-data`
 * - Form submissions: `application/x-www-form-urlencoded`
 * - Webhook payloads: `application/json` or `application/xml`
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type} - Content-Type header
 * @see {@link https://www.iana.org/assignments/media-types/media-types.xhtml} - IANA Media Types Registry
 *
 * @example
 * ```typescript
 * import { CONTENT_TYPES } from '@package/constants/api';
 *
 * // Setting response content type
 * res.setHeader('Content-Type', CONTENT_TYPES.JSON);
 *
 * // Checking request content type
 * if (req.headers['content-type'] === CONTENT_TYPES.JSON) {
 *   const body = JSON.parse(req.body);
 * }
 *
 * // In fetch requests
 * fetch('/api/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': CONTENT_TYPES.JSON },
 *   body: JSON.stringify(data)
 * });
 * ```
 */

export const CONTENT_TYPES = {
  // ──────────────────────────────────────────────────────────────────────────
  // Application types
  // Structured data formats for API communication
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * application/json
   *
   * Standard JSON format. The primary content type for REST API
   * requests and responses in this codebase.
   *
   * Use for: API request/response bodies, webhook payloads, configuration
   */
  JSON: 'application/json',

  /**
   * application/vnd.api+json
   *
   * JSON:API specification format. A standardized JSON format with
   * conventions for resource relationships, pagination, and filtering.
   *
   * Use for: APIs following JSON:API specification (rarely used in this codebase)
   *
   * @see {@link https://jsonapi.org/} - JSON:API Specification
   */
  JSON_API: 'application/vnd.api+json',

  /**
   * application/xml
   *
   * XML format for structured data. Used for legacy integrations,
   * SOAP services, and some third-party APIs.
   *
   * Use for: Legacy system integration, some payment gateways, SAML responses
   */
  XML: 'application/xml',

  // ──────────────────────────────────────────────────────────────────────────
  // Text types
  // Human-readable text formats
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * text/plain
   *
   * Plain text without formatting. Character encoding should be specified
   * (defaults to UTF-8).
   *
   * Use for: Simple text responses, log output, raw data export
   */
  TEXT: 'text/plain',

  /**
   * text/html
   *
   * HTML document format. Used for server-rendered pages and
   * email templates.
   *
   * Use for: SSR pages, email HTML content, error pages
   */
  HTML: 'text/html',

  // ──────────────────────────────────────────────────────────────────────────
  // Form submission types
  // Content types for HTML form data
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * application/x-www-form-urlencoded
   *
   * URL-encoded form data. Keys and values are encoded in key-value tuples
   * separated by '&', with '=' between key and value. Spaces become '+'.
   *
   * Use for: Simple form submissions, OAuth token requests, webhooks from
   * services that send form-encoded data (e.g., Stripe webhooks)
   *
   * Note: Not suitable for binary data or large payloads.
   */
  FORM_URLENCODED: 'application/x-www-form-urlencoded',

  /**
   * multipart/form-data
   *
   * Multi-part encoded form data. Each part is separated by a boundary
   * string. Supports binary data and multiple files.
   *
   * Use for: File uploads, mixed content (files + form fields), large payloads
   *
   * Note: Boundary string is auto-generated; do not set Content-Type header
   * manually when using FormData API - let the browser set it.
   */
  FORM_DATA: 'multipart/form-data'
} as const;
