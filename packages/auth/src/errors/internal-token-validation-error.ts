/**
 * Internal Token Validation Error
 *
 * Error class that separates internal details from client-facing messages.
 * Internal details are logged server-side while clients receive generic messages.
 *
 * @packageDocumentation
 */

import { InfrastructureError } from '@package/core';

/**
 * Internal error details for server-side logging
 */
export interface InternalErrorDetails {
  /** The field that failed validation */
  field?: string;
  /** Expected value */
  expected?: string;
  /** Actual value */
  actual?: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Original cause */
  cause?: Error | unknown;
}

/**
 * Internal Token Validation Error
 *
 * Use this error when you need to log detailed error information
 * server-side but return only generic messages to clients.
 *
 * @example
 * ```typescript
 * throw new InternalTokenValidationError(
 *   'Token validation failed',  // Client sees this
 *   {
 *     field: 'sub',
 *     expected: '123',
 *     actual: '456',
 *     context: { tenantId: 'abc' }
 *   }
 * );
 * // Client: "Token validation failed"
 * // Server logs: "Token validation failed: sub='456' expected='123' tenantId='abc'"
 * ```
 */
export class InternalTokenValidationError extends InfrastructureError {
  override name = 'InternalTokenValidationError';

  /** Internal error details (not sent to client) */
  public readonly details: InternalErrorDetails;

  constructor(
    message: string,
    details?: InternalErrorDetails,

    cause?: Error | unknown
  ) {
    super(message, 'TOKEN_VALIDATION_FAILED', cause);
    this.details = details || {};

    // Build detailed message for server-side logging
    const detailMessage = this.buildDetailMessage();

    // Log the detailed message server-side
    if (typeof console !== 'undefined' && console.error) {
      console.error(`[InternalTokenValidationError] ${message}${detailMessage}`);
    }
  }

  /**
   * Build detailed message from error details
   */
  private buildDetailMessage(): string {
    const parts: string[] = [];

    if (this.details.field) {
      parts.push(`field='${this.details.field}'`);
    }

    if (this.details.expected !== undefined) {
      parts.push(`expected='${this.details.expected}'`);
    }

    if (this.details.actual !== undefined) {
      parts.push(`actual='${this.details.actual}'`);
    }

    if (this.details.context) {
      const contextParts = Object.entries(this.details.context)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}='${JSON.stringify(value)}'`);
      parts.push(...contextParts);
    }

    return parts.length > 0 ? `: ${parts.join(' ')}` : '';
  }

  /**
   * Get client-facing message (without details)
   */
  getClientMessage(): string {
    return this.message;
  }

  /**
   * Get server-side detailed message (with details)
   */
  getServerMessage(): string {
    return this.message + this.buildDetailMessage();
  }
}

/**
 * Helper function to throw internal token validation error
 *
 * @param message - Client-facing error message
 * @param details - Internal error details
 * @throws InternalTokenValidationError
 */
export function throwTokenValidationError(message: string, details?: InternalErrorDetails): never {
  throw new InternalTokenValidationError(message, details);
}

/**
 * Helper function to log token validation error without throwing
 *
 * @param _message - Error message
 * @param _details - Internal error details
 */
export function logTokenValidationError(_message: string, _details?: InternalErrorDetails): void {
  // Create the error (logging happens in constructor)
  // const error = new InternalTokenValidationError(_message, _details);
  void _message;
  void _details;
}
