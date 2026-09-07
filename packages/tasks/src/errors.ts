/**
 * Custom error types for Cloud Tasks operations
 */

import { InfrastructureError } from '@package/core';

/**
 * Cloud Tasks specific error codes
 *
 * Error codes for identifying specific Cloud Tasks error conditions.
 * Each error class uses a corresponding error code.
 *
 * @example Checking error codes
 * ```typescript
 * try {
 *   await provider.createQueue('my-queue');
 * } catch (error) {
 *   if (error instanceof CloudTasksError) {
 *     switch (error.code) {
 *       case CloudTasksErrorCode.QUEUE_ALREADY_EXISTS:
 *         console.log('Queue already exists, continuing...');
 *         break;
 *       case CloudTasksErrorCode.PERMISSION_DENIED:
 *         console.error('Check IAM permissions');
 *         break;
 *       default:
 *         throw error;
 *     }
 *   }
 * }
 * ```
 */
export enum CloudTasksErrorCode {
  QUEUE_NOT_FOUND = 'CLOUD_TASKS_QUEUE_NOT_FOUND',
  QUEUE_ALREADY_EXISTS = 'CLOUD_TASKS_QUEUE_ALREADY_EXISTS',
  TASK_CREATION_FAILED = 'CLOUD_TASKS_TASK_CREATION_FAILED',
  TASK_NOT_FOUND = 'CLOUD_TASKS_TASK_NOT_FOUND',
  TASK_RETRIEVAL_FAILED = 'CLOUD_TASKS_TASK_RETRIEVAL_FAILED',
  INVALID_TASK_CONFIG = 'CLOUD_TASKS_INVALID_TASK_CONFIG',
  QUEUE_CREATION_FAILED = 'CLOUD_TASKS_QUEUE_CREATION_FAILED',
  QUEUE_DELETION_FAILED = 'CLOUD_TASKS_QUEUE_DELETION_FAILED',
  AUTHENTICATION_FAILED = 'CLOUD_TASKS_AUTHENTICATION_FAILED',
  PERMISSION_DENIED = 'CLOUD_TASKS_PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'CLOUD_TASKS_RATE_LIMIT_EXCEEDED'
}

/**
 * Base Cloud Tasks error
 *
 * Base class for all Cloud Tasks related errors.
 * Extends InfrastructureError for consistent error handling.
 *
 * @example Catching any Cloud Tasks error
 * ```typescript
 * try {
 *   await provider.createHttpTask('my-queue', { url: 'https://api.example.com' });
 * } catch (error) {
 *   if (error instanceof CloudTasksError) {
 *     console.error('Cloud Tasks error:', error.message);
 *     console.error('Error code:', error.code);
 *     console.error('Details:', error.details);
 *   }
 * }
 * ```
 *
 * @example Creating a custom Cloud Tasks error
 * ```typescript
 * throw new CloudTasksError(
 *   'Custom error message',
 *   CloudTasksErrorCode.TASK_CREATION_FAILED,
 *   { queueName: 'my-queue', taskId: 'task-123' }
 * );
 * ```
 */
export class CloudTasksError extends InfrastructureError {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: CloudTasksErrorCode = CloudTasksErrorCode.TASK_CREATION_FAILED,
    details?: Record<string, unknown>
  ) {
    super(message, code);
    this.name = 'CloudTasksError';
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Queue not found error
 *
 * Thrown when attempting to access a queue that does not exist.
 *
 * @example Handling queue not found
 * ```typescript
 * try {
 *   await provider.createHttpTask('nonexistent-queue', { url: 'https://api.example.com' });
 * } catch (error) {
 *   if (error instanceof QueueNotFoundError) {
 *     // Create the queue first
 *     await provider.createQueue('nonexistent-queue');
 *     // Retry the operation
 *     await provider.createHttpTask('nonexistent-queue', { url: 'https://api.example.com' });
 *   }
 * }
 * ```
 */
export class QueueNotFoundError extends CloudTasksError {
  constructor(queueName: string, details?: Record<string, unknown>) {
    super(`Queue not found: ${queueName}`, CloudTasksErrorCode.QUEUE_NOT_FOUND, details);
    this.name = 'QueueNotFoundError';
  }
}

/**
 * Queue already exists error
 *
 * Thrown when attempting to create a queue that already exists.
 *
 * @example Handling queue already exists (idempotent create)
 * ```typescript
 * async function ensureQueueExists(provider: CloudTasksProvider, queueName: string) {
 *   try {
 *     await provider.createQueue(queueName);
 *   } catch (error) {
 *     if (error instanceof QueueAlreadyExistsError) {
 *       // Queue exists, which is fine
 *       return provider.getQueue(queueName);
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export class QueueAlreadyExistsError extends CloudTasksError {
  constructor(queueName: string, details?: Record<string, unknown>) {
    super(`Queue already exists: ${queueName}`, CloudTasksErrorCode.QUEUE_ALREADY_EXISTS, details);
    this.name = 'QueueAlreadyExistsError';
  }
}

/**
 * Task creation failed error
 *
 * Thrown when task creation fails for reasons other than invalid config
 * or missing queue.
 *
 * @example Handling task creation failure
 * ```typescript
 * try {
 *   await provider.createHttpTask('my-queue', { url: 'https://api.example.com' });
 * } catch (error) {
 *   if (error instanceof TaskCreationFailedError) {
 *     console.error('Failed to create task:', error.message);
 *     // Log for debugging and retry later
 *     await logFailedTask(error.details);
 *   }
 * }
 * ```
 */
export class TaskCreationFailedError extends CloudTasksError {
  constructor(queueName: string, details?: Record<string, unknown>) {
    super(
      `Failed to create task in queue: ${queueName}`,
      CloudTasksErrorCode.TASK_CREATION_FAILED,
      details
    );
    this.name = 'TaskCreationFailedError';
  }
}

/**
 * Task not found error
 *
 * Thrown when attempting to access a task that does not exist
 * or has already been executed/deleted.
 *
 * @example Handling task not found
 * ```typescript
 * try {
 *   const task = await provider.getTask(taskName);
 * } catch (error) {
 *   if (error instanceof TaskNotFoundError) {
 *     console.log('Task has been executed or was deleted');
 *   }
 * }
 * ```
 */
export class TaskNotFoundError extends CloudTasksError {
  constructor(taskName: string, details?: Record<string, unknown>) {
    super(`Task not found: ${taskName}`, CloudTasksErrorCode.TASK_NOT_FOUND, details);
    this.name = 'TaskNotFoundError';
  }
}

/**
 * Task retrieval failed error
 *
 * Thrown when task retrieval fails for reasons other than the task
 * not being found.
 *
 * @example Handling task retrieval failure
 * ```typescript
 * try {
 *   const task = await provider.getTask(taskName);
 * } catch (error) {
 *   if (error instanceof TaskRetrievalFailedError) {
 *     console.error('Failed to retrieve task:', error.message);
 *     // Check permissions, network, or service availability
 *   }
 * }
 * ```
 */
export class TaskRetrievalFailedError extends CloudTasksError {
  constructor(taskName: string, details?: Record<string, unknown>) {
    super(
      `Failed to retrieve task: ${taskName}`,
      CloudTasksErrorCode.TASK_RETRIEVAL_FAILED,
      details
    );
    this.name = 'TaskRetrievalFailedError';
  }
}

/**
 * Invalid task configuration error
 *
 * Thrown when task or queue configuration is invalid.
 * Check the message for details about what is invalid.
 *
 * @example Handling invalid configuration
 * ```typescript
 * try {
 *   await provider.createHttpTask('my-queue', {
 *     url: 'invalid-url', // Missing protocol
 *     httpMethod: HttpMethod.POST,
 *   });
 * } catch (error) {
 *   if (error instanceof InvalidTaskConfigError) {
 *     console.error('Configuration error:', error.message);
 *     // Fix the URL and retry
 *   }
 * }
 * ```
 *
 * @example Validation in tests
 * ```typescript
 * it('should reject invalid URL', async () => {
 *   await expect(
 *     provider.createHttpTask('queue', { url: 'not-a-url' })
 *   ).rejects.toThrow(InvalidTaskConfigError);
 * });
 * ```
 */
export class InvalidTaskConfigError extends CloudTasksError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      `Invalid task configuration: ${message}`,
      CloudTasksErrorCode.INVALID_TASK_CONFIG,
      details
    );
    this.name = 'InvalidTaskConfigError';
  }
}

/**
 * Queue creation failed error
 *
 * Thrown when queue creation fails for reasons other than the queue
 * already existing.
 *
 * @example Handling queue creation failure
 * ```typescript
 * try {
 *   await provider.createQueue('my-queue');
 * } catch (error) {
 *   if (error instanceof QueueCreationFailedError) {
 *     console.error('Failed to create queue:', error.message);
 *     // Check permissions, quotas, or network issues
 *   }
 * }
 * ```
 */
export class QueueCreationFailedError extends CloudTasksError {
  constructor(queueName: string, details?: Record<string, unknown>) {
    super(
      `Failed to create queue: ${queueName}`,
      CloudTasksErrorCode.QUEUE_CREATION_FAILED,
      details
    );
    this.name = 'QueueCreationFailedError';
  }
}

/**
 * Queue deletion failed error
 *
 * Thrown when queue deletion fails for reasons other than the queue
 * not existing.
 *
 * @example Handling queue deletion failure
 * ```typescript
 * try {
 *   await provider.deleteQueue('my-queue');
 * } catch (error) {
 *   if (error instanceof QueueDeletionFailedError) {
 *     console.error('Failed to delete queue:', error.message);
 *     // Check permissions or if queue has pending tasks
 *   }
 * }
 * ```
 */
export class QueueDeletionFailedError extends CloudTasksError {
  constructor(queueName: string, details?: Record<string, unknown>) {
    super(
      `Failed to delete queue: ${queueName}`,
      CloudTasksErrorCode.QUEUE_DELETION_FAILED,
      details
    );
    this.name = 'QueueDeletionFailedError';
  }
}

/**
 * Authentication failed error
 *
 * Thrown when Cloud Tasks authentication fails.
 * Check credentials configuration.
 *
 * @example Handling authentication failure
 * ```typescript
 * try {
 *   const provider = new CloudTasksProvider(config);
 *   await provider.listQueues();
 * } catch (error) {
 *   if (error instanceof AuthenticationFailedError) {
 *     console.error('Authentication failed:', error.message);
 *     console.error('Check: keyFile path, service account, or default credentials');
 *   }
 * }
 * ```
 */
export class AuthenticationFailedError extends CloudTasksError {
  constructor(details?: Record<string, unknown>) {
    super(
      'Cloud Tasks authentication failed. Check your credentials.',
      CloudTasksErrorCode.AUTHENTICATION_FAILED,
      details
    );
    this.name = 'AuthenticationFailedError';
  }
}

/**
 * Permission denied error
 *
 * Thrown when the service account lacks required IAM permissions.
 *
 * @example Handling permission denied
 * ```typescript
 * try {
 *   await provider.createQueue('my-queue');
 * } catch (error) {
 *   if (error instanceof PermissionDeniedError) {
 *     console.error('Permission denied:', error.message);
 *     console.error('Required role: roles/cloudtasks.admin');
 *   }
 * }
 * ```
 *
 * @see https://cloud.google.com/tasks/docs/access-control
 */
export class PermissionDeniedError extends CloudTasksError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      `Cloud Tasks permission denied: ${message}`,
      CloudTasksErrorCode.PERMISSION_DENIED,
      details
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Rate limit exceeded error
 *
 * Thrown when Cloud Tasks API rate limits are exceeded.
 * Implement exponential backoff and retry.
 *
 * @example Handling rate limiting with retry
 * ```typescript
 * async function createTaskWithRetry(
 *   provider: CloudTasksProvider,
 *   queueName: string,
 *   target: HttpTargetOptions,
 *   maxRetries = 3
 * ) {
 *   for (let attempt = 0; attempt < maxRetries; attempt++) {
 *     try {
 *       return await provider.createHttpTask(queueName, target);
 *     } catch (error) {
 *       if (error instanceof RateLimitExceededError && attempt < maxRetries - 1) {
 *         const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
 *         await new Promise(resolve => setTimeout(resolve, delay));
 *         continue;
 *       }
 *       throw error;
 *     }
 *   }
 * }
 * ```
 */
export class RateLimitExceededError extends CloudTasksError {
  constructor(details?: Record<string, unknown>) {
    super(
      'Cloud Tasks rate limit exceeded. Please retry later.',
      CloudTasksErrorCode.RATE_LIMIT_EXCEEDED,
      details
    );
    this.name = 'RateLimitExceededError';
  }
}
