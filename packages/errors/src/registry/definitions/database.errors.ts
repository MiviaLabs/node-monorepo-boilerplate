import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * Database domain error definitions (DB_001-099)
 *
 * Errors related to database operations, connections,
 * queries, and data persistence.
 */
export const DATABASE_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'DB_001',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'Failed to connect to database',
    parameters: [],
    description: 'Database connection could not be established',
    safeForUser: false,
    resolution: 'Contact support if the issue persists'
  },
  {
    code: 'DB_002',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 503,
    message: 'Database connection lost',
    parameters: [],
    description: 'Lost connection to database during operation',
    safeForUser: false,
    resolution: 'Retry the operation or contact support if issue persists'
  },
  {
    code: 'DB_003',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 409,
    message: 'Record already exists: {entity}',
    parameters: [
      {
        name: 'entity',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Entity type'
      }
    ],
    description: 'Attempted to create a duplicate record',
    safeForUser: true,
    resolution: 'Check if the record already exists before creating'
  },
  {
    code: 'DB_004',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 404,
    message: 'Record not found in database',
    parameters: [
      {
        name: 'entity',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Entity type'
      }
    ],
    description: 'Requested record does not exist in database',
    safeForUser: true,
    resolution: 'Verify the record exists before attempting to access it'
  },
  {
    code: 'DB_005',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'Database query failed',
    parameters: [
      {
        name: 'query',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Query details'
      }
    ],
    description: 'Database query execution failed',
    safeForUser: false,
    resolution: 'Contact support with details of what you were trying to do'
  },
  {
    code: 'DB_006',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 409,
    message: 'Foreign key constraint violation',
    parameters: [
      {
        name: 'constraint',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Constraint name'
      }
    ],
    description: 'Referenced record does not exist',
    safeForUser: true,
    resolution: 'Ensure referenced records exist before creating relationships'
  },
  {
    code: 'DB_007',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    message: 'Database transaction failed',
    parameters: [],
    description: 'Database transaction could not be completed',
    safeForUser: false,
    resolution: 'Retry the operation or contact support if issue persists'
  },
  {
    code: 'DB_008',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    message: 'Too many database connections',
    parameters: [],
    description: 'Connection pool is exhausted',
    safeForUser: false,
    resolution: 'Wait a moment and retry, or contact support'
  },
  {
    code: 'DB_009',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid query parameter: {parameter}',
    parameters: [
      {
        name: 'parameter',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Invalid parameter'
      }
    ],
    description: 'Query parameter is invalid for the operation',
    safeForUser: true,
    resolution: 'Check the API documentation for valid parameters'
  },
  {
    code: 'DB_010',
    type: ErrorType.DATABASE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 409,
    message: 'Unique constraint violation',
    parameters: [
      {
        name: 'field',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Field name'
      }
    ],
    description: 'Value must be unique but already exists',
    safeForUser: true,
    resolution: 'Use a different value for this field'
  }
] as const;
