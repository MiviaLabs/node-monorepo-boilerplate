/**
 * Unit tests for config resolver
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { InvalidTaskConfigError } from '../errors';
import { resolveConfig, validateConfig } from './config-resolver';
import { ENV_VARS } from './defaults';

describe('config-resolver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveConfig', () => {
    it('should resolve config from environment variables', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.QUEUE_NAME] = 'test-queue';

      const config = resolveConfig();

      assert.equal(config.projectId, 'test-project');
      assert.equal(config.location, 'us-central1');
      assert.equal(config.queueName, 'test-queue');
    });

    it('should throw when PROJECT_ID is missing', () => {
      process.env[ENV_VARS.LOCATION] = 'us-central1';

      assert.throws(
        () => resolveConfig(),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /CLOUD_TASKS_PROJECT_ID/);
          return true;
        }
      );
    });

    it('should throw when LOCATION is missing', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';

      assert.throws(
        () => resolveConfig(),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /CLOUD_TASKS_LOCATION/);
          return true;
        }
      );
    });

    it('should resolve credentials from key file', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.KEY_FILE] = '/path/to/key.json';

      const config = resolveConfig();

      assert.equal(config.credentials?.keyFile, '/path/to/key.json');
    });

    it('should resolve credentials from service account env vars', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.CLIENT_EMAIL] = 'test@example.com';
      process.env[ENV_VARS.PRIVATE_KEY] =
        '-----BEGIN RSA PRIVATE KEY-----\nprivate-key\n-----END RSA PRIVATE KEY-----';

      const config = resolveConfig();

      assert.equal(config.credentials?.clientEmail, 'test@example.com');
      assert.equal(
        config.credentials?.privateKey,
        '-----BEGIN RSA PRIVATE KEY-----\nprivate-key\n-----END RSA PRIVATE KEY-----'
      );
    });

    it('should throw when credentials are incomplete', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.CLIENT_EMAIL] = 'test@example.com';
      // Missing PRIVATE_KEY

      assert.throws(
        () => resolveConfig(),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /CLOUD_TASKS_KEY_FILE.*CLIENT_EMAIL.*PRIVATE_KEY/);
          return true;
        }
      );
    });

    it('should parse timeout from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.TIMEOUT] = '30000';

      const config = resolveConfig();

      assert.equal(config.timeout, 30000);
    });

    it('should parse maxRetries from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.MAX_RETRIES] = '5';

      const config = resolveConfig();

      assert.equal(config.maxRetries, 5);
    });

    it('should parse enableTracing from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.ENABLE_TRACING] = 'false';

      const config = resolveConfig();

      assert.equal(config.enableTracing, false);
    });

    it('should parse testMode from TEST_MODE env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      process.env[ENV_VARS.TEST_MODE] = 'true';

      const config = resolveConfig();

      assert.equal(config.testMode, true);
    });

    it('should use defaults when optional env vars are not set', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.LOCATION] = 'us-central1';
      // TEST_MODE is set by test script, so it defaults to true in test environment

      const config = resolveConfig();

      assert.equal(config.enableTracing, true);
      assert.equal(config.timeout, 60000);
      assert.equal(config.maxRetries, 3);
      // In test environment, TEST_MODE=true is set globally
      assert.equal(config.testMode, true);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = {
        projectId: 'test-project',
        location: 'us-central1',
        timeout: 30000,
        maxRetries: 5,
        enableTracing: true,
        testMode: false
      };

      assert.doesNotThrow(() => validateConfig(config));
    });

    it('should throw when projectId is missing', () => {
      const config = {
        projectId: '',
        location: 'us-central1'
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /projectId/);
          return true;
        }
      );
    });

    it('should throw when location is missing', () => {
      const config = {
        projectId: 'test-project',
        location: ''
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /location/);
          return true;
        }
      );
    });

    it('should throw when timeout is negative', () => {
      const config = {
        projectId: 'test-project',
        location: 'us-central1',
        timeout: -1
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /timeout/);
          return true;
        }
      );
    });

    it('should throw when maxRetries is negative', () => {
      const config = {
        projectId: 'test-project',
        location: 'us-central1',
        maxRetries: -1
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidTaskConfigError);
          assert.match(error.message, /maxRetries/);
          return true;
        }
      );
    });
  });
});
