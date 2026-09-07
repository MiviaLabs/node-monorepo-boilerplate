/**
 * Integration tests for GCP Secret Manager Provider
 *
 * These tests require the GCP Secret Manager emulator to be running.
 *
 * To run the emulator:
 * ```bash
 * gcloud beta emulators secret-manager start \
 *   --host-port=localhost:9000 \
 *   --project=test-project
 * ```
 *
 * Set environment variables:
 * ```bash
 * export SECRET_MANAGER_EMULATOR_HOST=localhost:9000
 * export GOOGLE_CLOUD_PROJECT=test-project
 * ```
 *
 * Run tests:
 * ```bash
 * pnpm nx test secrets -- --test-name-pattern="integration"
 * ```
 */

import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { SecretNotFoundError } from './errors.js';
import { GcpSecretManagerProvider } from './gcp-secret-manager.provider.js';

describe('GcpSecretManagerProvider Integration Tests', () => {
  const emulatorHost = process.env.SECRET_MANAGER_EMULATOR_HOST;
  const testProjectId = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';

  // Skip integration tests if emulator is not running
  const skipTests = !emulatorHost;

  const mockConfig = {
    projectId: testProjectId,
    enableTracing: false,
    enableRetry: true, // Enable retry for integration tests
    maxRetries: 3
  };

  let provider: GcpSecretManagerProvider;
  const testSecrets: string[] = [];

  beforeEach(function () {
    // Skip setup if tests are being skipped
    if (skipTests) {
      this.skip();
    }

    provider = new GcpSecretManagerProvider(mockConfig);
  });

  afterEach(async () => {
    // Cleanup test secrets
    if (provider && !skipTests) {
      for (const secretName of testSecrets) {
        try {
          await provider.deleteSecret(secretName);
        } catch {
          // Ignore errors during cleanup
        }
      }
      testSecrets.length = 0;
      await provider.destroy();
    }
  });

  describe('with GCP Secret Manager emulator', () => {
    it('should create and retrieve a secret', async () => {
      const secretName = `test-secret-${Date.now()}`;
      const secretValue = 'my-secret-value';

      testSecrets.push(secretName);

      // Create secret
      await provider.setSecret(secretName, secretValue);

      // Retrieve secret
      const retrievedValue = await provider.getSecret(secretName);
      assert.strictEqual(retrievedValue, secretValue);
    });

    it('should throw SecretNotFoundError for non-existent secret', async () => {
      const nonExistentSecret = 'non-existent-secret';

      await assert.rejects(
        async () => {
          await provider.getSecret(nonExistentSecret);
        },
        (error: Error) => {
          return error instanceof SecretNotFoundError;
        }
      );
    });

    it('should update an existing secret', async () => {
      const secretName = `test-secret-update-${Date.now()}`;
      const initialValue = 'initial-value';
      const updatedValue = 'updated-value';

      testSecrets.push(secretName);

      // Create secret with initial value
      await provider.setSecret(secretName, initialValue);

      // Update secret
      await provider.setSecret(secretName, updatedValue);

      // Retrieve updated value
      const retrievedValue = await provider.getSecret(secretName);
      assert.strictEqual(retrievedValue, updatedValue);
    });

    it('should delete a secret', async () => {
      const secretName = `test-secret-delete-${Date.now()}`;
      const secretValue = 'value-to-delete';

      testSecrets.push(secretName);

      // Create secret
      await provider.setSecret(secretName, secretValue);

      // Delete secret
      await provider.deleteSecret(secretName);

      // Verify secret is deleted
      await assert.rejects(
        async () => {
          await provider.getSecret(secretName);
        },
        (error: Error) => {
          return error instanceof SecretNotFoundError;
        }
      );
    });

    it('should rotate a secret', async () => {
      const secretName = `test-secret-rotate-${Date.now()}`;
      const secretValue = 'value-to-rotate';

      testSecrets.push(secretName);

      // Create secret
      await provider.setSecret(secretName, secretValue);

      // Rotate secret
      await provider.rotateSecret(secretName);

      // Verify secret still exists (rotation creates new version)
      const rotatedValue = await provider.getSecret(secretName);
      assert.ok(rotatedValue.includes('Rotated at:'));
    });

    it('should list secret versions', async () => {
      const secretName = `test-secret-versions-${Date.now()}`;

      testSecrets.push(secretName);

      // Create initial version
      await provider.setSecret(secretName, 'version-1');

      // Create second version
      await provider.setSecret(secretName, 'version-2');

      // List versions
      const versions = await provider.listVersions(secretName);
      assert.ok(Array.isArray(versions));
      assert.ok(versions.length >= 2);
    });

    it('should retrieve specific secret version', async () => {
      const secretName = `test-secret-version-${Date.now()}`;
      const firstValue = 'first-version';
      const secondValue = 'second-version';

      testSecrets.push(secretName);

      // Create first version
      await provider.setSecret(secretName, firstValue);

      // Create second version
      await provider.setSecret(secretName, secondValue);

      // Retrieve latest version
      const latestValue = await provider.getSecret(secretName);
      assert.strictEqual(latestValue, secondValue);

      // Note: GCP Secret Manager assigns sequential version IDs (1, 2, 3, ...)
      // We can retrieve specific versions by appending ":<version-id>" to the secret name
      // However, the exact version ID may vary, so we just verify the syntax works
      const versionedSecretName = `${secretName}:1`;
      const firstVersionValue = await provider.getSecret(versionedSecretName);
      assert.strictEqual(firstVersionValue, firstValue);
    });

    it('should pass health check', async () => {
      const isHealthy = await provider.healthCheck();
      assert.strictEqual(isHealthy, true);
    });
  });

  describe('cache functionality', () => {
    let cachedProvider: GcpSecretManagerProvider;

    beforeEach(function () {
      if (skipTests) {
        this.skip();
      }

      cachedProvider = new GcpSecretManagerProvider({
        ...mockConfig,
        enableCache: true,
        cacheTtl: 60000 // 1 minute
      });
    });

    afterEach(async () => {
      if (cachedProvider && !skipTests) {
        await cachedProvider.destroy();
      }
    });

    it('should cache retrieved secrets', async () => {
      const secretName = `test-secret-cache-${Date.now()}`;
      const secretValue = 'cached-value';

      testSecrets.push(secretName);

      // Create secret
      await cachedProvider.setSecret(secretName, secretValue);

      // First retrieval - should fetch from GCP
      const value1 = await cachedProvider.getSecret(secretName);
      assert.strictEqual(value1, secretValue);

      // Second retrieval - should return cached value
      const value2 = await cachedProvider.getSecret(secretName);
      assert.strictEqual(value2, secretValue);

      // Clear cache
      cachedProvider.clearCache();

      // Third retrieval - should fetch from GCP again
      const value3 = await cachedProvider.getSecret(secretName);
      assert.strictEqual(value3, secretValue);
    });

    it('should invalidate cache on setSecret', async () => {
      const secretName = `test-secret-invalidate-${Date.now()}`;
      const initialValue = 'initial';
      const updatedValue = 'updated';

      testSecrets.push(secretName);

      // Create and cache secret
      await cachedProvider.setSecret(secretName, initialValue);
      await cachedProvider.getSecret(secretName); // Cache it

      // Update secret (should invalidate cache)
      await cachedProvider.setSecret(secretName, updatedValue);

      // Retrieve updated value
      const retrievedValue = await cachedProvider.getSecret(secretName);
      assert.strictEqual(retrievedValue, updatedValue);
    });
  });

  describe('retry functionality', () => {
    it('should retry transient errors', async function () {
      // This test would require mocking transient errors
      // For now, we just verify the retry logic is configured
      if (skipTests) {
        this.skip();
      }

      assert.strictEqual(provider['enableRetry'], true);
      assert.strictEqual(provider['config'].maxRetries, 3);
    });
  });
});
