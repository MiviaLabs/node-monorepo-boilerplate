import { InfrastructureError } from './infrastructure-error';

/**
 * Error thrown when an infrastructure operation fails during execution.
 *
 * This is the base class for operation-related errors, covering failures
 * that occur during the execution of infrastructure operations such as
 * database transactions, file system operations, external API calls,
 * and background job processing.
 *
 * Operation errors differ from connection errors in that the connection
 * was established successfully, but the specific operation failed.
 * These errors may be retryable depending on the failure mode.
 *
 * **Error Hierarchy:**
 * ```
 * InfrastructureError
 * ├── OperationError          (operation execution failed)
 * ├── TimeoutError            (operation exceeded time limit)
 * └── MaxRetriesExceededError (all retry attempts exhausted)
 * ```
 *
 * @example Database transaction failure
 * ```typescript
 * try {
 *   await db.transaction(async (tx) => {
 *     await tx.insert(users).values(userData);
 *     await tx.insert(profiles).values(profileData);
 *   });
 * } catch (error) {
 *   throw new OperationError(
 *     'CreateUserWithProfile',
 *     'Transaction rolled back due to constraint violation',
 *     error
 *   );
 * }
 * ```
 *
 * @example File system operation failure
 * ```typescript
 * try {
 *   await fs.writeFile(path, content);
 * } catch (error) {
 *   throw new OperationError(
 *     'WriteFile',
 *     `Failed to write to ${path}: ${error.code}`,
 *     error
 *   );
 * }
 * ```
 *
 * @example External API call failure
 * ```typescript
 * const response = await fetch(apiUrl, { method: 'POST', body });
 * if (!response.ok) {
 *   throw new OperationError(
 *     'SendWebhook',
 *     `Webhook delivery failed with status ${response.status}`,
 *     new Error(await response.text())
 *   );
 * }
 * ```
 *
 * @see {@link TimeoutError} - When an operation exceeds its time limit
 * @see {@link MaxRetriesExceededError} - When all retry attempts are exhausted
 * @see {@link InfrastructureError} - Parent class providing error code and serialization
 */
export class OperationError extends InfrastructureError {
  /**
   * Creates a new OperationError instance.
   *
   * @param operation - The name of the operation that failed. Use a descriptive
   *   name that identifies the specific operation (e.g., 'CreateUser',
   *   'ProcessPayment', 'SendNotification', 'GenerateReport'). This name
   *   appears in logs and helps identify which operation failed.
   * @param message - A description of why the operation failed. Be specific
   *   about the failure mode to aid debugging (e.g., 'Unique constraint
   *   violation on email', 'Insufficient balance', 'Rate limit exceeded').
   * @param cause - Optional original error that caused the operation to fail.
   *   Preserving this enables full stack trace analysis and helps identify
   *   the root cause of the failure.
   *
   * @example
   * ```typescript
   * // Simple operation failure
   * throw new OperationError(
   *   'ValidateInput',
   *   'Input validation failed: email is required'
   * );
   * // Message: "Operation 'ValidateInput' failed: Input validation failed: email is required"
   *
   * // With cause for debugging
   * throw new OperationError(
   *   'SaveDocument',
   *   'Document storage failed',
   *   storageError
   * );
   *
   * // Constraint violation
   * throw new OperationError(
   *   'CreateAccount',
   *   'Account with this email already exists',
   *   dbError
   * );
   * ```
   */
  constructor(operation: string, message: string, cause?: Error | unknown) {
    super(`Operation '${operation}' failed: ${message}`, 'OPERATION_ERROR', cause);
    this.name = 'OperationError';
  }
}

/**
 * Error thrown when an operation exceeds its configured time limit.
 *
 * This specialized operation error indicates that an operation did not complete
 * within the allowed time and was terminated or abandoned. Timeout errors may
 * be retryable if the underlying cause is transient (e.g., temporary network
 * slowness) or may indicate a need to optimize the operation.
 *
 * Timeout errors are commonly used for:
 * - Database query timeouts
 * - External API call timeouts
 * - Job processing timeouts
 * - Lock acquisition timeouts
 *
 * @extends InfrastructureError
 *
 * @example Promise with timeout
 * ```typescript
 * async function withTimeout<T>(
 *   operation: string,
 *   promise: Promise<T>,
 *   timeoutMs: number
 * ): Promise<T> {
 *   let timeoutId: NodeJS.Timeout;
 *
 *   const timeoutPromise = new Promise<never>((_, reject) => {
 *     timeoutId = setTimeout(() => {
 *       reject(new TimeoutError(operation, timeoutMs));
 *     }, timeoutMs);
 *   });
 *
 *   try {
 *     return await Promise.race([promise, timeoutPromise]);
 *   } finally {
 *     clearTimeout(timeoutId);
 *   }
 * }
 *
 * // Usage
 * const result = await withTimeout('FetchUserData', fetchUser(id), 5000);
 * ```
 *
 * @example Database query timeout
 * ```typescript
 * async function executeWithTimeout(sql: string, timeoutMs: number) {
 *   const controller = new AbortController();
 *   const timeout = setTimeout(() => controller.abort(), timeoutMs);
 *
 *   try {
 *     return await db.query(sql, { signal: controller.signal });
 *   } catch (error) {
 *     if (error.name === 'AbortError') {
 *       throw new TimeoutError('DatabaseQuery', timeoutMs);
 *     }
 *     throw error;
 *   } finally {
 *     clearTimeout(timeout);
 *   }
 * }
 * ```
 *
 * @example Job processing timeout
 * ```typescript
 * class JobProcessor {
 *   async process(job: Job, maxDurationMs: number): Promise<void> {
 *     const startTime = Date.now();
 *
 *     while (!job.isComplete()) {
 *       if (Date.now() - startTime > maxDurationMs) {
 *         throw new TimeoutError(`Job:${job.id}`, maxDurationMs);
 *       }
 *       await job.processNextStep();
 *     }
 *   }
 * }
 * ```
 *
 * @see {@link OperationError} - For general operation failures
 * @see {@link MaxRetriesExceededError} - When retries are exhausted after timeouts
 * @see {@link InfrastructureError} - Parent class providing error code and serialization
 */
export class TimeoutError extends InfrastructureError {
  /**
   * Creates a new TimeoutError instance.
   *
   * @param operation - The name of the operation that timed out. Use the same
   *   naming convention as {@link OperationError} for consistency in logs
   *   and monitoring.
   * @param timeout - The timeout duration in milliseconds that was exceeded.
   *   This value is included in the error message to help operators
   *   understand and tune timeout configurations.
   *
   * @example
   * ```typescript
   * // API call timeout
   * throw new TimeoutError('FetchUserProfile', 5000);
   * // Message: "Operation 'FetchUserProfile' timed out after 5000ms"
   *
   * // Database query timeout
   * throw new TimeoutError('GetOrderHistory', 30000);
   * // Message: "Operation 'GetOrderHistory' timed out after 30000ms"
   *
   * // Lock acquisition timeout
   * throw new TimeoutError('AcquireDistributedLock', 10000);
   * // Message: "Operation 'AcquireDistributedLock' timed out after 10000ms"
   * ```
   */
  constructor(operation: string, timeout: number) {
    super(`Operation '${operation}' timed out after ${timeout}ms`, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when a retry operation exhausts all available attempts.
 *
 * This specialized operation error indicates that an operation was attempted
 * multiple times but failed on every attempt. The error preserves the last
 * error encountered to aid in debugging and root cause analysis.
 *
 * Max retries exceeded errors indicate:
 * - Persistent infrastructure issues (not transient)
 * - Need for manual intervention
 * - Possible need to adjust retry strategy
 * - Underlying service health issues
 *
 * @extends InfrastructureError
 *
 * @example Retry with exponential backoff
 * ```typescript
 * async function retryWithBackoff<T>(
 *   operation: string,
 *   fn: () => Promise<T>,
 *   maxAttempts: number,
 *   baseDelayMs: number = 100
 * ): Promise<T> {
 *   let lastError: Error | undefined;
 *
 *   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 *     try {
 *       return await fn();
 *     } catch (error) {
 *       lastError = error instanceof Error ? error : new Error(String(error));
 *
 *       if (attempt === maxAttempts) {
 *         throw new MaxRetriesExceededError(operation, maxAttempts, lastError);
 *       }
 *
 *       // Exponential backoff with jitter
 *       const delay = baseDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random());
 *       await sleep(delay);
 *     }
 *   }
 *
 *   throw new MaxRetriesExceededError(operation, maxAttempts, lastError);
 * }
 *
 * // Usage
 * const result = await retryWithBackoff('SendEmail', () => emailService.send(email), 3);
 * ```
 *
 * @example Queue job retry exhaustion
 * ```typescript
 * class JobWorker {
 *   async processJob(job: Job): Promise<void> {
 *     if (job.attemptsMade >= job.maxAttempts) {
 *       throw new MaxRetriesExceededError(
 *         `Job:${job.name}`,
 *         job.attemptsMade,
 *         job.failedReason ? new Error(job.failedReason) : undefined
 *       );
 *     }
 *     // Process job...
 *   }
 * }
 * ```
 *
 * @example HTTP request retry
 * ```typescript
 * async function fetchWithRetry(
 *   url: string,
 *   options: RequestInit,
 *   maxAttempts: number
 * ): Promise<Response> {
 *   let lastError: Error | undefined;
 *
 *   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 *     try {
 *       const response = await fetch(url, options);
 *       if (response.ok) return response;
 *
 *       // Retry on 5xx errors
 *       if (response.status >= 500) {
 *         lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
 *         continue;
 *       }
 *
 *       // Don't retry client errors
 *       throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 *     } catch (error) {
 *       lastError = error instanceof Error ? error : new Error(String(error));
 *     }
 *   }
 *
 *   throw new MaxRetriesExceededError(`Fetch:${url}`, maxAttempts, lastError);
 * }
 * ```
 *
 * @see {@link OperationError} - For single operation failures
 * @see {@link TimeoutError} - When individual operations timeout
 * @see {@link InfrastructureError} - Parent class providing error code and serialization
 */
export class MaxRetriesExceededError extends InfrastructureError {
  /**
   * Creates a new MaxRetriesExceededError instance.
   *
   * @param operation - The name of the operation that failed after all retries.
   *   Use the same naming convention as {@link OperationError} for consistency.
   * @param attempts - The total number of attempts that were made before
   *   giving up. This helps operators understand the retry configuration
   *   and decide if adjustments are needed.
   * @param lastError - Optional error from the final failed attempt. This is
   *   the most relevant error for debugging as it represents the most recent
   *   failure state. Accepts `Error | unknown` for compatibility with catch
   *   blocks. The error is stored as the cause for stack trace analysis.
   *
   * @example
   * ```typescript
   * // All retries failed
   * throw new MaxRetriesExceededError('SendNotification', 5);
   * // Message: "Operation 'SendNotification' failed after 5 attempts"
   *
   * // With last error for debugging
   * throw new MaxRetriesExceededError(
   *   'SyncInventory',
   *   3,
   *   new Error('Connection reset by peer')
   * );
   * // Cause preserved: "Connection reset by peer"
   *
   * // Job processing failure
   * throw new MaxRetriesExceededError(
   *   'ProcessPayment',
   *   3,
   *   new Error('Card declined')
   * );
   * ```
   */
  constructor(operation: string, attempts: number, lastError?: Error | unknown) {
    super(
      `Operation '${operation}' failed after ${attempts} attempts`,
      'MAX_RETRIES_EXCEEDED',
      lastError
    );
    this.name = 'MaxRetriesExceededError';
  }
}
