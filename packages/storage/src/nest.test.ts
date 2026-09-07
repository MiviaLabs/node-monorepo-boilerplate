import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  DisabledStorageProvider,
  StorageRegistryService,
  StorageModule,
  StorageService,
  STORAGE_MODULE_OPTIONS,
  STORAGE_PROVIDER_MAP_TOKEN,
  STORAGE_PROVIDER_TOKEN
} from './nest.js';

describe('storage nest exports', () => {
  it('exports the NestJS package surface from the dedicated subpath', () => {
    assert.equal(typeof STORAGE_PROVIDER_TOKEN, 'string');
    assert.equal(typeof STORAGE_MODULE_OPTIONS, 'string');
    assert.equal(typeof StorageModule.forRoot, 'function');
    assert.equal(typeof StorageService, 'function');
    assert.equal(typeof STORAGE_PROVIDER_MAP_TOKEN, 'string');
    assert.equal(typeof StorageRegistryService, 'function');
    assert.equal(typeof DisabledStorageProvider, 'function');
  });
});
