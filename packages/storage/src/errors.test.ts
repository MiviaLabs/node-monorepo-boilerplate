import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  StorageConfigurationError,
  StorageObjectNotFoundError,
  StorageOperationError,
  StorageProviderError
} from './errors.js';

describe('storage errors', () => {
  it('preserves the storage configuration error code and cause', () => {
    const cause = new Error('bad env');
    const error = new StorageConfigurationError('Invalid config', cause);

    assert.equal(error.code, 'STORAGE_CONFIGURATION_ERROR');
    assert.equal(error.cause, cause);
  });

  it('records provider context for provider errors', () => {
    const error = new StorageProviderError('Provider failed', 's3');

    assert.equal(error.code, 'STORAGE_PROVIDER_ERROR');
    assert.equal(error.provider, 's3');
  });

  it('records the failed operation name', () => {
    const error = new StorageOperationError('Put failed', 'putObject');

    assert.equal(error.code, 'STORAGE_OPERATION_ERROR');
    assert.equal(error.operation, 'putObject');
  });

  it('formats missing object errors with bucket and key context', () => {
    const error = new StorageObjectNotFoundError('assets', 'path/file.txt');

    assert.equal(error.code, 'STORAGE_OBJECT_NOT_FOUND');
    assert.equal(error.bucket, 'assets');
    assert.equal(error.key, 'path/file.txt');
    assert.match(error.message, /path\/file\.txt/);
  });
});
