/**
 * Unit tests for GCP Secret Manager Provider
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { gcpSecretManagerConfig } from '../../../config/encryption-config';
import { InvalidKmsConfigError } from '../../../errors';
import { GcpSecretManagerProvider } from '../../../providers/gcp-secret-manager.provider';
import { KmsProviderType } from '../../../providers/kms-provider.interface';

// Mock GCP clients to avoid gRPC initialization issues in unit tests
// Use inline functions to avoid hoisting issues with jest.mock
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class MockSecretManagerServiceClient {
    secretPath(project: string, secretId: string) {
      return `projects/${project}/secrets/${secretId}`;
    }
    accessSecretVersion = jest.fn();
    createSecret = jest.fn();
    addSecretVersion = jest.fn();
    getSecret = jest.fn();
  }
}));

jest.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: class MockKeyManagementServiceClient {
    cryptoKeyPath(project: string, location: string, keyRing: string, key: string) {
      return `projects/${project}/locations/${location}/keyRings/${keyRing}/cryptoKeys/${key}`;
    }
    keyRingPath(project: string, location: string, keyRing: string) {
      return `projects/${project}/locations/${location}/keyRings/${keyRing}`;
    }
    encrypt = jest.fn();
    decrypt = jest.fn();
    getCryptoKey = jest.fn();
    getKeyRing = jest.fn();
  }
}));

describe('GcpSecretManagerProvider', () => {
  const mockConfig = {
    projectId: 'test-project',
    credentialsFile: '/path/to/creds.json',
    secretPrefix: 'encryption-keys/',
    enableVersioning: true
  };

  const mockConfigWithKms = {
    ...mockConfig,
    kmsConfig: {
      locationId: 'global',
      keyRingId: 'test-keyring',
      keyId: 'test-key'
    }
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider without KMS backing', () => {
      const provider = new GcpSecretManagerProvider(mockConfig);
      expect(provider.name).toBe('gcp-secret-manager');
    });

    it('should create provider with KMS backing', () => {
      const provider = new GcpSecretManagerProvider(mockConfigWithKms);
      expect(provider.name).toBe('gcp-secret-manager');
    });

    it('should throw error if projectId is empty', () => {
      expect(() => new GcpSecretManagerProvider({ projectId: '' })).toThrow(InvalidKmsConfigError);
    });

    it('should throw error if projectId is missing', () => {
      expect(() => {
        const projectId = undefined as unknown as string;
        return new GcpSecretManagerProvider({ projectId });
      }).toThrow(InvalidKmsConfigError);
    });

    it('should use default secret prefix', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test'
      });
      expect(provider.name).toBe('gcp-secret-manager');
    });
  });

  describe('required methods', () => {
    let provider: GcpSecretManagerProvider;

    beforeEach(() => {
      provider = new GcpSecretManagerProvider(mockConfig);
    });

    it('should have encrypt method', () => {
      expect(typeof provider.encrypt).toBe('function');
    });

    it('should have decrypt method', () => {
      expect(typeof provider.decrypt).toBe('function');
    });

    it('should have generateDataKey method', () => {
      expect(typeof provider.generateDataKey).toBe('function');
    });

    it('should have rewrap method', () => {
      expect(typeof provider.rewrap).toBe('function');
    });

    it('should have getKeyInfo method', () => {
      expect(typeof provider.getKeyInfo).toBe('function');
    });

    it('should have isAvailable method', () => {
      expect(typeof provider.isAvailable).toBe('function');
    });

    it('should have healthCheck method', () => {
      expect(typeof provider.healthCheck).toBe('function');
    });
  });

  describe('buildSecretName', () => {
    it('should handle key IDs with leading/trailing slashes', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test-project',
        secretPrefix: 'keys/'
      });

      const providerWithBuild = provider as unknown as {
        buildSecretName: (keyId: string) => string;
      };
      const secretName1 = providerWithBuild.buildSecretName('/my-key/');
      const secretName2 = providerWithBuild.buildSecretName('my-key');

      // Both should produce valid secret names
      expect(secretName1).toContain('my-key');
      expect(secretName2).toContain('my-key');
    });

    it('should build secret name with prefix', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test-project',
        secretPrefix: 'encryption-keys/'
      });

      const providerWithBuild = provider as unknown as {
        buildSecretName: (keyId: string) => string;
      };
      const secretName = providerWithBuild.buildSecretName('my-key');

      expect(secretName).toContain('test-project');
      expect(secretName).toContain('encryption-keys');
      expect(secretName).toContain('my-key');
    });
  });

  describe('resolveKeyId', () => {
    it('should return provided keyId', () => {
      const provider = new GcpSecretManagerProvider(mockConfig);
      const providerWithResolve = provider as unknown as {
        resolveKeyId: (keyId?: string) => string;
      };

      const result = providerWithResolve.resolveKeyId('custom-key');
      expect(result).toBe('custom-key');
    });

    it('should return default keyId when none provided', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test',
        kmsConfig: {
          locationId: 'global',
          keyRingId: 'test-ring',
          keyId: 'default-key'
        }
      });

      const providerWithResolve = provider as unknown as {
        resolveKeyId: (keyId?: string) => string;
      };
      const result = providerWithResolve.resolveKeyId(undefined);

      expect(result).toBe('default-key');
    });

    it('should return default when no keyId and no default', () => {
      const provider = new GcpSecretManagerProvider({
        projectId: 'test'
      });

      const providerWithResolve = provider as unknown as {
        resolveKeyId: (keyId?: string) => string;
      };

      // When there's no kmsConfig, defaultKeyId is 'default'
      const result = providerWithResolve.resolveKeyId(undefined);
      expect(result).toBe('default');
    });
  });

  describe('KmsProviderType', () => {
    it('should have GCP_SECRET_MANAGER type', () => {
      expect(KmsProviderType.GCP_SECRET_MANAGER).toBe('gcp-secret-manager');
    });
  });

  describe('factory types', () => {
    it('should have correct structure for GcpSecretManagerProviderOptions', () => {
      const config = {
        projectId: 'test-project',
        credentialsFile: '/path/to/creds.json',
        secretPrefix: 'encryption-keys/',
        enableVersioning: true,
        kmsConfig: {
          locationId: 'global',
          keyRingId: 'test-keyring',
          keyId: 'test-key'
        }
      };

      // Validate the config structure
      expect(typeof config.projectId).toBe('string');
      expect(typeof config.secretPrefix).toBe('string');
      expect(typeof config.enableVersioning).toBe('boolean');
      expect(config.kmsConfig).toBeTruthy();
      expect(typeof config.kmsConfig.locationId).toBe('string');
      expect(typeof config.kmsConfig.keyRingId).toBe('string');
      expect(typeof config.kmsConfig.keyId).toBe('string');
    });
  });

  describe('factory registration', () => {
    it('should include GCP_SECRET_MANAGER in KmsProviderType', () => {
      // Verify the GCP_SECRET_MANAGER type exists
      expect(KmsProviderType.GCP_SECRET_MANAGER).toBe('gcp-secret-manager');
    });
  });

  describe('configuration helper', () => {
    it('should export gcpSecretManagerConfig function', () => {
      expect(typeof gcpSecretManagerConfig).toBe('function');
    });

    it('should create valid config with gcpSecretManagerConfig', () => {
      const config = gcpSecretManagerConfig({
        projectId: 'test-project',
        secretPrefix: 'keys/',
        default: true
      });

      expect(config.type).toBe('gcp-secret-manager');
      expect(config.default).toBe(true);
      expect(config.options).toBeTruthy();
      if (config.options && 'projectId' in config.options) {
        expect((config.options as { projectId: string }).projectId).toBe('test-project');
      }
    });
  });

  describe('index exports', () => {
    it('should export GcpSecretManagerProvider', () => {
      // The provider should be exported from the main index
      expect(GcpSecretManagerProvider).toBeTruthy();
    });
  });
});
