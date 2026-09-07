/**
 * @fileoverview Google Cloud Pub/Sub type definitions and error utilities.
 *
 * This module provides type-safe interfaces that align with the GCP Pub/Sub SDK,
 * along with utility functions for classifying GCP errors. These utilities enable
 * precise error handling and mapping to custom error types.
 *
 * @module @package/pubsub/providers/gcp-types
 *
 * @example Error classification
 * ```typescript
 * import { isNotFoundError, isPermissionDeniedError } from '@package/pubsub';
 *
 * try {
 *   await gcpOperation();
 * } catch (error) {
 *   if (isNotFoundError(error)) {
 *     // Resource doesn't exist - create it
 *   } else if (isPermissionDeniedError(error)) {
 *     // Auth issue - log and fail
 *   }
 * }
 * ```
 */

import { HTTP_STATUS } from '@package/constants';

/**
 * gRPC status codes used by GCP Pub/Sub API.
 *
 * These codes follow the standard gRPC status code definitions and are
 * returned by the GCP Pub/Sub SDK for API operations. Use these codes
 * to implement precise error handling.
 *
 * @see https://cloud.google.com/pubsub/docs/reference/error-codes
 * @see https://grpc.github.io/grpc/core/md_doc_statuscodes.html
 *
 * @example Checking for specific error codes
 * ```typescript
 * import { GcpErrorCode, isGcpError } from '@package/pubsub';
 *
 * if (isGcpError(error) && error.code === GcpErrorCode.NOT_FOUND) {
 *   console.log('Resource not found');
 * }
 * ```
 */
export const GcpErrorCode = {
  /** Operation completed successfully */
  OK: 0,
  /** Operation was cancelled by the caller */
  CANCELLED: 1,
  /** Unknown error occurred */
  UNKNOWN: 2,
  /** Invalid argument provided to the operation */
  INVALID_ARGUMENT: 3,
  /** Operation deadline exceeded before completion */
  DEADLINE_EXCEEDED: 4,
  /** Requested resource was not found */
  NOT_FOUND: 5,
  /** Resource already exists (conflict) */
  ALREADY_EXISTS: 6,
  /** Caller lacks required permissions */
  PERMISSION_DENIED: 7,
  /** Resource quota exhausted (rate limiting) */
  RESOURCE_EXHAUSTED: 8,
  /** Operation rejected due to system state */
  FAILED_PRECONDITION: 9,
  /** Operation aborted due to concurrency issue */
  ABORTED: 10,
  /** Operation argument is outside valid range */
  OUT_OF_RANGE: 11,
  /** Operation is not implemented or supported */
  UNIMPLEMENTED: 12,
  /** Internal server error */
  INTERNAL: 13,
  /** Service temporarily unavailable (retryable) */
  UNAVAILABLE: 14,
  /** Unrecoverable data loss or corruption */
  DATA_LOSS: 15,
  /** Caller is not authenticated */
  UNAUTHENTICATED: 16
} as const;

/**
 * Type representing any valid GCP gRPC error code value.
 */
export type GcpErrorCode = (typeof GcpErrorCode)[keyof typeof GcpErrorCode];

/**
 * HTTP status codes used by GCP REST API errors.
 *
 * Re-exported from `@package/constants` for consistency across the codebase.
 * Some GCP errors return HTTP status codes instead of gRPC codes,
 * particularly when using REST endpoints directly.
 *
 * @example Checking HTTP status codes
 * ```typescript
 * import { HttpStatusCode, isGcpError } from '@package/pubsub';
 *
 * if (isGcpError(error) && error.code === HttpStatusCode.NOT_FOUND) {
 *   console.log('HTTP 404: Resource not found');
 * }
 * ```
 *
 * @deprecated Use `HTTP_STATUS` from `@package/constants` directly for new code.
 * This alias is maintained for backward compatibility.
 */
export const HttpStatusCode = HTTP_STATUS;

/**
 * Type representing any valid HTTP status code value.
 *
 * @deprecated Use `HTTP_STATUS` type from `@package/constants` directly.
 */
export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

/**
 * Metadata associated with a GCP Pub/Sub topic.
 *
 * This interface represents the metadata fields returned by the GCP SDK
 * when retrieving topic information.
 *
 * @internal
 */
export interface IGcpTopicMetadata {
  /** Human-readable topic description */
  description?: string;
  /** Regional storage configuration for messages */
  messageStoragePolicy?: {
    /** GCP regions where messages can be stored */
    allowedPersistenceRegions?: string[];
  };
  /** Cloud KMS key for message encryption */
  kmsKeyName?: string;
  /** Key-value labels for categorization */
  labels?: Record<string, string>;
}

/**
 * @deprecated Use {@link IGcpTopicMetadata} instead. This alias is maintained for backward compatibility.
 */
export type GcpTopicMetadata = IGcpTopicMetadata;

/**
 * Metadata associated with a GCP Pub/Sub subscription.
 *
 * This interface represents the metadata fields returned by the GCP SDK
 * when retrieving subscription information.
 *
 * @internal
 */
export interface IGcpSubscriptionMetadata {
  /** Time limit for message acknowledgment in seconds */
  ackDeadlineSeconds?: number;
  /** Duration to retain unacknowledged messages in seconds */
  messageRetentionSeconds?: number;
  /** Whether to retain messages after acknowledgment */
  retainAckedMessages?: boolean;
  /** Whether message ordering is enabled */
  enableMessageOrdering?: boolean;
  /** Push delivery configuration */
  pushConfig?: {
    /** HTTPS endpoint for push delivery */
    pushEndpoint?: string;
  };
  /** Dead Letter Queue configuration */
  deadLetterPolicy?: {
    /** Full path to the DLQ topic */
    deadLetterTopic: string;
    /** Maximum delivery attempts before routing to DLQ */
    maxDeliveryAttempts: number;
  };
}

/**
 * @deprecated Use {@link IGcpSubscriptionMetadata} instead. This alias is maintained for backward compatibility.
 */
export type GcpSubscriptionMetadata = IGcpSubscriptionMetadata;

/**
 * Options passed to GCP SDK when creating a topic.
 *
 * @internal
 */
export interface IGcpTopicCreateOptions {
  /** GCP-specific configuration options */
  gcpConfig?: Record<string, unknown>;
}

/**
 * @deprecated Use {@link IGcpTopicCreateOptions} instead. This alias is maintained for backward compatibility.
 */
export type GcpTopicCreateOptions = IGcpTopicCreateOptions;

/**
 * Options passed to GCP SDK when creating a subscription.
 *
 * Extends standard options with index signature for additional
 * GCP-specific options.
 *
 * @internal
 */
export interface IGcpSubscriptionCreateOptions {
  /** Dead Letter Queue configuration */
  deadLetterPolicy?: {
    /** Full path to the DLQ topic */
    deadLetterTopic: string;
    /** Maximum delivery attempts before routing to DLQ */
    maxDeliveryAttempts: number;
  };
  /** Additional GCP-specific options */
  [key: string]: unknown;
}

/**
 * @deprecated Use {@link IGcpSubscriptionCreateOptions} instead. This alias is maintained for backward compatibility.
 */
export type GcpSubscriptionCreateOptions = IGcpSubscriptionCreateOptions;

/**
 * Options passed to GCP SDK when publishing a message.
 *
 * @internal
 */
export interface IGcpPublishOptions {
  /** Key-value attributes attached to the message */
  attributes?: Record<string, string>;
  /** Key for message ordering within the topic */
  orderingKey?: string;
}

/**
 * @deprecated Use {@link IGcpPublishOptions} instead. This alias is maintained for backward compatibility.
 */
export type GcpPublishOptions = IGcpPublishOptions;

/**
 * Message object received from GCP Pub/Sub subscription.
 *
 * This interface represents the raw message object returned by the
 * GCP SDK's streaming pull. It includes methods for acknowledgment
 * and deadline management.
 *
 * **Note:** The GCP SDK methods (`ack`, `nack`, `modAck`) are synchronous
 * and return `void`. They fire-and-forget the acknowledgment to the server.
 * For response-based acknowledgment (exactly-once delivery), use the
 * `*WithResponse()` variants which return `Promise<AckResponse>`.
 *
 * @internal
 */
export interface IGcpPubSubMessage {
  /** Unique message identifier */
  id: string;
  /** Message payload as a Buffer */
  data: Buffer;
  /** Key-value attributes attached to the message */
  attributes?: Record<string, string>;
  /** Ordering key if message ordering is enabled */
  orderingKey?: string;
  /** Timestamp when the message was published */
  publishTime?: Date;
  /** Number of delivery attempts (for DLQ tracking) */
  deliveryAttempt?: number;
  /** Acknowledges successful message processing (synchronous, fire-and-forget) */
  ack: () => void;
  /** Negatively acknowledges for immediate redelivery (synchronous, fire-and-forget) */
  nack: () => void;
  /**
   * Modifies the acknowledgment deadline (synchronous, fire-and-forget).
   * @param deadline - New deadline in seconds
   */
  modAck: (deadline: number) => void;
}

/**
 * @deprecated Use {@link IGcpPubSubMessage} instead. This alias is maintained for backward compatibility.
 */
export type GcpPubSubMessage = IGcpPubSubMessage;

/**
 * Adapter function to convert GCP SDK's sync `modAck` to async `modifyAckDeadline`.
 *
 * The public `IReceivedMessage` interface uses async signatures for consistency
 * with the wrapped ack/nack methods. This adapter bridges the GCP SDK's sync
 * `modAck` to the async `modifyAckDeadline` expected by consumers.
 *
 * @param message - The GCP Pub/Sub message object
 * @returns Async wrapper function compatible with IReceivedMessage.modifyAckDeadline
 * @internal
 */
export function createAsyncModifyAckDeadline(
  message: IGcpPubSubMessage
): (deadlineSeconds: number) => Promise<void> {
  return async (deadlineSeconds: number): Promise<void> => {
    message.modAck(deadlineSeconds);
  };
}

/**
 * Error object with a numeric code property.
 *
 * GCP SDK errors typically include a `code` property containing
 * either a gRPC status code or HTTP status code.
 *
 * @example Type guard usage
 * ```typescript
 * if (isGcpError(error)) {
 *   console.log('GCP error code:', error.code);
 * }
 * ```
 */
export interface IGcpError extends Error {
  /** Numeric error code (gRPC or HTTP status) */
  code?: number;
}

/**
 * @deprecated Use {@link IGcpError} instead. This alias is maintained for backward compatibility.
 */
export type GcpError = IGcpError;

/**
 * Type guard to check if an error is a GCP error with a code property.
 *
 * GCP SDK errors include a numeric `code` property that identifies the
 * specific error condition. Use this guard before accessing the code.
 *
 * @param error - Unknown error to check
 * @returns True if error is a IGcpError with a numeric code
 *
 * @example Using the type guard
 * ```typescript
 * try {
 *   await client.topic('test').get();
 * } catch (error) {
 *   if (isGcpError(error)) {
 *     console.log('GCP error code:', error.code);
 *     console.log('Error message:', error.message);
 *   }
 * }
 * ```
 */
export function isGcpError(error: unknown): error is IGcpError {
  return error instanceof Error && 'code' in error && typeof (error as IGcpError).code === 'number';
}

/**
 * Checks if an error has a specific gRPC error code.
 *
 * Combines the {@link isGcpError} type guard with a code comparison
 * for concise error code checking.
 *
 * @param error - Unknown error to check
 * @param code - Expected gRPC error code from {@link GcpErrorCode}
 * @returns True if error is a GcpError with the specified code
 *
 * @example Checking for specific error code
 * ```typescript
 * if (isGcpErrorCode(error, GcpErrorCode.DEADLINE_EXCEEDED)) {
 *   console.log('Operation timed out, retrying...');
 * }
 * ```
 */
export function isGcpErrorCode(error: unknown, code: GcpErrorCode): boolean {
  return isGcpError(error) && error.code === code;
}

/**
 * Checks if an error has a specific HTTP status code.
 *
 * Some GCP operations return HTTP status codes instead of gRPC codes.
 * Use this function to check for HTTP-style error codes.
 *
 * @param error - Unknown error to check
 * @param code - Expected HTTP status code from {@link HttpStatusCode}
 * @returns True if error is a GcpError with the specified HTTP code
 *
 * @example Checking HTTP status codes
 * ```typescript
 * if (isHttpStatusCode(error, HttpStatusCode.NOT_FOUND)) {
 *   console.log('HTTP 404: Resource not found');
 * }
 * ```
 */
export function isHttpStatusCode(error: unknown, code: HttpStatusCode): boolean {
  return isGcpError(error) && error.code === code;
}

/**
 * Checks if an error indicates a "not found" condition.
 *
 * Matches both gRPC NOT_FOUND and HTTP 404 codes, as well as
 * error messages containing "not found" patterns.
 *
 * @param error - Unknown error to check
 * @returns True if the error indicates the resource was not found
 *
 * @example Handling not found errors
 * ```typescript
 * try {
 *   await provider.getTopic('my-topic');
 * } catch (error) {
 *   if (isNotFoundError(error)) {
 *     // Topic doesn't exist - create it
 *     await provider.createTopic('my-topic');
 *   }
 * }
 * ```
 */
export function isNotFoundError(error: unknown): boolean {
  if (!isGcpError(error)) {
    return false;
  }

  const hasCodeMatch =
    error.code === GcpErrorCode.NOT_FOUND || error.code === HttpStatusCode.NOT_FOUND;

  const hasMessageMatch =
    error.message.includes('NotFound') ||
    error.message.includes('Topic not found') ||
    error.message.includes('Subscription not found');

  return hasCodeMatch || hasMessageMatch;
}

/**
 * Checks if an error indicates a resource already exists.
 *
 * Matches gRPC ALREADY_EXISTS and HTTP 409 Conflict codes, as well as
 * error messages containing "already exists" patterns.
 *
 * @param error - Unknown error to check
 * @returns True if the error indicates the resource already exists
 *
 * @example Idempotent resource creation
 * ```typescript
 * try {
 *   await provider.createTopic('my-topic');
 * } catch (error) {
 *   if (isAlreadyExistsError(error)) {
 *     // Topic already exists - this is fine
 *     console.log('Using existing topic');
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export function isAlreadyExistsError(error: unknown): boolean {
  if (!isGcpError(error)) {
    return false;
  }

  const hasCodeMatch =
    error.code === GcpErrorCode.ALREADY_EXISTS || error.code === HttpStatusCode.CONFLICT;

  const hasMessageMatch =
    error.message.includes('AlreadyExists') ||
    error.message.includes('Topic already exists') ||
    error.message.includes('Subscription already exists');

  return hasCodeMatch || hasMessageMatch;
}

/**
 * Checks if an error indicates a permission or authentication failure.
 *
 * Matches gRPC PERMISSION_DENIED, HTTP 401/403 codes, and error messages
 * containing permission-related patterns. These errors are typically
 * non-retryable and require fixing IAM permissions or credentials.
 *
 * @param error - Unknown error to check
 * @returns True if the error indicates a permission or auth issue
 *
 * @example Handling permission errors
 * ```typescript
 * try {
 *   await provider.publish('secure-topic', data);
 * } catch (error) {
 *   if (isPermissionDeniedError(error)) {
 *     logger.error('Permission denied - check IAM roles');
 *     // Don't retry - this requires admin intervention
 *     throw error;
 *   }
 * }
 * ```
 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (!isGcpError(error)) {
    return false;
  }

  const hasCodeMatch =
    error.code === GcpErrorCode.PERMISSION_DENIED ||
    error.code === HttpStatusCode.FORBIDDEN ||
    error.code === HttpStatusCode.UNAUTHORIZED;

  const hasMessageMatch =
    error.message.includes('PermissionDenied') ||
    error.message.includes('permission denied') ||
    error.message.includes('Forbidden') ||
    error.message.includes('Unauthenticated') ||
    error.message.includes('authentication') ||
    error.message.includes('auth');

  return hasCodeMatch || hasMessageMatch;
}

/**
 * Checks if an error indicates a transient unavailability condition.
 *
 * Matches gRPC UNAVAILABLE and HTTP 503 codes. These errors are typically
 * retryable after a short delay as they indicate temporary service issues.
 *
 * @param error - Unknown error to check
 * @returns True if the error indicates transient unavailability
 *
 * @example Implementing retry logic
 * ```typescript
 * async function publishWithRetry(topic: string, data: unknown) {
 *   for (let attempt = 0; attempt < 3; attempt++) {
 *     try {
 *       return await provider.publish(topic, data);
 *     } catch (error) {
 *       if (isUnavailableError(error)) {
 *         // Transient error - wait and retry
 *         await sleep(1000 * Math.pow(2, attempt));
 *         continue;
 *       }
 *       throw error; // Non-retryable error
 *     }
 *   }
 * }
 * ```
 */
export function isUnavailableError(error: unknown): boolean {
  if (!isGcpError(error)) {
    return false;
  }

  return (
    error.code === GcpErrorCode.UNAVAILABLE ||
    error.code === HttpStatusCode.SERVICE_UNAVAILABLE ||
    error.message.includes('UNAVAILABLE')
  );
}

/**
 * Checks if an error indicates resource exhaustion (rate limiting).
 *
 * Matches gRPC RESOURCE_EXHAUSTED code and rate limit error messages.
 * These errors indicate quota limits have been reached and require
 * backoff before retrying.
 *
 * @param error - Unknown error to check
 * @returns True if the error indicates rate limiting
 *
 * @example Handling rate limits
 * ```typescript
 * try {
 *   await provider.publish(topic, data);
 * } catch (error) {
 *   if (isResourceExhaustedError(error)) {
 *     logger.warn('Rate limit hit, backing off');
 *     await sleep(5000); // Wait 5 seconds
 *     // Retry with exponential backoff
 *   }
 * }
 * ```
 */
export function isResourceExhaustedError(error: unknown): boolean {
  if (!isGcpError(error)) {
    return false;
  }

  return (
    error.code === GcpErrorCode.RESOURCE_EXHAUSTED ||
    error.message.includes('ResourceExhausted') ||
    error.message.includes('rate limit')
  );
}
