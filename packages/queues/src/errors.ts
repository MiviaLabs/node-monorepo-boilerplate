/**
 * Custom error types for queues
 */

import { InfrastructureError } from '@package/core';

/**
 * Queue error codes
 */
export enum QueueErrorCode {
  QUEUE_NOT_FOUND = 'QUEUE_NOT_FOUND',
  WORKER_NOT_FOUND = 'WORKER_NOT_FOUND',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  CRON_JOB_NOT_FOUND = 'CRON_JOB_NOT_FOUND',
  INVALID_QUEUE_CONFIG = 'INVALID_QUEUE_CONFIG',
  INVALID_WORKER_CONFIG = 'INVALID_WORKER_CONFIG',
  JOB_PROCESSING_ERROR = 'JOB_PROCESSING_ERROR',
  PUBLISH_FAILED = 'QUEUE_PUBLISH_FAILED',
  SUBSCRIBE_FAILED = 'QUEUE_SUBSCRIBE_FAILED'
}

/**
 * Base Queue error
 */
export class QueueError extends InfrastructureError {
  constructor(message: string, code: QueueErrorCode = QueueErrorCode.JOB_PROCESSING_ERROR) {
    super(message, code);
    this.name = 'QueueError';
  }
}

/**
 * Error thrown when a queue is not found
 */
export class QueueNotFoundError extends QueueError {
  constructor(queueName: string, _details?: Record<string, unknown>) {
    super(
      `Queue '${queueName}' not found. Create the queue first using createQueue().`,
      QueueErrorCode.QUEUE_NOT_FOUND
    );
    this.name = 'QueueNotFoundError';
  }
}

/**
 * Error thrown when a worker is not found
 */
export class WorkerNotFoundError extends QueueError {
  constructor(workerName: string, _details?: Record<string, unknown>) {
    super(
      `Worker '${workerName}' not found. Create the worker first using createWorker().`,
      QueueErrorCode.WORKER_NOT_FOUND
    );
    this.name = 'WorkerNotFoundError';
  }
}

/**
 * Error thrown when a job is not found
 */
export class JobNotFoundError extends QueueError {
  constructor(queueName: string, jobId: string, _details?: Record<string, unknown>) {
    super(`Job '${jobId}' not found in queue '${queueName}'.`, QueueErrorCode.JOB_NOT_FOUND);
    this.name = 'JobNotFoundError';
  }
}

/**
 * Error thrown when a cron job is not found
 */
export class CronJobNotFoundError extends QueueError {
  constructor(queueName: string, jobName: string, _details?: Record<string, unknown>) {
    super(
      `Cron job '${jobName}' not found in queue '${queueName}'.`,
      QueueErrorCode.CRON_JOB_NOT_FOUND
    );
    this.name = 'CronJobNotFoundError';
  }
}

/**
 * Error thrown when queue configuration is invalid
 */
export class InvalidQueueConfigError extends QueueError {
  constructor(message: string, _details?: Record<string, unknown>) {
    super(`Invalid queue configuration: ${message}`, QueueErrorCode.INVALID_QUEUE_CONFIG);
    this.name = 'InvalidQueueConfigError';
  }
}

/**
 * Error thrown when worker configuration is invalid
 */
export class InvalidWorkerConfigError extends QueueError {
  constructor(message: string, _details?: Record<string, unknown>) {
    super(`Invalid worker configuration: ${message}`, QueueErrorCode.INVALID_WORKER_CONFIG);
    this.name = 'InvalidWorkerConfigError';
  }
}

/**
 * Error thrown when job processing fails
 */
export class JobProcessingError extends QueueError {
  constructor(jobId: string, originalError: unknown, _details?: Record<string, unknown>) {
    const message =
      originalError instanceof Error
        ? `Job '${jobId}' processing failed: ${originalError.message}`
        : `Job '${jobId}' processing failed with unknown error`;

    super(message, QueueErrorCode.JOB_PROCESSING_ERROR);
    this.name = 'JobProcessingError';
    // Store the original error for later reference
    Object.defineProperty(this, 'originalError', {
      value: originalError,
      enumerable: false,
      writable: false
    });
  }

  override get cause(): Error | unknown {
    return (this as { originalError?: Error | unknown }).originalError;
  }
}

/**
 * Error thrown when message publishing fails
 */
export class PublishFailedError extends QueueError {
  constructor(queueName: string, _details?: Record<string, unknown>) {
    super(`Failed to publish message to queue: ${queueName}`, QueueErrorCode.PUBLISH_FAILED);
    this.name = 'PublishFailedError';
  }
}

/**
 * Error thrown when subscription fails
 */
export class SubscribeFailedError extends QueueError {
  constructor(
    queueName: string,
    originalError?: Error | unknown,
    _details?: Record<string, unknown>
  ) {
    const message =
      originalError instanceof Error
        ? `Failed to subscribe to queue: ${queueName} - ${originalError.message}`
        : `Failed to subscribe to queue: ${queueName}`;

    super(message, QueueErrorCode.SUBSCRIBE_FAILED);
    this.name = 'SubscribeFailedError';
    // Store the original error for later reference
    Object.defineProperty(this, 'originalError', {
      value: originalError,
      enumerable: false,
      writable: false
    });
  }

  override get cause(): Error | unknown {
    return (this as { originalError?: Error | unknown }).originalError;
  }
}
