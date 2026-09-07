import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * Business logic domain error definitions (BIZ_001-099)
 *
 * Errors related to business rules, workflows,
 * and domain-specific validations.
 */
export const BUSINESS_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'BIZ_001',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.HIGH,
    httpStatus: 400,
    message: 'Operation not allowed: {reason}',
    parameters: [
      {
        name: 'reason',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Reason for disallow'
      }
    ],
    description: 'Business rule violation',
    safeForUser: true,
    resolution: 'Review business rules and adjust your request'
  },
  {
    code: 'BIZ_002',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.HIGH,
    httpStatus: 400,
    message: 'Cannot modify {entity} in {status} status',
    parameters: [
      {
        name: 'entity',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Entity type'
      },
      {
        name: 'status',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Current status'
      }
    ],
    description: 'Entity cannot be modified in its current state',
    safeForUser: true,
    resolution: 'Change the entity status before attempting modification'
  },
  {
    code: 'BIZ_003',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Insufficient balance: required {required}, available {available}',
    parameters: [
      {
        name: 'required',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Required amount'
      },
      {
        name: 'available',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Available amount'
      }
    ],
    description: 'Account or wallet balance is insufficient',
    safeForUser: true,
    resolution: 'Add funds or reduce the transaction amount'
  },
  {
    code: 'BIZ_004',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.HIGH,
    httpStatus: 409,
    message: 'Resource is already {action}',
    parameters: [
      {
        name: 'action',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Action (e.g., approved, cancelled)'
      }
    ],
    description: 'Resource has already undergone the requested action',
    safeForUser: true,
    resolution: 'Check the current status of the resource'
  },
  {
    code: 'BIZ_005',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Maximum limit of {limit} {entity} reached',
    parameters: [
      {
        name: 'limit',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Maximum limit'
      },
      {
        name: 'entity',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Entity type'
      }
    ],
    description: 'Cannot create more resources due to limit',
    safeForUser: true,
    resolution: 'Upgrade your plan or remove existing resources'
  },
  {
    code: 'BIZ_006',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.HIGH,
    httpStatus: 400,
    message: 'Subscription is required for this feature',
    parameters: [],
    description: 'Feature requires an active subscription',
    safeForUser: true,
    resolution: 'Subscribe to a plan that includes this feature'
  },
  {
    code: 'BIZ_007',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Trial period has expired',
    parameters: [],
    description: 'Free trial period has ended',
    safeForUser: true,
    resolution: 'Subscribe to continue using the service'
  },
  {
    code: 'BIZ_008',
    type: ErrorType.BUSINESS,
    severity: ErrorSeverity.HIGH,
    httpStatus: 400,
    message: 'Invalid workflow transition from {currentStatus} to {newStatus}',
    parameters: [
      {
        name: 'currentStatus',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Current status'
      },
      {
        name: 'newStatus',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Target status'
      }
    ],
    description: 'Workflow state transition is not allowed',
    safeForUser: true,
    resolution: 'Follow the correct workflow sequence'
  }
] as const;
