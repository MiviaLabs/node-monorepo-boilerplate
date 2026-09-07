import { describe, it, expect } from 'vitest';

import { tenantsRouter } from './tenants';

/**
 * Tenants router unit tests
 *
 * Tests tenant-related tRPC procedures for:
 * - Tenant context validation (P0 security requirement)
 * - Response schema validation
 * - Error handling
 */
describe('tenantsRouter', () => {
  describe('getCurrentTenant', () => {
    /**
     * Creates mock tRPC context with headers
     */
    const createMockContext = (headers: Record<string, string> = {}) => {
      const headersMap = new Map(Object.entries(headers));
      return {
        headers: {
          get: (key: string) => headersMap.get(key) ?? null
        }
      };
    };

    it('should return current tenant when valid tenant ID provided', async () => {
      // Arrange
      const ctx = createMockContext({
        'x-tenant-id': '123e4567-e89b-12d3-a456-426614174000'
      });

      // Act
      const caller = tenantsRouter.createCaller(ctx as never);
      const result = await caller.getCurrentTenant();

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.name).toBe('Acme Corp');
      expect(result.displayName).toBe('Acme Corp');
      expect(result.slug).toBe('acme-corp');
      expect(result.status).toBe('active');
      expect(result.settings).toBeDefined();
      expect(result.settings.allowPublicRegistration).toBe(false);
      expect(result.settings.defaultRole).toBe('tenant_user');
      expect(result.settings.maxUsers).toBe(100);
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should throw error when x-tenant-id header is missing', async () => {
      // Arrange
      const ctx = createMockContext({}); // No tenant ID

      // Act & Assert
      const caller = tenantsRouter.createCaller(ctx as never);
      await expect(caller.getCurrentTenant()).rejects.toThrow(
        'Tenant context missing: x-tenant-id header is required'
      );
    });

    it('should use tenantId cookie when x-tenant-id header is missing', async () => {
      // Arrange
      const ctx = createMockContext({
        cookie: 'sessionId=abc123; tenantId=123e4567-e89b-12d3-a456-426614174000'
      });

      // Act
      const caller = tenantsRouter.createCaller(ctx as never);
      const result = await caller.getCurrentTenant();

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.slug).toBe('acme-corp');
    });

    it('should accept non-UUID tenant identifiers', async () => {
      // Arrange
      const ctx = createMockContext({
        'x-tenant-id': 'tenant-123'
      });

      // Act
      const caller = tenantsRouter.createCaller(ctx as never);
      const result = await caller.getCurrentTenant();

      // Assert
      expect(result).toBeDefined();
      expect(result.slug).toBe('acme-corp');
    });

    it('should throw error when x-tenant-id is empty string', async () => {
      // Arrange
      const ctx = createMockContext({
        'x-tenant-id': ''
      });

      // Act & Assert
      // Empty string is falsy, so it triggers the "missing" error
      const caller = tenantsRouter.createCaller(ctx as never);
      await expect(caller.getCurrentTenant()).rejects.toThrow(
        'Tenant context missing: x-tenant-id header is required'
      );
    });

    it('should throw error when x-tenant-id is blank string', async () => {
      // Arrange
      const ctx = createMockContext({
        'x-tenant-id': '   '
      });

      // Act & Assert
      const caller = tenantsRouter.createCaller(ctx as never);
      await expect(caller.getCurrentTenant()).rejects.toThrow(
        'Tenant context invalid: x-tenant-id must be a non-empty string'
      );
    });

    it('should validate response schema matches expected structure', async () => {
      // Arrange
      const ctx = createMockContext({
        'x-tenant-id': '123e4567-e89b-12d3-a456-426614174000'
      });

      // Act
      const caller = tenantsRouter.createCaller(ctx as never);
      const result = await caller.getCurrentTenant();

      // Assert - verify all required fields are present
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('displayName');
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('settings');
      expect(result).toHaveProperty('createdAt');

      // Verify nested settings structure
      expect(result.settings).toHaveProperty('allowPublicRegistration');
      expect(result.settings).toHaveProperty('defaultRole');
      expect(result.settings).toHaveProperty('maxUsers');
    });

    it('should return valid status enum value', async () => {
      // Arrange
      const ctx = createMockContext({
        'x-tenant-id': '123e4567-e89b-12d3-a456-426614174000'
      });

      // Act
      const caller = tenantsRouter.createCaller(ctx as never);
      const result = await caller.getCurrentTenant();

      // Assert
      const validStatuses = ['active', 'inactive', 'suspended'];
      expect(validStatuses).toContain(result.status);
    });
  });
});
