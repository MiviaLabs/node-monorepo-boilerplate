/**
 * Provider configuration for unified queue abstraction
 */

import { BackoffType } from './interfaces';

/**
 * Supported queue provider types
 */
// eslint-disable-next-line local-rules/prefer-const-enum
export type QueueProviderType = 'bullmq' | 'cloud-tasks' | 'pubsub';

/**
 * Queue provider configuration
 */
export interface QueueProviderConfig {
  /** Provider type */
  type: QueueProviderType;
  /** Provider-specific configuration */
  config?: unknown;
}

/**
 * BullMQ provider configuration
 */
export interface BullMQProviderConfig {
  /** Redis connection options */
  connection?: {
    host?: string;
    port?: number;
    db?: number;
    password?: string;
  };
  /** Default job options */
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: BackoffType;
      delay: number;
    };
  };
}

/**
 * Cloud Tasks provider configuration
 */
export interface CloudTasksProviderConfig {
  /** Google Cloud project ID */
  projectId: string;
  /** Cloud Tasks location */
  location: string;
  /** Base URL for HTTP targets */
  httpBaseUrl: string;
  /** API key for authentication (optional) */
  apiKey?: string;
  /** Credentials */
  credentials?: {
    keyFile?: string;
    clientEmail?: string;
    privateKey?: string;
  };
}

/**
 * Pub/Sub provider configuration
 */
export interface PubSubProviderConfig {
  /** Google Cloud project ID */
  projectId: string;
  /** Subscription prefix for queues */
  subscriptionPrefix?: string;
  /** Credentials */
  credentials?: {
    keyFile?: string;
    clientEmail?: string;
    privateKey?: string;
  };
}
