/**
 * Unit tests for the Cloud Tasks provider factory
 *
 * Covers precedence/inversion bugs in the exported factory functions.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMockCloudTasksProvider } from './provider-factory';
import { MockCloudTasksProvider } from './mock-provider';

// Helper: capture the config the mock provider received so we can assert
// on the factory's precedence rules.
function captureConfig(provider: MockCloudTasksProvider): {
  testMode?: boolean;
  projectId?: string;
  location?: string;
  queueName?: string;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (provider as any)._config;
}

describe('createMockCloudTasksProvider', () => {
  it('returns a MockCloudTasksProvider even when caller passes testMode: false', () => {
    // Bug: provider-factory.ts spreads ...config AFTER testMode: true,
    // so a caller-supplied testMode: false silently overrides the mock intent.
    const provider = createMockCloudTasksProvider({ testMode: false });

    assert.ok(
      provider instanceof MockCloudTasksProvider,
      'createMockCloudTasksProvider must always return a MockCloudTasksProvider'
    );
    assert.equal(
      captureConfig(provider).testMode,
      true,
      'mock factory must enforce testMode: true; caller-supplied testMode must not override'
    );
  });

  it('returns a MockCloudTasksProvider when called with no arguments', () => {
    const provider = createMockCloudTasksProvider();

    assert.ok(provider instanceof MockCloudTasksProvider);
    assert.equal(captureConfig(provider).testMode, true);
    assert.equal(captureConfig(provider).projectId, 'test-project');
    assert.equal(captureConfig(provider).location, 'us-central1');
  });

  it('applies sensible defaults when caller passes a partial config', () => {
    const provider = createMockCloudTasksProvider({
      projectId: 'override-project',
      location: 'europe-west1'
    });

    assert.ok(provider instanceof MockCloudTasksProvider);
    const cfg = captureConfig(provider);
    assert.equal(cfg.projectId, 'override-project');
    assert.equal(cfg.location, 'europe-west1');
    assert.equal(cfg.testMode, true);
  });
});
