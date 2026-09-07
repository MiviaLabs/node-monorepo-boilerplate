import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * System domain error definitions (SYS_001-099)
 *
 * Errors related to system operations, configuration,
 * infrastructure, and platform issues.
 */
export const SYSTEM_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'SYS_001',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'Internal server error',
    parameters: [],
    description: 'Unexpected internal error occurred',
    safeForUser: false,
    resolution: 'Contact support with details of what you were doing'
  },
  {
    code: 'SYS_002',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    message: 'Service temporarily unavailable',
    parameters: [],
    description: 'Service is undergoing maintenance or overloaded',
    safeForUser: true,
    resolution: 'Wait a few minutes and retry the operation'
  },
  {
    code: 'SYS_003',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'Configuration error: {configKey}',
    parameters: [
      {
        name: 'configKey',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Configuration key'
      }
    ],
    description: 'System configuration is invalid or missing',
    safeForUser: false,
    resolution: 'Contact support about this configuration issue'
  },
  {
    code: 'SYS_004',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    message: 'Feature {feature} is not enabled',
    parameters: [
      {
        name: 'feature',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Feature name'
      }
    ],
    description: 'Requested feature is disabled in configuration',
    safeForUser: true,
    resolution: 'Contact support to enable this feature'
  },
  {
    code: 'SYS_005',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.HIGH,
    httpStatus: 429,
    message: 'Rate limit exceeded. Try again in {retryAfter} seconds',
    parameters: [
      {
        name: 'retryAfter',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Seconds to wait'
      }
    ],
    description: 'API rate limit has been exceeded',
    safeForUser: true,
    resolution: 'Wait before making another request'
  },
  {
    code: 'SYS_006',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'Cache service error',
    parameters: [],
    description: 'Error occurred with cache service',
    safeForUser: false,
    resolution: 'Retry the operation or contact support'
  },
  {
    code: 'SYS_007',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    message: 'Job processing failed: {jobType}',
    parameters: [
      { name: 'jobType', type: ErrorParameterType.STRING, required: true, description: 'Job type' }
    ],
    description: 'Background job failed to process',
    safeForUser: false,
    resolution: 'Contact support with job details'
  },
  {
    code: 'SYS_008',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'Message queue error',
    parameters: [],
    description: 'Error occurred with message queue service',
    safeForUser: false,
    resolution: 'Contact support if issue persists'
  },
  {
    code: 'SYS_009',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 500,
    message: 'Email sending failed',
    parameters: [],
    description: 'Failed to send email notification',
    safeForUser: false,
    resolution: 'Check if email address is correct or contact support'
  },
  {
    code: 'SYS_010',
    type: ErrorType.SYSTEM,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    message: 'Scheduler error: {task}',
    parameters: [
      {
        name: 'task',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Scheduled task'
      }
    ],
    description: 'Scheduled task failed to execute',
    safeForUser: false,
    resolution: 'Contact support with task details'
  }
] as const;
