/**
 * Unit tests for Auth Provider Factory
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, after } from 'node:test';

import { AuthProviderType } from '../../../constants';
import { createMockKeycloakProvider } from '../../../providers/__mocks__/keycloak-mock.provider';
import {
  AuthProviderFactory,
  authProviderFactory,
  getAuthProvider,
  getDefaultAuthProvider
} from '../../../providers/factory';

describe('AuthProviderFactory', () => {
  let factory: AuthProviderFactory;

  beforeEach(() => {
    factory = new AuthProviderFactory();
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = createMockKeycloakProvider({ name: 'test-provider' });
      factory.registerProvider('test', provider);

      const retrieved = factory.getProvider('test');
      assert.strictEqual(retrieved, provider);
    });

    it('should register a provider as default', () => {
      const provider = createMockKeycloakProvider({ name: 'default-provider' });
      factory.registerProvider(AuthProviderType.KEYCLOAK, provider, true);

      const retrieved = factory.getDefaultProvider();
      assert.strictEqual(retrieved, provider);
    });

    it('should not overwrite existing provider', () => {
      const provider1 = createMockKeycloakProvider({ name: 'provider-1' });
      const provider2 = createMockKeycloakProvider({ name: 'provider-2' });

      factory.registerProvider('test', provider1);
      factory.registerProvider('test', provider2);

      const retrieved = factory.getProvider('test');
      assert.strictEqual(retrieved, provider1);
    });
  });

  describe('getProvider', () => {
    it('should return undefined for non-existent provider', () => {
      const provider = factory.getProvider('non-existent');
      assert.strictEqual(provider, undefined);
    });

    it('should return registered provider', () => {
      const provider = createMockKeycloakProvider({ name: 'test' });
      factory.registerProvider('test', provider);

      const retrieved = factory.getProvider('test');
      assert.strictEqual(retrieved, provider);
    });
  });

  describe('getDefaultProvider', () => {
    it('should return the default provider', () => {
      const defaultProvider = createMockKeycloakProvider({ name: 'default' });
      const otherProvider = createMockKeycloakProvider({ name: 'other' });

      factory.registerProvider(AuthProviderType.KEYCLOAK, defaultProvider, true);
      factory.registerProvider('other', otherProvider, false);

      const retrieved = factory.getDefaultProvider();
      assert.strictEqual(retrieved, defaultProvider);
    });

    it('should return first provider if no explicit default', () => {
      const provider1 = createMockKeycloakProvider({ name: 'first' });
      const provider2 = createMockKeycloakProvider({ name: 'second' });

      factory.registerProvider('first', provider1);
      factory.registerProvider('second', provider2);

      const retrieved = factory.getDefaultProvider();
      assert.strictEqual(retrieved, provider1);
    });

    it('should return undefined if no providers', () => {
      const retrieved = factory.getDefaultProvider();
      assert.strictEqual(retrieved, undefined);
    });
  });

  describe('getProviderNames', () => {
    it('should return empty array when no providers', () => {
      const names = factory.getProviderNames();
      assert.deepStrictEqual(names, []);
    });

    it('should return all provider names', () => {
      factory.registerProvider('provider-1', createMockKeycloakProvider({ name: 'p1' }));
      factory.registerProvider('provider-2', createMockKeycloakProvider({ name: 'p2' }));
      factory.registerProvider('provider-3', createMockKeycloakProvider({ name: 'p3' }));

      const names = factory.getProviderNames();
      assert.strictEqual(names.length, 3);
      assert.ok(names.includes('provider-1'));
      assert.ok(names.includes('provider-2'));
      assert.ok(names.includes('provider-3'));
    });
  });

  describe('clearProviders', () => {
    it('should clear all providers', () => {
      factory.registerProvider('p1', createMockKeycloakProvider({ name: 'p1' }));
      factory.registerProvider('p2', createMockKeycloakProvider({ name: 'p2' }));

      factory.clearProviders();

      assert.strictEqual(factory.getProvider('p1'), undefined);
      assert.strictEqual(factory.getProvider('p2'), undefined);
      assert.strictEqual(factory.getProviderNames().length, 0);
    });
  });

  describe('healthCheckAll', () => {
    it('should return health status for all providers', async () => {
      const provider1 = createMockKeycloakProvider({ name: 'p1' });
      const provider2 = createMockKeycloakProvider({ name: 'p2' });

      factory.registerProvider('p1', provider1);
      factory.registerProvider('p2', provider2);

      const results = await factory.healthCheckAll();

      assert.deepStrictEqual(results, {
        p1: true,
        p2: true
      });
    });
  });
});

describe('Global factory helpers', () => {
  it('should use global factory instance', () => {
    const provider = createMockKeycloakProvider({ name: 'test' });
    authProviderFactory.registerProvider('test', provider);

    const retrieved = getAuthProvider('test');
    assert.strictEqual(retrieved, provider);
  });

  it('should get default provider from global factory', () => {
    const provider = createMockKeycloakProvider({ name: 'default' });
    authProviderFactory.registerProvider(AuthProviderType.KEYCLOAK, provider, true);

    const retrieved = getDefaultAuthProvider();
    assert.strictEqual(retrieved, provider);
  });

  after(() => {
    authProviderFactory.clearProviders();
  });
});
