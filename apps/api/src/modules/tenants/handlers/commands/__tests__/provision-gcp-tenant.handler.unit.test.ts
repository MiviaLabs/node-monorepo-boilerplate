/**
 * Unit tests for ProvisionGcpTenantHandler
 *
 * Tests the command handler that provisions GCP Identity Platform tenants.
 * Verifies the handler delegates to TenantManagementService and returns proper responses.
 */

import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { ProvisionGcpTenantCommand } from '../../../commands/provision-gcp-tenant.command';
import { TenantManagementService } from '../../../services/tenant-management.service';
import { ProvisionGcpTenantHandler } from '../provision-gcp-tenant.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';

describe('ProvisionGcpTenantHandler', () => {
  let handler: ProvisionGcpTenantHandler;
  let tenantManagementService: jest.Mocked<TenantManagementService>;
  let outboxRepo: { insert: jest.Mock };
  let db: { transaction: jest.Mock };

  const mockOrganizationId = 123;
  const mockActorId = 'user-456';
  const mockTenantId = 'tenant-789';
  const mockDisplayName = 'My Organization';
  const mockGcpTenantId = 'gcp-tenant-abc-123';

  beforeEach(async () => {
    const mockTenantService = {
      provisionGcpTenantForOrganization: jest.fn()
    };

    const mockEventBus = {
      publish: jest.fn()
    };
    outboxRepo = {
      insert: jest.fn().mockResolvedValue(undefined)
    };
    db = {
      transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({}))
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisionGcpTenantHandler,
        {
          provide: TenantManagementService,
          useValue: mockTenantService
        },
        {
          provide: OutboxRepository,
          useValue: outboxRepo
        },
        {
          provide: MAIN_DB,
          useValue: db
        },
        {
          provide: EventBus,
          useValue: mockEventBus
        }
      ]
    }).compile();

    handler = module.get<ProvisionGcpTenantHandler>(ProvisionGcpTenantHandler);
    tenantManagementService = module.get<TenantManagementService>(
      TenantManagementService
    ) as jest.Mocked<TenantManagementService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should provision GCP tenant successfully', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName,
        requestId: 'req-123',
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      const mockGcpTenantResult = {
        tenantId: mockGcpTenantId,
        displayName: mockDisplayName
      };

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue(
        mockGcpTenantResult
      );

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(tenantManagementService.provisionGcpTenantForOrganization).toHaveBeenCalledWith(
        mockOrganizationId,
        {
          displayName: mockDisplayName,
          emailSignInEnabled: true
        }
      );

      expect(result).toEqual({
        organizationId: mockOrganizationId,
        gcpTenantId: mockGcpTenantId,
        displayName: mockDisplayName
      });
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.gcp.provisioned.audit',
          payload: expect.objectContaining({
            action: 'PROVISION_GCP_TENANT',
            actorId: mockActorId,
            requestId: 'req-123',
            tenantId: mockTenantId,
            details: expect.objectContaining({
              organizationId: String(mockOrganizationId),
              gcpTenantId: mockGcpTenantId
            })
          }),
          correlationId: 'corr-123',
          causationId: 'cause-123'
        })
      );
    });

    it('should pass correct configuration to service', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: 'Custom Display Name'
      });

      const mockGcpTenantResult = {
        tenantId: mockGcpTenantId,
        displayName: 'Custom Display Name'
      };

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue(
        mockGcpTenantResult
      );

      // Act
      await handler.execute(command);

      // Assert
      expect(tenantManagementService.provisionGcpTenantForOrganization).toHaveBeenCalledWith(
        mockOrganizationId,
        {
          displayName: 'Custom Display Name',
          emailSignInEnabled: true
        }
      );
    });

    it('should propagate errors from service layer', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      const serviceError = new Error('GCP quota exceeded');
      tenantManagementService.provisionGcpTenantForOrganization.mockRejectedValue(serviceError);

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('GCP quota exceeded');
    });

    it('should include organizationId from command in response', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: 999,
        displayName: mockDisplayName
      });

      const mockGcpTenantResult = {
        tenantId: mockGcpTenantId,
        displayName: mockDisplayName
      };

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue(
        mockGcpTenantResult
      );

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.organizationId).toBe(999);
    });

    it('should include gcpTenantId from service result in response', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      const mockGcpTenantResult = {
        tenantId: 'custom-gcp-tenant-id',
        displayName: mockDisplayName
      };

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue(
        mockGcpTenantResult
      );

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.gcpTenantId).toBe('custom-gcp-tenant-id');
    });

    it('should include displayName from service result in response', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: 'Original Name'
      });

      const mockGcpTenantResult = {
        tenantId: mockGcpTenantId,
        displayName: 'Service Returned Name'
      };

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue(
        mockGcpTenantResult
      );

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.displayName).toBe('Service Returned Name');
    });

    it('should handle service returning null displayName gracefully', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      const mockGcpTenantResult = {
        tenantId: mockGcpTenantId,
        displayName: ''
      };

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue(
        mockGcpTenantResult
      );

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.displayName).toBe('');
    });
  });

  describe('command properties', () => {
    it('should access organizationId from command', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue({
        tenantId: mockGcpTenantId,
        displayName: mockDisplayName
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(command.organizationId).toBe(mockOrganizationId);
    });

    it('should access actorId from command', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue({
        tenantId: mockGcpTenantId,
        displayName: mockDisplayName
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(command.actorId).toBe(mockActorId);
    });

    it('should access displayName from command', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: 'My Custom Org'
      });

      tenantManagementService.provisionGcpTenantForOrganization.mockResolvedValue({
        tenantId: mockGcpTenantId,
        displayName: 'My Custom Org'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(command.displayName).toBe('My Custom Org');
    });
  });

  describe('error handling', () => {
    it('should not catch errors - let them propagate', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      const serviceError = new Error('Service unavailable');
      tenantManagementService.provisionGcpTenantForOrganization.mockRejectedValue(serviceError);

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Service unavailable');
    });

    it('should propagate structured errors from service', async () => {
      // Arrange
      const command = new ProvisionGcpTenantCommand({
        tenantId: mockTenantId,
        actorId: mockActorId,
        organizationId: mockOrganizationId,
        displayName: mockDisplayName
      });

      const structuredError = {
        code: 'EXT_002',
        message: 'External service error'
      };
      tenantManagementService.provisionGcpTenantForOrganization.mockRejectedValue(structuredError);

      // Act & Assert
      await expect(handler.execute(command)).rejects.toEqual(structuredError);
    });
  });
});
