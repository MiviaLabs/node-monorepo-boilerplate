/**
 * Unit tests for TenantMiddleware
 *
 * Tests tenant context extraction from x-tenant-id header.
 * Focuses on critical happy paths and key error cases.
 */

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { ApiException } from '../../errors';
import { TenantResolutionService } from '../../services/tenant-resolution.service';
import { VersionService } from '../../services/version.service';
import { TenantMiddleware } from '../tenant.middleware';

import type { TestingModule } from '@nestjs/testing';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantResolution: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let versionService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let configService: any;

  const mockTenant = {
    id: 123,
    publicId: 'abc-123',
    type: 'organization',
    status: 'active',
    settings: {},
    organization: {
      id: 456,
      name: 'Acme Corp',
      slug: 'acme'
    }
  };

  beforeEach(async () => {
    // Mock TenantResolutionService
    tenantResolution = {
      validateTenant: jest.fn().mockResolvedValue(mockTenant)
    };

    // Mock VersionService
    versionService = {
      getAllVersions: jest.fn().mockReturnValue([
        { prefix: 'v1', version: '1.0.0', status: 'active' },
        { prefix: 'v1', version: '2.0.0', status: 'active' }
      ])
    };

    // Mock ConfigService
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'TENANT_HEADER_NAME') {
          return 'x-tenant-id';
        }

        if (key === 'API_PREFIX') {
          return 'api';
        }

        return undefined;
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantMiddleware,
        {
          provide: TenantResolutionService,
          useValue: tenantResolution
        },
        {
          provide: VersionService,
          useValue: versionService
        },
        {
          provide: ConfigService,
          useValue: configService
        }
      ]
    }).compile();

    middleware = module.get<TenantMiddleware>(TenantMiddleware);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('header-based resolution', () => {
    it('should extract valid tenant ID from x-tenant-id header', async () => {
      // Arrange
      const req = {
        headers: { 'x-tenant-id': '123' },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).toHaveBeenCalledWith('123');
      expect(req.tenantContext).toBeDefined();
      // tenantId is organization.id (456), NOT the header value (123)
      // This aligns with how users.organizationId references organizations.id
      expect((req.tenantContext as unknown as { tenantId?: string })?.tenantId).toBe('456');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should attach tenant context to request', async () => {
      // Arrange
      const req = {
        headers: { 'x-tenant-id': '123' },
        user: { id: 'user-1', roles: ['admin'] },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      // tenantId is organization.id (456), NOT tenant.id (123)
      // This aligns with how users.organizationId references organizations.id
      expect(req.tenantContext).toEqual({
        tenantId: '456',
        tenantSlug: 'acme',
        tenantType: 'organization',
        userId: 'user-1',
        userRoles: ['admin']
      });
    });
  });

  describe('public routes', () => {
    it('should allow health endpoint without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/health',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow versioned health endpoint without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/api/v1/ops/health',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow invitation accept auth endpoint without tenant header', async () => {
      const req = {
        headers: {},
        path: '/api/v1/iam/invitations/accept',
        tenantContext: undefined
      };
      const next = jest.fn();

      await middleware.use(req as never, {} as never, next);

      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow swagger docs without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/api/docs',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow root path without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow favicon without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/favicon.ico',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow robots.txt without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/robots.txt',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow non-api-prefixed public auth password reset route without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/v1/iam/credentials/recovery',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow webhook route without tenant when API_PREFIX is customized', async () => {
      const req = {
        headers: {},
        path: '/backend/v1/webhooks/inbound-mail/resend',
        tenantContext: undefined
      };
      const next = jest.fn();

      configService.get.mockImplementation((key: string) => {
        if (key === 'TENANT_HEADER_NAME') {
          return 'x-tenant-id';
        }

        if (key === 'API_PREFIX') {
          return 'backend';
        }

        return undefined;
      });

      const moduleWithCustomPrefix: TestingModule = await Test.createTestingModule({
        providers: [
          TenantMiddleware,
          {
            provide: TenantResolutionService,
            useValue: tenantResolution
          },
          {
            provide: VersionService,
            useValue: versionService
          },
          {
            provide: ConfigService,
            useValue: configService
          }
        ]
      }).compile();

      const middlewareWithCustomPrefix =
        moduleWithCustomPrefix.get<TenantMiddleware>(TenantMiddleware);

      await middlewareWithCustomPrefix.use(req as never, {} as never, next);

      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow webhook route without tenant when request is not api-prefixed', async () => {
      const req = {
        headers: {},
        path: '/v1/webhooks/inbound-mail/resend',
        tenantContext: undefined
      };
      const next = jest.fn();

      await middleware.use(req as never, {} as never, next);

      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw API_008 when no tenant context on protected route', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act & Assert
      await expect(middleware.use(req as never, {} as never, next)).rejects.toThrow(ApiException);
      await expect(middleware.use(req as never, {} as never, next)).rejects.toMatchObject({
        code: 'API_008',
        httpStatus: 400
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw API_008 on non-api-prefixed protected auth route without tenant', async () => {
      // Arrange
      const req = {
        headers: {},
        path: '/v1/iam/actor',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act & Assert
      await expect(middleware.use(req as never, {} as never, next)).rejects.toThrow(ApiException);
      await expect(middleware.use(req as never, {} as never, next)).rejects.toMatchObject({
        code: 'API_008',
        httpStatus: 400
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw API_021 for non-existent tenant', async () => {
      // Arrange
      const req = {
        headers: { 'x-tenant-id': '999' },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();
      (tenantResolution.validateTenant as jest.Mock).mockRejectedValue(
        ApiException.tenantNotFound('999')
      );

      // Act & Assert
      await expect(middleware.use(req as never, {} as never, next)).rejects.toThrow(ApiException);
      await expect(middleware.use(req as never, {} as never, next)).rejects.toMatchObject({
        code: 'API_021',
        httpStatus: 404
      });
    });

    it('should throw API_022 for suspended tenant', async () => {
      // Arrange
      const req = {
        headers: { 'x-tenant-id': '123' },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();
      (tenantResolution.validateTenant as jest.Mock).mockRejectedValue(
        ApiException.tenantSuspended('123')
      );

      // Act & Assert
      await expect(middleware.use(req as never, {} as never, next)).rejects.toThrow(ApiException);
      await expect(middleware.use(req as never, {} as never, next)).rejects.toMatchObject({
        code: 'API_022',
        httpStatus: 403
      });
    });
  });

  describe('without TenantResolutionService', () => {
    it('should allow request when service is unavailable', async () => {
      // Arrange - middleware without TenantResolutionService
      const moduleNoService: TestingModule = await Test.createTestingModule({
        providers: [
          TenantMiddleware,
          {
            provide: VersionService,
            useValue: versionService
          },
          {
            provide: ConfigService,
            useValue: configService
          }
        ]
      }).compile();

      const middlewareNoService = moduleNoService.get<TenantMiddleware>(TenantMiddleware);

      const req = {
        headers: { 'x-tenant-id': '123' },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middlewareNoService.use(req as never, {} as never, next);

      // Assert - should still work
      expect(req.tenantContext).toBeDefined();
      expect((req.tenantContext as unknown as { tenantId?: string })?.tenantId).toBe('123');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should still throw on public routes without service', async () => {
      // Arrange - middleware without TenantResolutionService
      const moduleNoService: TestingModule = await Test.createTestingModule({
        providers: [
          TenantMiddleware,
          {
            provide: VersionService,
            useValue: versionService
          },
          {
            provide: ConfigService,
            useValue: configService
          }
        ]
      }).compile();

      const middlewareNoService = moduleNoService.get<TenantMiddleware>(TenantMiddleware);

      const req = {
        headers: {},
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act & Assert - should still throw
      await expect(middlewareNoService.use(req as never, {} as never, next)).rejects.toThrow(
        ApiException
      );
    });
  });

  describe('without VersionService', () => {
    it('should allow bootstrap status route without tenant header', async () => {
      const moduleNoVersionService: TestingModule = await Test.createTestingModule({
        providers: [
          TenantMiddleware,
          {
            provide: ConfigService,
            useValue: configService
          },
          {
            provide: TenantResolutionService,
            useValue: tenantResolution
          }
        ]
      }).compile();

      const middlewareNoVersionService =
        moduleNoVersionService.get<TenantMiddleware>(TenantMiddleware);

      const req = {
        headers: {},
        path: '/api/v1/setup/status',
        tenantContext: undefined
      };
      const next = jest.fn();

      await middlewareNoVersionService.use(req as never, {} as never, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(tenantResolution.validateTenant).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle url fallback when path is missing', async () => {
      // Arrange
      const req = {
        headers: {},
        path: undefined,
        url: '/health',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      await middleware.use(req as never, {} as never, next);

      // Assert - should treat as public route
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should handle header with array value', async () => {
      // Arrange
      const req = {
        headers: { 'x-tenant-id': ['123'] },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act - should handle array header
      await middleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).toHaveBeenCalled();
    });

    it('should use default header name from ConfigService', async () => {
      // Arrange
      configService.get.mockReturnValue('x-organization-id');

      // Create middleware with different header name
      const moduleCustom: TestingModule = await Test.createTestingModule({
        providers: [
          TenantMiddleware,
          {
            provide: TenantResolutionService,
            useValue: tenantResolution
          },
          {
            provide: VersionService,
            useValue: versionService
          },
          {
            provide: ConfigService,
            useValue: configService
          }
        ]
      }).compile();

      const customMiddleware = moduleCustom.get<TenantMiddleware>(TenantMiddleware);

      const req = {
        headers: { 'x-organization-id': '123' },
        path: '/api/v1/people',
        tenantContext: undefined
      };
      const next = jest.fn();

      // Act
      customMiddleware.use(req as never, {} as never, next);

      // Assert
      expect(tenantResolution.validateTenant).toHaveBeenCalledWith('123');
    });
  });
});
