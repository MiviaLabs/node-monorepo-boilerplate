/**
 * Custom error types for redis
 */

import {
  InfrastructureError,
  ConfigurationError,
  OperationError,
  ConnectionError as CoreConnectionError
} from '@package/core';

/**
 * Error thrown when Redis connection fails
 */
export class RedisConnectionError extends CoreConnectionError {
  constructor(message: string, cause?: Error | unknown) {
    super('Redis', message, cause);
    this.name = 'RedisConnectionError';
  }
}

/**
 * Error thrown when Redis command fails
 */
export class RedisCommandError extends OperationError {
  constructor(command: string, message: string, cause?: Error | unknown) {
    super(command, message, cause);
    this.name = 'RedisCommandError';
  }
}

/**
 * Error thrown when Redis configuration is invalid
 */
export class RedisConfigError extends ConfigurationError {
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'RedisConfigError';
  }
}

/**
 * Error thrown when cache operation fails
 */
export class CacheError extends InfrastructureError {
  constructor(operation: string, key: string, cause?: Error | unknown) {
    super(`Cache operation '${operation}' failed for key '${key}'`, 'CACHE_ERROR', cause);
    this.name = 'CacheError';
  }
}

/**
 * Error thrown when pub/sub operation fails
 */
export class PubSubError extends InfrastructureError {
  constructor(operation: string, channel: string, cause?: Error | unknown) {
    super(
      `Pub/Sub operation '${operation}' failed for channel '${channel}'`,
      'PUBSUB_ERROR',
      cause
    );
    this.name = 'PubSubError';
  }
}

/**
 * Error thrown when key is not found in Redis
 */
export class KeyNotFoundError extends InfrastructureError {
  constructor(key: string) {
    super(`Key '${key}' not found in Redis`, 'KEY_NOT_FOUND');
    this.name = 'KeyNotFoundError';
  }
}

/**
 * Error thrown when Redis cluster operation fails
 */
export class RedisClusterError extends InfrastructureError {
  constructor(message: string, cause?: Error | unknown) {
    super(message, 'REDIS_CLUSTER_ERROR', cause);
    this.name = 'RedisClusterError';
  }
}
