/**
 * Observability Patterns
 *
 * Collection of patterns for logging, correlation, and PII redaction.
 *
 * @example
 * ```typescript
 * import {
 *   redactObject,
 *   generateCorrelationId,
 *   createSafeLogContext
 * } from '@package/observability/patterns';
 * ```
 */

// PII Redaction
export { redactAuditFields } from './audit-redaction.pattern';

// PII Redaction
export {
  redactObject,
  redactHeaders,
  redactArray,
  partialRedactEmail,
  partialRedactCreditCard,
  partialRedactPhone,
  createSafeLogContext,
  redactJsonString,
  maskValue,
  isSensitiveField,
  isSensitiveHeader,
  REDACTED,
  PARTIAL_REDACTED
} from './pii-redaction.pattern';

// Correlation ID
export {
  generateCorrelationId,
  isValidCorrelationId,
  extractCorrelationId,
  getOrCreateCorrelationId,
  createCorrelationHeaders,
  withCorrelation,
  createSpanContext,
  extractTraceParent,
  createTraceParent,
  addCorrelationToContext,
  getCorrelationLogMessage,
  formatCorrelationInfo,
  DEFAULT_CORRELATION_HEADER
} from './correlation-id.pattern';

// Types
export type { IRedactStringOptions } from './pii-redaction.pattern';
export type { ISpanContextOptions } from './correlation-id.pattern';
