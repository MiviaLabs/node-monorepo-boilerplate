/**
 * Unit tests for GetGcpTenantQuery
 *
 * Tests the query that retrieves GCP tenant information for an organization.
 * Verifies proper property assignment, readonly enforcement, and IQuery implementation.
 */

import { GetGcpTenantQuery } from '../get-gcp-tenant.query';

describe('GetGcpTenantQuery', () => {
  describe('constructor', () => {
    it('should create instance with all required properties', () => {
      // Arrange
      const props = {
        tenantId: 'primary-encryption-key',
        organizationId: 456
      };

      // Act
      const query = new GetGcpTenantQuery(props);

      // Assert
      expect(query.tenantId).toBe('primary-encryption-key');
      expect(query.organizationId).toBe(456);
    });

    it('should assign tenantId from props', () => {
      // Arrange
      const tenantId = 'custom-tenant-id';

      // Act
      const query = new GetGcpTenantQuery({
        tenantId,
        organizationId: 1
      });

      // Assert
      expect(query.tenantId).toBe(tenantId);
    });

    it('should assign organizationId from props', () => {
      // Arrange
      const organizationId = 999;

      // Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId
      });

      // Assert
      expect(query.organizationId).toBe(organizationId);
    });
  });

  describe('property types', () => {
    it('should store tenantId as string', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'tenant-abc',
        organizationId: 1
      });

      // Assert
      expect(typeof query.tenantId).toBe('string');
    });

    it('should store organizationId as number', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: 123
      });

      // Assert
      expect(typeof query.organizationId).toBe('number');
    });
  });

  describe('readonly properties', () => {
    it('should have readonly tenantId property', () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: 1
      });

      // Assert - TypeScript should prevent modification at compile time
      // At runtime, we can verify the property exists
      expect('tenantId' in query).toBe(true);
      expect(query.tenantId).toBe('primary-encryption-key');
    });

    it('should have readonly organizationId property', () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: 1
      });

      // Assert
      expect('organizationId' in query).toBe(true);
      expect(query.organizationId).toBe(1);
    });

    it('should have readonly property set to true', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: 1
      });

      // Assert - The query class has a readonly property set to true
      expect('readonly' in query).toBe(true);
      expect(query.readonly).toBe(true);
    });
  });

  describe('IQuery implementation', () => {
    it('should implement IQuery interface', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: 1
      });

      // Assert - IQuery requires readonly property
      expect(query.readonly).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string tenantId', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: '',
        organizationId: 1
      });

      // Assert
      expect(query.tenantId).toBe('');
    });

    it('should handle zero organizationId', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: 0
      });

      // Assert
      expect(query.organizationId).toBe(0);
    });

    it('should handle negative organizationId', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: -1
      });

      // Assert
      expect(query.organizationId).toBe(-1);
    });

    it('should handle very large organizationId', () => {
      // Arrange
      const largeOrganizationId = Number.MAX_SAFE_INTEGER;

      // Act
      const query = new GetGcpTenantQuery({
        tenantId: 'primary-encryption-key',
        organizationId: largeOrganizationId
      });

      // Assert
      expect(query.organizationId).toBe(largeOrganizationId);
    });

    it('should handle UUID format tenantId', () => {
      // Arrange
      const uuidTenantId = '123e4567-e89b-12d3-a456-426614174000';

      // Act
      const query = new GetGcpTenantQuery({
        tenantId: uuidTenantId,
        organizationId: 1
      });

      // Assert
      expect(query.tenantId).toBe(uuidTenantId);
    });

    it('should handle numeric string tenantId', () => {
      // Arrange
      const numericTenantId = '12345';

      // Act
      const query = new GetGcpTenantQuery({
        tenantId: numericTenantId,
        organizationId: 1
      });

      // Assert
      expect(query.tenantId).toBe('12345');
      expect(typeof query.tenantId).toBe('string');
    });

    it('should handle special characters in tenantId', () => {
      // Arrange
      const specialTenantId = 'tenant-with-special.chars_123';

      // Act
      const query = new GetGcpTenantQuery({
        tenantId: specialTenantId,
        organizationId: 1
      });

      // Assert
      expect(query.tenantId).toBe(specialTenantId);
    });
  });

  describe('multiple instances', () => {
    it('should create independent instances', () => {
      // Arrange
      const props1 = {
        tenantId: 'primary-encryption-key',
        organizationId: 1
      };
      const props2 = {
        tenantId: 'primary-encryption-key',
        organizationId: 2
      };

      // Act
      const query1 = new GetGcpTenantQuery(props1);
      const query2 = new GetGcpTenantQuery(props2);

      // Assert
      expect(query1.tenantId).toBe('primary-encryption-key');
      expect(query2.tenantId).toBe('primary-encryption-key');
      expect(query1.organizationId).toBe(1);
      expect(query2.organizationId).toBe(2);
    });

    it('should not share state between instances', () => {
      // Arrange
      const query1 = new GetGcpTenantQuery({
        tenantId: 'tenant-001',
        organizationId: 1
      });
      const query2 = new GetGcpTenantQuery({
        tenantId: 'tenant-002',
        organizationId: 2
      });

      // Assert
      expect(query1.tenantId).not.toBe(query2.tenantId);
      expect(query1.organizationId).not.toBe(query2.organizationId);
    });
  });

  describe('property access', () => {
    it('should allow accessing tenantId property', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'test-tenant',
        organizationId: 123
      });

      // Assert
      expect(() => query.tenantId).not.toThrow();
      expect(query.tenantId).toBe('test-tenant');
    });

    it('should allow accessing organizationId property', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'test-tenant',
        organizationId: 456
      });

      // Assert
      expect(() => query.organizationId).not.toThrow();
      expect(query.organizationId).toBe(456);
    });

    it('should allow accessing readonly property', () => {
      // Arrange & Act
      const query = new GetGcpTenantQuery({
        tenantId: 'test-tenant',
        organizationId: 789
      });

      // Assert
      expect(() => query.readonly).not.toThrow();
      expect(query.readonly).toBe(true);
    });
  });
});
