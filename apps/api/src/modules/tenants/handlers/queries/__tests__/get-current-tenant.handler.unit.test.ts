/**
 * Unit Tests for GetCurrentTenantHandler
 *
 * Tests current tenant retrieval via TenantService delegation.
 */

import { Test } from '@nestjs/testing';

import { GetCurrentTenantQuery } from '../../../queries/get-current-tenant.query';
import { TenantService } from '../../../services/tenant.service';
import { GetCurrentTenantHandler } from '../get-current-tenant.handler';

import type { TestingModule } from '@nestjs/testing';

describe('GetCurrentTenantHandler', () => {
  let handler: GetCurrentTenantHandler;
  let tenantService: jest.Mocked<TenantService>;

  const mockTenantResponse = {
    id: 1,
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'active',
    settings: {
      allowPublicRegistration: false,
      defaultRole: 'tenant_user',
      maxUsers: 100
    },
    createdAt: '2024-01-01T00:00:00.000Z'
  };

  beforeEach(async () => {
    const mockTenantService = {
      getCurrentTenant: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetCurrentTenantHandler,
        {
          provide: TenantService,
          useValue: mockTenantService
        }
      ]
    }).compile();

    handler = module.get<GetCurrentTenantHandler>(GetCurrentTenantHandler);
    tenantService = module.get(TenantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return current tenant settings', async () => {
      // Arrange
      const query = new GetCurrentTenantQuery({ tenantId: '1' });
      tenantService.getCurrentTenant.mockResolvedValue(mockTenantResponse);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual(mockTenantResponse);
    });

    it('should delegate to TenantService.getCurrentTenant', async () => {
      // Arrange
      const query = new GetCurrentTenantQuery({ tenantId: '1' });
      tenantService.getCurrentTenant.mockResolvedValue(mockTenantResponse);

      // Act
      await handler.execute(query);

      // Assert
      expect(tenantService.getCurrentTenant).toHaveBeenCalledTimes(1);
      expect(tenantService.getCurrentTenant).toHaveBeenCalledWith(
        '1',
        undefined,
        undefined,
        undefined,
        undefined
      );
    });

    it('should return tenant with settings', async () => {
      // Arrange
      const query = new GetCurrentTenantQuery({ tenantId: '1' });
      tenantService.getCurrentTenant.mockResolvedValue(mockTenantResponse);

      // Act
      const result = (await handler.execute(query)) as typeof mockTenantResponse;

      // Assert
      expect(result.settings).toBeDefined();
      expect(result.settings.allowPublicRegistration).toBe(false);
      expect(result.settings.defaultRole).toBe('tenant_user');
    });

    it('should accept different tenant IDs', async () => {
      // Arrange
      const query = new GetCurrentTenantQuery({ tenantId: '999' });
      tenantService.getCurrentTenant.mockResolvedValue(mockTenantResponse);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual(mockTenantResponse);
      expect(tenantService.getCurrentTenant).toHaveBeenCalledWith(
        '999',
        undefined,
        undefined,
        undefined,
        undefined
      );
    });
  });
});
