import { InfrastructureError } from '@package/core';

/**
 * Base error class for email-related errors.
 */
export class EmailError extends InfrastructureError {
  constructor(message: string, cause?: Error) {
    super(message, 'EMAIL_ERROR', cause);
  }
}

/**
 * Error thrown when email send operation fails.
 */
export class EmailSendError extends InfrastructureError {
  constructor(
    message: string,
    public readonly provider: string,
    cause?: Error
  ) {
    super(message, 'EMAIL_SEND_ERROR', cause);
  }
}

/**
 * Error thrown when email provider configuration is invalid.
 */
export class EmailConfigurationError extends InfrastructureError {
  constructor(message: string, cause?: Error) {
    super(message, 'EMAIL_CONFIGURATION_ERROR', cause);
  }
}

/**
 * Error thrown when email provider health check fails.
 */
export class EmailProviderHealthCheckError extends InfrastructureError {
  constructor(
    message: string,
    public readonly provider: string,
    cause?: Error
  ) {
    super(message, 'EMAIL_PROVIDER_HEALTH_CHECK_ERROR', cause);
  }
}
