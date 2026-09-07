/**
 * Unit tests for TenantManagementService
 *
 * Tests the GCP Identity Platform tenant lifecycle management service.
 * Verifies tenant provisioning, linking, deletion, and error handling.
 */

import { Test } from '@nestjs/testing';
import { AUTH_PROVIDER_FACTORY } from '@package/auth';

import { GcpTenantRepository } from '../../repositories/gcp-tenant.repository';
import { MultiFactorState } from '../../tenants.types';
import { TenantManagementService } from '../tenant-management.service';

import type { GcpTenantConfig } from '../../tenants.types';
import type { TestingModule } from '@nestjs/testing';
import type { IAuthProvider, AuthProviderFactory } from '@package/auth';

interface MockTenantManager {
  createTenant: jest.Mock;
  deleteTenant: jest.Mock;
}

interface MockFirebaseAuth {
  tenantManager: () => MockTenantManager;
}

interface MockExistingOrganization {
  id: number;
  tenantId: number;
  ownerId: number | null;
  publicId: string;
  name: string;
  displayName: string | null;
  slug: string;
  gcpTenantId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

describe('TenantManagementService', () => {
  let service: TenantManagementService;
  let authProviderFactory: jest.Mocked<AuthProviderFactory>;
  let gcpTenantRepository: jest.Mocked<GcpTenantRepository>;
  let mockTenantManager: MockTenantManager;
  let mockFirebaseAuth: MockFirebaseAuth;
  let mockAuthProvider: IAuthProvider;

  const mockGcpTenantId = 'gcp-tenant-123';
  const mockOrganizationId = 456;
  const mockOrganizationName = 'Test Organization';

  beforeEach(async () => {
    // Create mock tenant manager
    mockTenantManager = {
      createTenant: jest.fn().mockResolvedValue({
        tenantId: mockGcpTenantId,
        displayName: mockOrganizationName
      }),
      deleteTenant: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock Firebase auth
    mockFirebaseAuth = {
      tenantManager: () => mockTenantManager
    };

    // Create mock auth provider with Firebase support
    mockAuthProvider = {
      name: 'google-provider',
      type: 'google.com',
      firebaseAuth: mockFirebaseAuth
    } as unknown as IAuthProvider;

    // Create mock auth provider factory
    const mockFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(mockAuthProvider)
    };

    // Create mock repository
    const mockRepository = {
      findByIdWithGcpTenant: jest.fn(),
      updateGcpTenantId: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantManagementService,
        {
          provide: AUTH_PROVIDER_FACTORY,
          useValue: mockFactory
        },
        {
          provide: GcpTenantRepository,
          useValue: mockRepository
        }
      ]
    }).compile();

    service = module.get<TenantManagementService>(TenantManagementService);
    authProviderFactory = module.get<AuthProviderFactory>(
      AUTH_PROVIDER_FACTORY
    ) as jest.Mocked<AuthProviderFactory>;
    gcpTenantRepository = module.get<GcpTenantRepository>(
      GcpTenantRepository
    ) as jest.Mocked<GcpTenantRepository>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('provisionGcpTenant', () => {
    it('should create GCP tenant successfully', async () => {
      // Arrange
      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act
      const result = await service.provisionGcpTenant(mockOrganizationId, config);

      // Assert
      expect(mockTenantManager.createTenant).toHaveBeenCalledTimes(1);
      expect(mockTenantManager.createTenant).toHaveBeenCalledWith({
        displayName: mockOrganizationName,
        emailSignInEnabled: true,
        passwordPolicy: undefined,
        multiFactorConfig: undefined
      });
      expect(result).toEqual({
        tenantId: mockGcpTenantId,
        displayName: mockOrganizationName
      });
    });

    it('should create GCP tenant with password policy', async () => {
      // Arrange
      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true,
        passwordPolicy: {
          enabled: true,
          minLength: 8
        }
      };

      // Act
      await service.provisionGcpTenant(mockOrganizationId, config);

      // Assert
      expect(mockTenantManager.createTenant).toHaveBeenCalledWith({
        displayName: mockOrganizationName,
        emailSignInEnabled: true,
        passwordPolicy: {
          enabled: true,
          minLength: 8
        },
        multiFactorConfig: undefined
      });
    });

    it('should create GCP tenant with MFA config', async () => {
      // Arrange
      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true,
        multiFactorConfig: {
          enabled: true,
          state: MultiFactorState.REQUIRED
        }
      };

      // Act
      await service.provisionGcpTenant(mockOrganizationId, config);

      // Assert
      expect(mockTenantManager.createTenant).toHaveBeenCalledWith({
        displayName: mockOrganizationName,
        emailSignInEnabled: true,
        passwordPolicy: undefined,
        multiFactorConfig: {
          enabled: true,
          state: MultiFactorState.REQUIRED
        }
      });
    });

    it('should throw EXT_002 when GCP API fails', async () => {
      // Arrange
      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };
      const apiError = new Error('GCP quota exceeded');
      mockTenantManager.createTenant.mockRejectedValue(apiError);

      // Act & Assert
      await expect(service.provisionGcpTenant(mockOrganizationId, config)).rejects.toMatchObject({
        code: 'EXT_002'
      });
    });

    it('should throw error when provider does not support tenant management', async () => {
      // Arrange
      const nonGoogleProvider = {
        name: 'other-provider',
        type: 'other.com'
      } as unknown as IAuthProvider;

      authProviderFactory.getDefaultProvider.mockReturnValue(nonGoogleProvider);

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Create new service instance to reset provider cache
      const newService = new TenantManagementService(authProviderFactory, gcpTenantRepository);

      // Act & Assert
      await expect(newService.provisionGcpTenant(mockOrganizationId, config)).rejects.toThrow(
        'Auth provider does not support tenant management. Please use Google Identity Platform provider.'
      );
    });

    it('should use cached provider on subsequent calls', async () => {
      // Arrange
      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act
      await service.provisionGcpTenant(mockOrganizationId, config);
      await service.provisionGcpTenant(mockOrganizationId, config);

      // Assert
      expect(authProviderFactory.getDefaultProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe('linkGcpTenantToOrganization', () => {
    it('should link GCP tenant ID to organization', async () => {
      // Arrange
      gcpTenantRepository.updateGcpTenantId.mockResolvedValue({
        id: mockOrganizationId,
        gcpTenantId: mockGcpTenantId
      } as never);

      // Act
      await service.linkGcpTenantToOrganization(mockOrganizationId, mockGcpTenantId);

      // Assert
      expect(gcpTenantRepository.updateGcpTenantId).toHaveBeenCalledWith(
        mockOrganizationId,
        mockGcpTenantId
      );
    });
  });

  describe('provisionGcpTenantForOrganization', () => {
    it('should provision and link GCP tenant successfully', async () => {
      // Arrange
      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(null);
      gcpTenantRepository.updateGcpTenantId.mockResolvedValue({
        id: mockOrganizationId,
        gcpTenantId: mockGcpTenantId
      } as never);

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act
      const result = await service.provisionGcpTenantForOrganization(mockOrganizationId, config);

      // Assert
      expect(gcpTenantRepository.findByIdWithGcpTenant).toHaveBeenCalledWith(
        'system',
        mockOrganizationId
      );
      expect(mockTenantManager.createTenant).toHaveBeenCalled();
      expect(gcpTenantRepository.updateGcpTenantId).toHaveBeenCalledWith(
        mockOrganizationId,
        mockGcpTenantId
      );
      expect(result).toEqual({
        tenantId: mockGcpTenantId,
        displayName: mockOrganizationName
      });
    });

    it('should discard a duplicate provision when another request links first', async () => {
      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: mockOrganizationId,
        tenantId: 123,
        ownerId: 789,
        publicId: 'org-public-id',
        gcpTenantId: 'existing-gcp-tenant',
        name: mockOrganizationName,
        displayName: null,
        slug: 'test-org',
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z')
      } as MockExistingOrganization);
      gcpTenantRepository.updateGcpTenantId.mockResolvedValue(null);

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      const result = await service.provisionGcpTenantForOrganization(mockOrganizationId, config);

      expect(mockTenantManager.deleteTenant).toHaveBeenCalledWith(mockGcpTenantId);
      expect(result).toEqual({
        tenantId: 'existing-gcp-tenant',
        displayName: mockOrganizationName
      });
    });

    it('should return existing GCP tenant idempotently', async () => {
      // Arrange
      const existingOrg = {
        id: mockOrganizationId,
        tenantId: 123,
        ownerId: 789,
        publicId: 'org-public-id',
        gcpTenantId: 'existing-gcp-tenant',
        name: mockOrganizationName,
        displayName: null,
        slug: 'test-org',
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z')
      };
      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        existingOrg as MockExistingOrganization
      );

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act
      const result = await service.provisionGcpTenantForOrganization(mockOrganizationId, config);

      // Assert
      expect(mockTenantManager.createTenant).not.toHaveBeenCalled();
      expect(gcpTenantRepository.updateGcpTenantId).not.toHaveBeenCalled();
      expect(result).toEqual({
        tenantId: 'existing-gcp-tenant',
        displayName: mockOrganizationName
      });
    });

    it('should rollback GCP tenant when database link fails', async () => {
      // Arrange
      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(null);
      gcpTenantRepository.updateGcpTenantId.mockRejectedValue(
        new Error('Database connection failed')
      );

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act & Assert
      await expect(
        service.provisionGcpTenantForOrganization(mockOrganizationId, config)
      ).rejects.toMatchObject({
        code: 'EXT_002'
      });

      // Verify rollback was attempted
      expect(mockTenantManager.deleteTenant).toHaveBeenCalledWith(mockGcpTenantId);
    });

    it('should log warning when GCP tenant rollback fails', async () => {
      // Arrange
      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(null);
      gcpTenantRepository.updateGcpTenantId.mockRejectedValue(
        new Error('Database connection failed')
      );
      mockTenantManager.deleteTenant.mockRejectedValue(new Error('Rollback failed'));

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act & Assert
      await expect(
        service.provisionGcpTenantForOrganization(mockOrganizationId, config)
      ).rejects.toMatchObject({
        code: 'EXT_002'
      });

      // Verify delete was attempted despite failure
      expect(mockTenantManager.deleteTenant).toHaveBeenCalledWith(mockGcpTenantId);
    });

    it('should use organization name from database when returning existing tenant', async () => {
      // Arrange
      const existingOrg = {
        id: mockOrganizationId,
        tenantId: 123,
        ownerId: 789,
        publicId: 'org-public-id',
        gcpTenantId: 'existing-gcp-tenant',
        name: 'Existing Org Name',
        displayName: null,
        slug: 'test-org',
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z')
      };
      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        existingOrg as MockExistingOrganization
      );

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act
      const result = await service.provisionGcpTenantForOrganization(mockOrganizationId, config);

      // Assert
      expect(result.displayName).toBe('Existing Org Name');
    });
  });

  describe('deleteGcpTenant', () => {
    it('should delete GCP tenant successfully', async () => {
      // Act
      await service.deleteGcpTenant(mockGcpTenantId);

      // Assert
      expect(mockTenantManager.deleteTenant).toHaveBeenCalledWith(mockGcpTenantId);
    });

    it('should throw EXT_002 when deletion fails', async () => {
      // Arrange
      const deleteError = new Error('Tenant not found');
      mockTenantManager.deleteTenant.mockRejectedValue(deleteError);

      // Act & Assert
      await expect(service.deleteGcpTenant(mockGcpTenantId)).rejects.toMatchObject({
        code: 'EXT_002'
      });
    });

    it('should handle provider that does not support deletion gracefully', async () => {
      // Arrange
      const nonGoogleProvider = {
        name: 'other-provider',
        type: 'other.com'
      } as unknown as IAuthProvider;

      authProviderFactory.getDefaultProvider.mockReturnValue(nonGoogleProvider);

      // Create new service instance to reset provider cache
      const newService = new TenantManagementService(authProviderFactory, gcpTenantRepository);

      // Act & Assert - Should not throw, just return undefined (no-op)
      await expect(newService.deleteGcpTenant(mockGcpTenantId)).resolves.toBeUndefined();
    });
  });

  describe('lazy provider loading', () => {
    it('should throw error when no auth provider configured', async () => {
      // Arrange
      authProviderFactory.getDefaultProvider.mockReturnValue(undefined);

      const newService = new TenantManagementService(authProviderFactory, gcpTenantRepository);

      const config: GcpTenantConfig = {
        displayName: mockOrganizationName,
        emailSignInEnabled: true
      };

      // Act & Assert
      await expect(newService.provisionGcpTenant(mockOrganizationId, config)).rejects.toThrow(
        'No auth provider configured'
      );
    });
  });
});
