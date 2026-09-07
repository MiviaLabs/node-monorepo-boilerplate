/**
 * Central Queue Registry
 *
 * Consolidates all queue names and settings for the monorepo. This registry
 * establishes the single source of truth for queue configuration, preventing
 * hardcoded queue names from scattering across the codebase.
 *
 * ## Purpose
 *
 * - Centralize queue names (hardcoded, not environment variables)
 * - Provide queue-specific settings (retry strategy, retention policies)
 * - Enable consistent queue naming and configuration across packages
 * - Support multi-tenancy with tenant-scoped job data
 *
 * ## Queue Naming Convention
 *
 * Queue names should be:
 * - Plural nouns (emails, notifications, reports)
 * - Lowercase with hyphens for multi-word names (password-resets)
 * - Descriptive but concise (email-queue → emails)
 * - Domain-specific (user-events, not async-queue-1)
 *
 * ## Adding New Queues
 *
 * 1. Add queue name to QUEUE_NAMES constant
 * 2. Add settings to QUEUE_SETTINGS (if different from defaults)
 * 3. Export in packages/queues/src/constants/index.ts
 * 4. Create handler with @JobHandler(QUEUE_NAMES.YOUR_QUEUE)
 * 5. Add jobs via addJob({ queueName: QUEUE_NAMES.YOUR_QUEUE, ... })
 *
 * @packageDocumentation
 */

/**
 * Central registry of all queue names in the monorepo.
 *
 * Queue names are **hardcoded constants** (not environment variables) to:
 * - Enable compile-time validation
 * - Support automatic refactoring
 * - Prevent typos in queue names
 * - Document all queues in one place
 *
 * P0 Compliance: Queue names MUST NOT contain PII or tenant identifiers.
 * Use job.data.organizationId for tenant scoping, not queue names.
 *
 * @example Adding a new queue
 * ```typescript
 * export const QUEUE_NAMES = {
 *   // Existing queues
 *   EMAILS: 'emails',
 *   NOTIFICATIONS: 'notifications',
 *
 *   // New queue (add here)
 *   REPORTS: 'reports',
 * } as const;
 * ```
 */
export const QUEUE_NAMES = {
  /**
   * Email sending queue
   *
   * Processes email send jobs asynchronously. Job data includes:
   * - organizationId: string (P0: required for multi-tenancy)
   * - emailRequest: ISendEmailRequest
   *
   * Handler: EmailJobHandler in @package/email
   */
  EMAILS: 'emails'
} as const;

/**
 * Queue-specific settings for non-default configurations.
 *
 * Most queues use DEFAULT_QUEUE_CONFIG values. Only queues with
 * custom settings should be added here.
 *
 * Settings include:
 * - attempts: Number of retry attempts (default: 3)
 * - backoff: Retry backoff strategy (exponential: 5000ms delay)
 * - removeOnComplete: Keep last N completed jobs (1000)
 * - removeOnFail: Keep last N failed jobs (5000)
 *
 * @example Custom queue settings
 * ```typescript
 * export const QUEUE_SETTINGS = {
 *   [QUEUE_NAMES.EMAILS]: {
 *     attempts: 3,
 *     backoff: { type: 'exponential', delay: 5000 },
 *     removeOnComplete: { count: 1000, age: 3600 },
 *     removeOnFail: { count: 5000, age: 86400 },
 *   },
 * } as const;
 * ```
 */
export const QUEUE_SETTINGS = {
  /**
   * Email queue settings
   *
   * - 3 retry attempts (1 initial + 2 retries)
   * - Exponential backoff starting at 5 seconds (5s → 10s → 20s)
   * - Keep last 1000 completed jobs for 1 hour
   * - Keep last 5000 failed jobs for 24 hours
   */
  [QUEUE_NAMES.EMAILS]: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000
    },
    removeOnComplete: {
      count: 1000,
      age: 3600 // 1 hour in seconds
    },
    removeOnFail: {
      count: 5000,
      age: 86400 // 24 hours in seconds
    }
  }
} as const;

/**
 * Type for queue name values
 *
 * @example Type-safe queue name usage
 * ```typescript
 * function getQueueSize(queueName: TQueueName): number {
 *   return queues[queueName]?.size ?? 0;
 * }
 * ```
 */
export type TQueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Type for queue settings values
 */
export type TQueueSettings = (typeof QUEUE_SETTINGS)[TQueueName];
