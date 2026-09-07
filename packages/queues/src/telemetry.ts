/**
 * OpenTelemetry integration for queues
 *
 * Provides basic job processing tracking and metrics.
 */

import {
  withSpan,
  addSpanAttributes,
  createCounter,
  createHistogram,
  recordHistogram,
  incrementCounter,
  InfrastructureMetrics,
  MESSAGING_SYSTEMS,
  MESSAGING_OPERATIONS
} from '@package/core';

/**
 * Job status for metrics
 */
export const enum JobStatus {
  Success = 'success',
  Error = 'error'
}

/**
 * Standard span attributes for queue operations
 */
export interface QueueSpanAttributes {
  [key: string]: string | number | undefined;
  'queue.name': string;
  'job.id': string;
  'job.name': string;
  'job.attempt'?: number;
  'messaging.system'?: string;
  'messaging.destination'?: string;
  'messaging.destination_kind'?: string;
}

/**
 * Wrap job execution with OpenTelemetry tracing
 *
 * @param queueName - Queue name
 * @param jobId - Job ID
 * @param jobName - Job name
 * @param attempt - Attempt number
 * @param fn - Function to execute
 * @returns Result of the function
 */
export async function traceJobExecution<T>(
  queueName: string,
  jobId: string,
  jobName: string,
  attempt: number,
  fn: () => Promise<T>
): Promise<T> {
  const attributes: QueueSpanAttributes = {
    'queue.name': queueName,
    'job.id': jobId,
    'job.name': jobName,
    'job.attempt': attempt,
    'messaging.system': MESSAGING_SYSTEMS.REDIS,
    'messaging.destination': queueName,
    'messaging.destination_kind': 'queue'
  };

  return withSpan(`job.process.${jobName}`, async (span) => {
    span.setAttributes(attributes);
    const startTime = Date.now();

    try {
      const result = await fn();
      span.setStatus({ code: 1 }); // OK
      incrementJobCounter(queueName, jobName, JobStatus.Success);
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      incrementJobCounter(queueName, jobName, JobStatus.Error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      recordJobDuration(queueName, jobName, duration);
    }
  });
}

/**
 * Trace queue creation
 *
 * @param queueName - Name of the queue being created
 */
export function traceQueueCreate(queueName: string): void {
  addSpanAttributes({
    'queue.name': queueName,
    'messaging.system': MESSAGING_SYSTEMS.REDIS,
    'messaging.destination': queueName,
    'messaging.destination_kind': 'queue',
    'messaging.operation': MESSAGING_OPERATIONS.CREATE
  });
}

/**
 * Trace job enqueue
 *
 * @param queueName - Name of the queue
 * @param jobName - Name of the job being enqueued
 * @param jobId - Optional job ID
 */
export function traceJobEnqueue(queueName: string, jobName: string, jobId?: string): void {
  addSpanAttributes({
    'queue.name': queueName,
    'job.name': jobName,
    ...(jobId && { 'job.id': jobId }),
    'messaging.operation': MESSAGING_OPERATIONS.PUBLISH
  });
}

// Metrics

let jobCounter: ReturnType<typeof createCounter> | null = null;
let jobDurationHistogram: ReturnType<typeof createHistogram> | null = null;

/**
 * Get or create job counter metric
 */
function getJobCounter() {
  if (!jobCounter) {
    jobCounter = createCounter(InfrastructureMetrics.JOB_COUNT, {
      description: 'Number of jobs processed',
      unit: '1'
    });
  }
  return jobCounter;
}

/**
 * Get or create job duration histogram
 */
function getJobDurationHistogram() {
  if (!jobDurationHistogram) {
    jobDurationHistogram = createHistogram(InfrastructureMetrics.JOB_DURATION, {
      description: 'Job processing duration in milliseconds',
      unit: 'ms'
    });
  }
  return jobDurationHistogram;
}

/**
 * Increment job counter
 */
function incrementJobCounter(queueName: string, jobName: string, status: JobStatus): void {
  const counter = getJobCounter();
  incrementCounter(counter, 1, {
    'queue.name': queueName,
    'job.name': jobName,
    'job.status': status
  });
}

/**
 * Record job duration
 */
function recordJobDuration(queueName: string, jobName: string, durationMs: number): void {
  const histogram = getJobDurationHistogram();
  recordHistogram(histogram, durationMs, {
    'queue.name': queueName,
    'job.name': jobName
  });
}

/**
 * Trace worker initialization
 *
 * @param workerName - Name of the worker being initialized
 * @param queueName - Name of the queue the worker is processing
 */
export function traceWorkerInit(workerName: string, queueName: string): void {
  addSpanAttributes({
    'worker.name': workerName,
    'queue.name': queueName
  });
}
