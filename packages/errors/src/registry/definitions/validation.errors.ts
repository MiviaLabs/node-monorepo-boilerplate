import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * Validation domain error definitions (VAL_001-099)
 *
 * Errors related to input validation, schema validation,
 * and data format checks.
 */
export const VALIDATION_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'VAL_001',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Validation failed: {field} is required',
    parameters: [
      { name: 'field', type: ErrorParameterType.STRING, required: true, description: 'Field name' }
    ],
    description: 'Required field is missing',
    safeForUser: true,
    resolution: 'Provide a value for the required field'
  },
  {
    code: 'VAL_002',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid value for {field}: expected {expectedType}',
    parameters: [
      { name: 'field', type: ErrorParameterType.STRING, required: true, description: 'Field name' },
      {
        name: 'expectedType',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Expected type'
      }
    ],
    description: 'Field value does not match expected type',
    safeForUser: true,
    resolution: 'Provide a value of the correct type'
  },
  {
    code: 'VAL_003',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Value for {field} must be between {min} and {max}',
    parameters: [
      { name: 'field', type: ErrorParameterType.STRING, required: true, description: 'Field name' },
      {
        name: 'min',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Minimum value'
      },
      {
        name: 'max',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Maximum value'
      }
    ],
    description: 'Numeric value is outside allowed range',
    safeForUser: true,
    resolution: 'Provide a value within the specified range'
  },
  {
    code: 'VAL_004',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Text for {field} must be between {minLength} and {maxLength} characters',
    parameters: [
      { name: 'field', type: ErrorParameterType.STRING, required: true, description: 'Field name' },
      {
        name: 'minLength',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Minimum length'
      },
      {
        name: 'maxLength',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Maximum length'
      }
    ],
    description: 'String length is outside allowed range',
    safeForUser: true,
    resolution: 'Provide text within the specified length limits'
  },
  {
    code: 'VAL_005',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid UUID format: {value}',
    parameters: [
      {
        name: 'value',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Invalid UUID'
      }
    ],
    description: 'Provided value is not a valid UUID',
    safeForUser: true,
    resolution: 'Provide a valid UUID (e.g., 550e8400-e29b-41d4-a716-446655440000)'
  },
  {
    code: 'VAL_006',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid date format: {date}. Expected format: {expectedFormat}',
    parameters: [
      {
        name: 'date',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Invalid date'
      },
      {
        name: 'expectedFormat',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Expected format'
      }
    ],
    description: 'Date string does not match expected format',
    safeForUser: true,
    resolution: 'Provide date in the correct format (e.g., ISO 8601: YYYY-MM-DD)'
  },
  {
    code: 'VAL_007',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid URL format: {url}',
    parameters: [
      { name: 'url', type: ErrorParameterType.STRING, required: true, description: 'Invalid URL' }
    ],
    description: 'Provided URL is malformed',
    safeForUser: true,
    resolution: 'Provide a valid URL (e.g., https://example.com)'
  },
  {
    code: 'VAL_008',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    message: 'Date {field} must be in the future',
    parameters: [
      { name: 'field', type: ErrorParameterType.STRING, required: true, description: 'Field name' }
    ],
    description: 'Date field requires a future date',
    safeForUser: true,
    resolution: 'Provide a date that is in the future'
  },
  {
    code: 'VAL_009',
    type: ErrorType.VALIDATION,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    message: 'Date {field} must be in the past',
    parameters: [
      { name: 'field', type: ErrorParameterType.STRING, required: true, description: 'Field name' }
    ],
    description: 'Date field requires a past date',
    safeForUser: true,
    resolution: 'Provide a date that is in the past'
  }
] as const;
