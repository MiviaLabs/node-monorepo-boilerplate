/**
 * Sanitize error messages for logging and DLQ
 *
 * Removes stack traces, file paths, line numbers, and limits length
 * to prevent exposing sensitive information in logs and dead-letter queues.
 *
 * Configurable via KAFKA_ERROR_MAX_LENGTH env var (default: 2000 chars)
 *
 * @example
 * ```typescript
 * import { sanitizeError } from './utils/error-sanitizer';
 *
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 *   const sanitized = sanitizeError(errorMessage);
 *   logger.error(`Operation failed: ${sanitized}`);
 * }
 * ```
 *
 * @param error - The error message to sanitize
 * @returns The sanitized error message
 */
export function sanitizeError(error: string): string {
  // Remove file paths and line numbers from stack traces
  let sanitized = error.replace(/at [^(]+\(.*:[0-9]+:[0-9]+\)/g, 'at [stack frame removed]');
  // Remove full stack trace (keep only first line)
  const firstLine = sanitized.split('\n')[0];
  if (firstLine !== undefined) {
    sanitized = firstLine;
  }
  // Limit length with configurable limit and truncation suffix
  const maxLength = Number.parseInt(process.env['KAFKA_ERROR_MAX_LENGTH'] ?? '2000', 10);
  if (sanitized.length > maxLength) {
    return sanitized.slice(0, maxLength) + '... (truncated)';
  }
  return sanitized;
}
