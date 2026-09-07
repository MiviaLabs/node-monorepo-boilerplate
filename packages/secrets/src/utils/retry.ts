/**
 * Retry utility with exponential backoff and jitter
 *
 * Provides a retry mechanism for transient failures in external API calls.
 * Uses exponential backoff with jitter to prevent thundering herd problems.
 */

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 100ms) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000ms) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2 for exponential backoff) */
  backoffMultiplier?: number;
  /** Whether to add jitter to delay (default: true) */
  jitter?: boolean;
  /** Function to determine if an error is retryable (default: retry all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for logging retry attempts (optional) */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> = {
  maxAttempts: 5,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true
};

/**
 * Default retryable error checker - retries all errors
 */
const defaultIsRetryable = (_error: unknown): boolean => true;

/**
 * Calculate delay with exponential backoff and optional jitter
 *
 * @param attempt - Attempt number (0-indexed)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  // Calculate exponential backoff
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt);

  // Add jitter if enabled (random value between 0-100ms)
  const jitterDelay = options.jitter ? Math.random() * 100 : 0;

  // Apply max delay cap
  return Math.min(exponentialDelay + jitterDelay, options.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Promise with the result of the function
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => await fetchSecret('my-secret'),
 *   {
 *     maxAttempts: 3,
 *     baseDelayMs: 100,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt + 1} after ${delay}ms`, error);
 *     }
 *   }
 * );
 * ```
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const resolvedOptions: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
    isRetryable: options.isRetryable ?? defaultIsRetryable,
    onRetry: options.onRetry ?? (() => {})
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < resolvedOptions.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!resolvedOptions.isRetryable(error)) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === resolvedOptions.maxAttempts - 1) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, resolvedOptions);

      // Call onRetry callback if provided
      resolvedOptions.onRetry(attempt + 1, error, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retryable version of a function
 *
 * @param fn - Function to make retryable
 * @param options - Retry options
 * @returns Retryable version of the function
 *
 * @example
 * ```typescript
 * const retryableFetch = makeRetryable(fetchSecret, { maxAttempts: 3 });
 * const result = await retryableFetch('my-secret');
 * ```
 */
export function makeRetryable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => retry(() => fn(...args), options);
}

/**
 * Check if an error is a transient network error
 *
 * @param error - Error to check
 * @returns True if error is transient and should be retried
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    // Check for common transient error patterns
    const message = error.message.toLowerCase();
    const transientPatterns = [
      'etimedout',
      'econnrefused',
      'econnreset',
      'enotfound',
      'eaiagain',
      'eaigain', // Alternative spelling
      'timeout',
      'timed out',
      'network',
      'temporary',
      'transient',
      'rate limit',
      'too many requests',
      'service unavailable'
    ];

    return transientPatterns.some((pattern) => message.includes(pattern));
  }

  // Check for GCP error codes
  if (typeof error === 'object' && error !== null) {
    const gcpError = error as { code?: number; message?: string };
    // GCP error codes:
    // 1 - CANCELLED
    // 4 - DEADLINE_EXCEEDED
    // 8 - RESOURCE_EXHAUSTED
    // 10 - ABORTED
    // 14 - UNAVAILABLE
    const transientCodes = [1, 4, 8, 10, 14];
    return gcpError.code !== undefined && transientCodes.includes(gcpError.code);
  }

  return false;
}
