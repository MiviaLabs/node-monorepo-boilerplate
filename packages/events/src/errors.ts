/**
 * Custom error types for events
 */

import {
  InfrastructureError,
  ConfigurationError,
  NotFoundError,
  OperationError
} from '@package/core';

/**
 * Error thrown when an event is invalid
 */
export class EventValidationError extends InfrastructureError {
  constructor(
    message: string,
    public readonly eventType?: string
  ) {
    super(message, 'EVENT_VALIDATION_ERROR');
    this.name = 'EventValidationError';
  }
}

/**
 * Error thrown when event producer fails
 */
export class EventProducerError extends OperationError {
  constructor(message: string, cause?: Error | unknown) {
    super('produce', message, cause);
    this.name = 'EventProducerError';
  }
}

/**
 * Error thrown when event consumer fails
 */
export class EventConsumerError extends OperationError {
  constructor(message: string, cause?: Error | unknown) {
    super('consume', message, cause);
    this.name = 'EventConsumerError';
  }
}

/**
 * Error thrown when topic is not found
 */
export class TopicNotFoundError extends NotFoundError {
  constructor(topic: string) {
    super('Topic', topic);
    this.name = 'TopicNotFoundError';
  }
}

/**
 * Error thrown when event handler fails
 */
export class EventHandlerError extends OperationError {
  constructor(eventType: string, cause?: Error | unknown) {
    super('handle', `Event handler failed for event type '${eventType}'`, cause);
    this.name = 'EventHandlerError';
  }
}

/**
 * Error thrown when consumer group is invalid
 */
export class ConsumerGroupError extends ConfigurationError {
  constructor(groupId: string, reason: string) {
    super(`Invalid consumer group '${groupId}': ${reason}`);
    this.name = 'ConsumerGroupError';
  }
}

/**
 * Error thrown when dead letter queue operation fails
 */
export class DeadLetterQueueError extends OperationError {
  constructor(message: string, cause?: Error | unknown) {
    super('dlq', message, cause);
    this.name = 'DeadLetterQueueError';
  }
}

/**
 * Error thrown when serialization/deserialization fails
 */
export class EventSerializationError extends InfrastructureError {
  constructor(message: string, cause?: Error | unknown) {
    super(message, 'EVENT_SERIALIZATION_ERROR', cause);
    this.name = 'EventSerializationError';
  }
}
