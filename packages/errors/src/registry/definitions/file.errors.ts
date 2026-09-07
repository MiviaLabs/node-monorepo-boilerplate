import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * File operation domain error definitions (FILE_001-099)
 *
 * Errors related to file uploads, downloads, storage,
 * and file processing.
 */
export const FILE_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'FILE_001',
    type: ErrorType.FILE,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'File upload failed: {reason}',
    parameters: [
      {
        name: 'reason',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Failure reason'
      }
    ],
    description: 'File could not be uploaded',
    safeForUser: true,
    resolution: 'Check file size, format, and try again'
  },
  {
    code: 'FILE_002',
    type: ErrorType.FILE,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid file type: {fileType}. Allowed types: {allowedTypes}',
    parameters: [
      {
        name: 'fileType',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Uploaded file type'
      },
      {
        name: 'allowedTypes',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Allowed file types'
      }
    ],
    description: 'Uploaded file type is not allowed',
    safeForUser: true,
    resolution: 'Upload a file with an allowed type'
  },
  {
    code: 'FILE_003',
    type: ErrorType.FILE,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'File size {size}MB exceeds maximum allowed size of {maxSize}MB',
    parameters: [
      {
        name: 'size',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Uploaded file size'
      },
      {
        name: 'maxSize',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Maximum file size'
      }
    ],
    description: 'Uploaded file is too large',
    safeForUser: true,
    resolution: 'Compress the file or upload a smaller file'
  },
  {
    code: 'FILE_004',
    type: ErrorType.FILE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 404,
    message: 'File not found: {filename}',
    parameters: [
      {
        name: 'filename',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'File name'
      }
    ],
    description: 'Requested file does not exist',
    safeForUser: true,
    resolution: 'Verify the file exists or contact support'
  },
  {
    code: 'FILE_005',
    type: ErrorType.FILE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 403,
    message: 'Permission denied to access file: {filename}',
    parameters: [
      {
        name: 'filename',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'File name'
      }
    ],
    description: 'User does not have permission to access the file',
    safeForUser: true,
    resolution: 'Contact the file owner or administrator'
  },
  {
    code: 'FILE_006',
    type: ErrorType.FILE,
    severity: ErrorSeverity.CRITICAL,
    httpStatus: 500,
    message: 'File storage error: {reason}',
    parameters: [
      {
        name: 'reason',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Error details'
      }
    ],
    description: 'Error occurred in file storage system',
    safeForUser: false,
    resolution: 'Contact support with details of the operation'
  },
  {
    code: 'FILE_007',
    type: ErrorType.FILE,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'File corrupted or invalid: {filename}',
    parameters: [
      {
        name: 'filename',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'File name'
      }
    ],
    description: 'File is corrupted or has invalid format',
    safeForUser: true,
    resolution: 'Upload a valid, uncorrupted file'
  },
  {
    code: 'FILE_008',
    type: ErrorType.FILE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500, // Using 500 instead of 507 for broader compatibility
    message: 'Insufficient storage space',
    parameters: [],
    description: 'Not enough storage space available',
    safeForUser: true,
    resolution: 'Free up space or upgrade your storage plan'
  }
] as const;
