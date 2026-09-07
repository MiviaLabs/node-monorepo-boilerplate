import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  MockStorageProvider,
  S3StorageProvider,
  createStorageProvider,
  resolveStorageConfigs,
  resolveStorageConfig
} from './index.js';

describe('storage package exports', () => {
  it('exports the framework-agnostic package surface', () => {
    assert.equal(typeof resolveStorageConfig, 'function');
    assert.equal(typeof resolveStorageConfigs, 'function');
    assert.equal(typeof createStorageProvider, 'function');
    assert.equal(typeof MockStorageProvider, 'function');
    assert.equal(typeof S3StorageProvider, 'function');
  });
});
