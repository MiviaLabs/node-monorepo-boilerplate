/**
 * OpaGuard Unit Tests
 *
 * Comprehensive test suite for OpaGuard covering:
 * - canActivate() method flow
 * - Error handling and fail-closed behavior
 * - Integration with Reflector and OpaService
 *
 * Test Strategy:
 * - Mock OpaService and Reflector with jest.fn()
 * - Test all authorization decision paths
 * - Validate metadata resolution (handler vs class level)
 * - Test error conditions and security behavior
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { OpaGuard } from '../guards/opa.guard';
import { OpaService } from '../opa.service';
import { RESOURCE_KEY, ACTION_KEY } from '../decorators';

import type { IAuthzRequest } from '../types';

describe('OpaGuard', () => {
  let guard: OpaGuard;
  let mockOpaService: jest.Mocked<OpaService>;
  let mockReflector: jest.Mocked<Reflector>;

  // Mock request user structure
  const mockUser = {
    id: 'user-123',
    system_roles: ['system_admin'],
    tenant_roles: ['tenant_owner'],
    organization_id: 'org-456',
    permissions: ['document:read'],
    attributes: { department: 'engineering' }
  };

  // Map to store metadata for each handler object
  const handlerMetadataMap = new Map<object, { resource?: string; action?: string }>();

  // Mock execution context
  const createMockContext = (
    user?: unknown,
    resourceMetadata?: string,
    actionMetadata?: string,
    params?: Record<string, string>
  ): ExecutionContext => {
    // Create unique handler object for this context
    const handler = {};

    // Store metadata for this handler
    handlerMetadataMap.set(handler, {
      resource: resourceMetadata,
      action: actionMetadata
    });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          body: {}
        })
      }),
      getHandler: () => handler,
      getClass: () => ({})
    } as unknown as ExecutionContext;

    return context;
  };

  beforeEach(() => {
    // Clear metadata map before each test
    handlerMetadataMap.clear();

    mockOpaService = {
      isAuthorized: jest.fn(),
      healthCheck: jest.fn(),
      getConfig: jest.fn()
    } as unknown as jest.Mocked<OpaService>;

    mockReflector = {
      getAllAndOverride: jest.fn((key: string, handlers: any[]) => {
        // Check handlers in order (handler first, then class)
        for (const handler of handlers) {
          const metadata = handlerMetadataMap.get(handler);
          if (metadata) {
            if (key === RESOURCE_KEY && metadata.resource !== undefined) {
              // Convert string to object format like the real Resource decorator does
              return typeof metadata.resource === 'string'
                ? { type: metadata.resource, scope: 'tenant' }
                : metadata.resource;
            }
            if (key === ACTION_KEY && metadata.action !== undefined) {
              return metadata.action;
            }
          }
        }
        return undefined;
      }),
      getAll: jest.fn(),
      get: jest.fn()
    };

    // Create guard directly with mocked dependencies
    // Note: OpaGuard constructor is (reflector, opaService)
    guard = new OpaGuard(mockReflector as any, mockOpaService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    describe('happy paths', () => {
      it('should return true when authorization succeeds', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      });

      it('should call OpaService with correct request structure', async () => {
        const context = createMockContext(mockUser, 'organization', 'update', { id: 'org-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              id: 'user-123',
              system_roles: ['system_admin'],
              tenant_roles: ['tenant_owner'],
              organization_id: 'org-456'
            }),
            resource: expect.objectContaining({
              type: 'organization',
              id: 'org-789',
              organization_id: 'org-456'
            }),
            action: 'update'
          })
        );
      });

      it('should handle request without resource ID', async () => {
        const context = createMockContext(mockUser, 'documents', 'list', undefined);
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            resource: expect.objectContaining({
              type: 'documents'
              // No id field
            })
          })
        );
      });

      it('should handle user with null organization_id', async () => {
        const userNoOrg = { ...mockUser, organization_id: null };
        const context = createMockContext(userNoOrg, 'public_resource', 'read', undefined);
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              organization_id: null
            }),
            resource: expect.not.objectContaining({
              organization_id: expect.anything()
            })
          })
        );
      });

      it('should include user permissions in authz request', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              permissions: ['document:read']
            })
          })
        );
      });

      it('should include user attributes in authz request', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        await guard.canActivate(context);

        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              attributes: { department: 'engineering' }
            })
          })
        );
      });
    });

    describe('authentication failures', () => {
      it('should throw ForbiddenException when user is missing', async () => {
        const context = createMockContext(undefined, 'document', 'read');

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('User not authenticated');
      });

      it('should throw ForbiddenException when user is null', async () => {
        const context = createMockContext(null, 'document', 'read');

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });

      it('should not call OpaService when user is missing', async () => {
        const context = createMockContext(undefined, 'document', 'read');

        try {
          await guard.canActivate(context);
        } catch (error) {
          // Expected
        }

        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });
    });

    describe('metadata failures', () => {
      it('should throw ForbiddenException when @Resource() decorator is missing', async () => {
        const context = createMockContext(mockUser, undefined, 'read');

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('Resource type not specified');
      });

      it('should throw ForbiddenException when @Action() decorator is missing', async () => {
        const context = createMockContext(mockUser, 'document', undefined);

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('Action not specified');
      });

      it('should throw ForbiddenException when both decorators are missing', async () => {
        const context = createMockContext(mockUser, undefined, undefined);

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('Resource type not specified');
      });

      it('should not call OpaService when resource metadata is missing', async () => {
        const context = createMockContext(mockUser, undefined, 'read');

        try {
          await guard.canActivate(context);
        } catch (error) {
          // Expected
        }

        expect(mockOpaService.isAuthorized).not.toHaveBeenCalled();
      });
    });

    describe('authorization denial', () => {
      it('should throw ForbiddenException when OPA denies access', async () => {
        const context = createMockContext(mockUser, 'admin_panel', 'update', { id: 'panel-1' });
        mockOpaService.isAuthorized.mockResolvedValue(false);

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
        await expect(guard.canActivate(context)).rejects.toThrow('Access denied');
      });

      it('should include resource and action in denial message', async () => {
        const context = createMockContext(mockUser, 'document', 'delete', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(false);

        await expect(guard.canActivate(context)).rejects.toThrow(
          'Access denied: insufficient privileges for delete on document'
        );
      });

      it('should throw ForbiddenException when OPA service fails (fail-closed)', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(false); // Fail-closed returns false

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('edge cases', () => {
      it('should handle empty roles arrays', async () => {
        const userNoRoles = {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: 'org-456'
        };
        const context = createMockContext(userNoRoles, 'document', 'read', { id: 'doc-789' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              system_roles: [],
              tenant_roles: []
            })
          })
        );
      });

      it('should handle missing optional user fields', async () => {
        const minimalUser = {
          id: 'user-123',
          system_roles: [],
          tenant_roles: [],
          organization_id: null
        };
        const context = createMockContext(minimalUser, 'public_page', 'read');
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should handle resource ID with special characters', async () => {
        const context = createMockContext(mockUser, 'document', 'read', { id: 'doc-123-abc' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockOpaService.isAuthorized).toHaveBeenCalledWith(
          expect.objectContaining({
            resource: expect.objectContaining({
              id: 'doc-123-abc'
            })
          })
        );
      });

      it('should handle complex resource types', async () => {
        const context = createMockContext(mockUser, 'api/v2/documents', 'read', { id: 'doc-1' });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should handle complex action names', async () => {
        const context = createMockContext(mockUser, 'document', 'publish_and_share', {
          id: 'doc-1'
        });
        mockOpaService.isAuthorized.mockResolvedValue(true);

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });
    });
  });

  describe('integration with Reflector', () => {
    it('should call Reflector with correct metadata keys', async () => {
      const context = createMockContext(mockUser, 'document', 'read');
      mockOpaService.isAuthorized.mockResolvedValue(true);

      await guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(RESOURCE_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(ACTION_KEY, [
        context.getHandler(),
        context.getClass()
      ]);
    });
  });

  describe('error message clarity', () => {
    it('should provide clear error when user not authenticated', async () => {
      const context = createMockContext(undefined, 'document', 'read');

      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe('User not authenticated');
      }
    });

    it('should provide clear error when resource not specified', async () => {
      const context = createMockContext(mockUser, undefined, 'read');

      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe('Resource type not specified');
      }
    });

    it('should provide clear error when action not specified', async () => {
      const context = createMockContext(mockUser, 'document', undefined);

      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe('Action not specified');
      }
    });

    it('should include action and resource in denial message', async () => {
      const context = createMockContext(mockUser, 'sensitive_data', 'delete', { id: 'data-123' });
      mockOpaService.isAuthorized.mockResolvedValue(false);

      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toContain('delete');
        expect((error as ForbiddenException).message).toContain('sensitive_data');
      }
    });
  });
});
