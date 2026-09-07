import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * External service domain error definitions (EXT_001-099)
 *
 * Errors related to third-party APIs, webhooks,
 * and external integrations.
 */
export const EXTERNAL_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'EXT_001',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.HIGH,
    httpStatus: 502,
    message: 'Failed to connect to {service}',
    parameters: [
      {
        name: 'service',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Service name'
      }
    ],
    description: 'Could not establish connection to external service',
    safeForUser: false,
    resolution: 'Retry the operation or contact support if issue persists'
  },
  {
    code: 'EXT_002',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.HIGH,
    httpStatus: 502,
    message: '{service} returned an error: {errorMessage}',
    parameters: [
      {
        name: 'service',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Service name'
      },
      {
        name: 'errorMessage',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Error from service'
      }
    ],
    description: 'External service returned an error response',
    safeForUser: false,
    resolution: 'Contact support with details of the operation'
  },
  {
    code: 'EXT_003',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.HIGH,
    httpStatus: 504,
    message: '{service} request timed out',
    parameters: [
      {
        name: 'service',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Service name'
      }
    ],
    description: 'External service did not respond in time',
    safeForUser: false,
    resolution: 'Retry the operation or contact support'
  },
  {
    code: 'EXT_004',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid API key for {service}',
    parameters: [
      {
        name: 'service',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Service name'
      }
    ],
    description: 'API credentials for external service are invalid',
    safeForUser: false,
    resolution: 'Contact support to verify API credentials'
  },
  {
    code: 'EXT_005',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.HIGH,
    httpStatus: 429,
    message: 'Rate limit exceeded for {service}. Retry after {retryAfter} seconds',
    parameters: [
      {
        name: 'service',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Service name'
      },
      {
        name: 'retryAfter',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Seconds to wait'
      }
    ],
    description: 'External service rate limit has been exceeded',
    safeForUser: true,
    resolution: 'Wait before retrying or reduce request frequency'
  },
  {
    code: 'EXT_006',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 503,
    message: '{service} is currently unavailable',
    parameters: [
      {
        name: 'service',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Service name'
      }
    ],
    description: 'External service is down for maintenance or has failed',
    safeForUser: true,
    resolution: 'Wait for service to restore or contact support'
  },
  {
    code: 'EXT_007',
    type: ErrorType.EXTERNAL,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Webhook delivery failed: {reason}',
    parameters: [
      {
        name: 'reason',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Failure reason'
      }
    ],
    description: 'Failed to deliver webhook to external endpoint',
    safeForUser: false,
    resolution: 'Verify the webhook URL is accessible and retry'
  }
] as const;
