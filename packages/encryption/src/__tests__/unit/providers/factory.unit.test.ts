/**
 * Unit tests for KMS Provider Factory
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  jest
} from '@jest/globals';
import { randomBytes } from 'node:crypto';

import { createMockKmsProvider } from '../../../__mocks__/kms-mock';
import {
  KmsProviderFactory,
  kmsProviderFactory,
  getKmsProvider,
  getDefaultKmsProvider
} from '../../../providers/factory';
import { KmsProviderType } from '../../../providers/kms-provider.interface';

function generateTestKey() {
  return randomBytes(32).toString('hex');
}

describe('KmsProviderFactory', () => {
  let factory: KmsProviderFactory;

  beforeEach(() => {
    factory = new KmsProviderFactory();
  });

  afterEach(() => {
    jest.clearAllMocks();
    factory.clearProviders();
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = createMockKmsProvider({ name: 'test-provider' });
      factory.registerProvider('test', provider);

      const retrieved = factory.getProvider('test');
      expect(retrieved).toBe(provider);
    });

    it('should register a provider as default', () => {
      const provider = createMockKmsProvider({ name: 'default-provider' });
      factory.registerProvider('default', provider, true);

      const retrieved = factory.getDefaultProvider();
      expect(retrieved).toBe(provider);
    });

    it('should not overwrite existing provider', () => {
      const provider1 = createMockKmsProvider({ name: 'provider-1' });
      const provider2 = createMockKmsProvider({ name: 'provider-2' });

      factory.registerProvider('test', provider1);
      factory.registerProvider('test', provider2);

      const retrieved = factory.getProvider('test');
      expect(retrieved).toBe(provider1);
    });
  });

  describe('getProvider', () => {
    it('should return undefined for non-existent provider', () => {
      const provider = factory.getProvider('non-existent');
      expect(provider).toBeUndefined();
    });

    it('should return registered provider', () => {
      const provider = createMockKmsProvider({ name: 'test' });
      factory.registerProvider('test', provider);

      const retrieved = factory.getProvider('test');
      expect(retrieved).toBe(provider);
    });
  });

  describe('getDefaultProvider', () => {
    it('should return the default provider', () => {
      const defaultProvider = createMockKmsProvider({ name: 'default' });
      const otherProvider = createMockKmsProvider({ name: 'other' });

      factory.registerProvider('default', defaultProvider, true);
      factory.registerProvider('other', otherProvider, false);

      const retrieved = factory.getDefaultProvider();
      expect(retrieved).toBe(defaultProvider);
    });

    it('should return first provider if no explicit default', () => {
      const provider1 = createMockKmsProvider({ name: 'first' });
      const provider2 = createMockKmsProvider({ name: 'second' });

      factory.registerProvider('first', provider1);
      factory.registerProvider('second', provider2);

      const retrieved = factory.getDefaultProvider();
      expect(retrieved).toBe(provider1);
    });

    it('should return undefined if no providers', () => {
      const retrieved = factory.getDefaultProvider();
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getProviderNames', () => {
    it('should return empty array when no providers', () => {
      const names = factory.getProviderNames();
      expect(names).toEqual([]);
    });

    it('should return all provider names', () => {
      factory.registerProvider('provider-1', createMockKmsProvider({ name: 'p1' }));
      factory.registerProvider('provider-2', createMockKmsProvider({ name: 'p2' }));
      factory.registerProvider('provider-3', createMockKmsProvider({ name: 'p3' }));

      const names = factory.getProviderNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('provider-1');
      expect(names).toContain('provider-2');
      expect(names).toContain('provider-3');
    });
  });

  describe('clearProviders', () => {
    it('should clear all providers', () => {
      factory.registerProvider('p1', createMockKmsProvider({ name: 'p1' }));
      factory.registerProvider('p2', createMockKmsProvider({ name: 'p2' }));

      factory.clearProviders();

      expect(factory.getProvider('p1')).toBeUndefined();
      expect(factory.getProvider('p2')).toBeUndefined();
      expect(factory.getProviderNames()).toHaveLength(0);
    });
  });

  describe('healthCheckAll', () => {
    it('should return health status for all providers', async () => {
      const provider1 = createMockKmsProvider({ name: 'p1' });
      const provider2 = createMockKmsProvider({ name: 'p2' });

      factory.registerProvider('p1', provider1);
      factory.registerProvider('p2', provider2);

      const results = await factory.healthCheckAll();

      expect(results).toEqual({
        p1: true,
        p2: true
      });
    });
  });
});

describe('Global factory helpers', () => {
  beforeEach(() => {
    kmsProviderFactory.clearProviders();
  });

  afterAll(() => {
    kmsProviderFactory.clearProviders();
  });

  it('should use global factory instance', () => {
    const provider = createMockKmsProvider({ name: 'test' });
    kmsProviderFactory.registerProvider('test', provider);

    const retrieved = getKmsProvider('test');
    expect(retrieved).toBe(provider);
  });

  it('should get default provider from global factory', () => {
    const provider = createMockKmsProvider({ name: 'default' });
    kmsProviderFactory.registerProvider('default', provider, true);

    const retrieved = getDefaultKmsProvider();
    expect(retrieved).toBe(provider);
  });
});

describe('createProvider - EnvVar', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let testKey: string;

  beforeAll(() => {
    testKey = generateTestKey();
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
    kmsProviderFactory.clearProviders();
  });

  it('should create EnvVarProvider from config', async () => {
    const factory = new KmsProviderFactory();

    const provider = await factory.createProvider({
      type: KmsProviderType.ENV_VAR,
      options: {
        encryptionKey: testKey
      }
    });

    expect(provider.name).toBe('env-var');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should register EnvVarProvider', async () => {
    const factory = new KmsProviderFactory();

    await factory.registerProviderConfig({
      type: KmsProviderType.ENV_VAR,
      default: true,
      options: {
        encryptionKey: testKey
      }
    });

    const provider = factory.getDefaultProvider();
    expect(provider).toBeTruthy();
    expect(provider!.name).toBe('env-var');
  });

  it('should create and register multiple providers including EnvVar', async () => {
    const factory = new KmsProviderFactory();

    await factory.registerProviderConfigs([
      {
        type: KmsProviderType.ENV_VAR,
        default: true,
        options: {
          encryptionKey: testKey
        }
      }
    ]);

    const provider = factory.getDefaultProvider();
    expect(provider).toBeTruthy();
    expect(provider!.name).toBe('env-var');
  });
});
