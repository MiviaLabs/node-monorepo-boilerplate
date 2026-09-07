/**
 * Unit tests for config resolver
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { InvalidPubSubConfigError } from '../errors';
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
      process.env[ENV_VARS.TOPIC_NAME] = 'test-topic';
      process.env[ENV_VARS.SUBSCRIPTION_NAME] = 'test-subscription';

      const config = resolveConfig();

      assert.equal(config.projectId, 'test-project');
      assert.equal(config.topicName, 'test-topic');
      assert.equal(config.subscriptionName, 'test-subscription');
    });

    it('should throw when PROJECT_ID is missing', () => {
      assert.throws(
        () => resolveConfig(),
        (error: Error) => {
          assert(error instanceof InvalidPubSubConfigError);
          assert.match(error.message, /PUBSUB_PROJECT_ID/);
          return true;
        }
      );
    });

    it('should resolve credentials from key file', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.KEY_FILE] = '/path/to/key.json';

      const config = resolveConfig();

      assert.equal(config.credentials?.keyFile, '/path/to/key.json');
    });

    it('should resolve credentials from service account env vars', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.CLIENT_EMAIL] = 'test@example.com';
      process.env[ENV_VARS.PRIVATE_KEY] = 'private-key';

      const config = resolveConfig();

      assert.equal(config.credentials?.clientEmail, 'test@example.com');
      assert.equal(config.credentials?.privateKey, 'private-key');
    });

    it('should throw when credentials are incomplete', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.CLIENT_EMAIL] = 'test@example.com';
      // Missing PRIVATE_KEY

      assert.throws(
        () => resolveConfig(),
        (error: Error) => {
          assert(error instanceof InvalidPubSubConfigError);
          assert.match(error.message, /PUBSUB_KEY_FILE.*CLIENT_EMAIL.*PRIVATE_KEY/);
          return true;
        }
      );
    });

    it('should parse timeout from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.TIMEOUT] = '30000';

      const config = resolveConfig();

      assert.equal(config.timeout, 30000);
    });

    it('should parse maxRetries from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.MAX_RETRIES] = '5';

      const config = resolveConfig();

      assert.equal(config.maxRetries, 5);
    });

    it('should parse enableTracing from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.ENABLE_TRACING] = 'false';

      const config = resolveConfig();

      assert.equal(config.enableTracing, false);
    });

    it('should parse testMode from PUBSUB_TEST_MODE env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.TEST_MODE] = 'true';

      const config = resolveConfig();

      assert.equal(config.testMode, true);
    });

    it('should parse ackDeadline from env var', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      process.env[ENV_VARS.ACK_DEADLINE] = '120';

      const config = resolveConfig();

      assert.equal(config.defaultAckDeadlineSeconds, 120);
    });

    it('should_use_defaults_when_optional_env_vars_not_set', () => {
      process.env[ENV_VARS.PROJECT_ID] = 'test-project';
      // Explicitly unset optional env vars to test default behavior
      delete process.env[ENV_VARS.TEST_MODE];
      delete process.env[ENV_VARS.ENABLE_TRACING];
      delete process.env[ENV_VARS.TIMEOUT];
      delete process.env[ENV_VARS.MAX_RETRIES];
      delete process.env[ENV_VARS.ACK_DEADLINE];

      const config = resolveConfig();

      assert.equal(config.enableTracing, true);
      assert.equal(config.timeout, 60000);
      assert.equal(config.maxRetries, 3);
      assert.equal(config.testMode, false); // Default is false when not set
      assert.equal(config.defaultAckDeadlineSeconds, 60);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = {
        projectId: 'test-project',
        timeout: 30000,
        maxRetries: 5,
        enableTracing: true,
        testMode: false,
        defaultAckDeadlineSeconds: 60
      };

      assert.doesNotThrow(() => validateConfig(config));
    });

    it('should throw when projectId is missing', () => {
      const config = {
        projectId: ''
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidPubSubConfigError);
          assert.match(error.message, /projectId/);
          return true;
        }
      );
    });

    it('should throw when timeout is negative', () => {
      const config = {
        projectId: 'test-project',
        timeout: -1
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidPubSubConfigError);
          assert.match(error.message, /timeout/);
          return true;
        }
      );
    });

    it('should throw when maxRetries is negative', () => {
      const config = {
        projectId: 'test-project',
        maxRetries: -1
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidPubSubConfigError);
          assert.match(error.message, /maxRetries/);
          return true;
        }
      );
    });

    it('should throw when defaultAckDeadlineSeconds is negative', () => {
      const config = {
        projectId: 'test-project',
        defaultAckDeadlineSeconds: -1
      };

      assert.throws(
        () => validateConfig(config),
        (error: Error) => {
          assert(error instanceof InvalidPubSubConfigError);
          assert.match(error.message, /defaultAckDeadlineSeconds/);
          return true;
        }
      );
    });
  });
});
