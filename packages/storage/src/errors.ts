import { InfrastructureError } from '@package/core';

export class StorageError extends InfrastructureError {
  constructor(message: string, code = 'STORAGE_ERROR', cause?: Error | unknown) {
    super(message, code, cause);
  }
}

export class StorageConfigurationError extends StorageError {
  constructor(message: string, cause?: Error | unknown) {
    super(message, 'STORAGE_CONFIGURATION_ERROR', cause);
  }
}

export class StorageProviderError extends StorageError {
  constructor(
    message: string,
    public readonly provider: string,
    cause?: Error | unknown
  ) {
    super(message, 'STORAGE_PROVIDER_ERROR', cause);
  }
}

export class StorageOperationError extends StorageError {
  constructor(
    message: string,
    public readonly operation: string,
    cause?: Error | unknown
  ) {
    super(message, 'STORAGE_OPERATION_ERROR', cause);
  }
}

export class StorageObjectNotFoundError extends StorageError {
  constructor(
    public readonly bucket: string,
    public readonly key: string,
    cause?: Error | unknown
  ) {
    super(`Object "${key}" was not found in bucket "${bucket}"`, 'STORAGE_OBJECT_NOT_FOUND', cause);
  }
}
