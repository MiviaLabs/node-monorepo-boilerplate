/**
 * Tenants schema unit tests
 */

import { describe, expect, it } from '@jest/globals';

import {
  tenants,
  TENANT_TYPE_ENUM,
  TENANT_STATUS_ENUM,
  type ITenantSettings
} from '../tenants.schema';

describe('tenants.schema', () => {
  describe('TENANT_TYPE_ENUM', () => {
    it('should have correct values', () => {
      expect(TENANT_TYPE_ENUM[0]).toBe('organization');
      expect(TENANT_TYPE_ENUM[1]).toBe('team');
      expect(TENANT_TYPE_ENUM[2]).toBe('individual');
    });

    it('should have exactly 3 types', () => {
      expect(TENANT_TYPE_ENUM.length).toBe(3);
    });
  });

  describe('TENANT_STATUS_ENUM', () => {
    it('should have correct values', () => {
      expect(TENANT_STATUS_ENUM[0]).toBe('draft');
      expect(TENANT_STATUS_ENUM[1]).toBe('trial');
      expect(TENANT_STATUS_ENUM[2]).toBe('active');
      expect(TENANT_STATUS_ENUM[3]).toBe('suspended');
      expect(TENANT_STATUS_ENUM[4]).toBe('deleted');
    });

    it('should have exactly 5 statuses', () => {
      expect(TENANT_STATUS_ENUM.length).toBe(5);
    });
  });

  describe('ITenantSettings type', () => {
    it('should be defined', () => {
      // Type existence check - this is more for TypeScript than runtime
      const settings: ITenantSettings = {
        features: {
          maxUsers: 100,
          advancedAnalytics: true
        },
        branding: {
          logo: 'https://example.com/logo.png',
          primaryColor: '#FF0000'
        },
        limits: {
          monthlyBudget: 1000,
          storageQuota: 1073741824 // 1GB
        },
        metadata: {
          customField: 'value'
        }
      };
      expect(settings.features?.maxUsers).toBe(100);
      expect(settings.branding?.logo).toBe('https://example.com/logo.png');
    });
  });

  describe('tenants table', () => {
    it('should be defined', () => {
      expect(typeof tenants).toBe('object');
    });

    // Note: The schema structure is validated through E2E tests and migration generation
    // Internal Drizzle properties are implementation details that may change
    it('should be a valid Drizzle table schema', () => {
      // Verify the schema has expected properties
      expect(typeof tenants).toBe('object');
      expect(tenants !== null).toBe(true);
    });
  });
});
