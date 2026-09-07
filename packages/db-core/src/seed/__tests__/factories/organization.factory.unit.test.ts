/**
 * Unit Tests for Organization Factory
 *
 * Tests organization seed data factory.
 */

import { describe, expect, it } from '@jest/globals';

import { createTestOrganization } from '../../factories/organization.factory';

import type { NewOrganization } from '../../../schemas';

describe('Organization Factory', () => {
  describe('createTestOrganization', () => {
    it('should create organization with [SEED-TEST] prefix in name', () => {
      // Act
      const org = createTestOrganization({ tenantId: 1 });

      // Assert
      expect(org.name).toMatch(/^\[SEED-TEST\] Organization /);
    });

    it('should create organization with unique name for each call', () => {
      // Act
      const org1 = createTestOrganization({ tenantId: 1 });
      const org2 = createTestOrganization({ tenantId: 1 });

      // Assert
      expect(org1.name).not.toBe(org2.name);
    });

    it('should create active organization by default', () => {
      // Act
      const org = createTestOrganization({ tenantId: 1 });

      // Assert
      expect(org.isActive).toBe(true);
    });

    it('should merge provided overrides', () => {
      // Arrange
      const overrides: Partial<NewOrganization> = {
        name: 'Test Org',
        slug: 'test-org',
        isActive: false
      };

      // Act
      const org = createTestOrganization(overrides);

      // Assert
      expect(org.name).toBe('Test Org');
      expect(org.slug).toBe('test-org');
      expect(org.isActive).toBe(false);
    });

    it('should create slug from name when not provided', () => {
      // Act
      const org = createTestOrganization({
        name: '[SEED-TEST] Organization abc123'
      });

      // Assert
      expect(org.slug).toBeDefined();
      expect(typeof org.slug).toBe('string');
      expect(org.slug.length).toBeGreaterThan(0);
    });
  });
});
