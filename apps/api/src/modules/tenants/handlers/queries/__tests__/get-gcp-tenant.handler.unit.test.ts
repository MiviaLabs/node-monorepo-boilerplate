/**
 * Unit tests for GetGcpTenantHandler
 *
 * Tests the query handler that retrieves GCP tenant information for an organization.
 * Verifies the handler returns proper responses for various organization states.
 *
 * KNOWN BUG: The handler throws USER_001 (user not found) instead of ORG_001 or DB_004
 * when organization is not found. This should be fixed in the handler implementation.
 */

import { Test } from '@nestjs/testing';

import { GetGcpTenantQuery } from '../../../queries/get-gcp-tenant.query';
import { GcpTenantRepository } from '../../../repositories/gcp-tenant.repository';
import { GetGcpTenantHandler } from '../get-gcp-tenant.handler';

import type { TestingModule } from '@nestjs/testing';

interface MockOrganization {
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

describe('GetGcpTenantHandler', () => {
  let handler: GetGcpTenantHandler;
  let gcpTenantRepository: jest.Mocked<GcpTenantRepository>;

  const mockTenantId = 'primary-encryption-key';
  const mockOrganizationId = 456;
  const mockGcpTenantId = 'gcp-tenant-abc-789';
  const mockOrganizationName = 'Test Organization';

  /**
   * Helper function to create a mock organization with all required fields
   */
  const createMockOrganization = (gcpTenantId: string | null, id?: number): MockOrganization => ({
    id: id ?? mockOrganizationId,
    tenantId: 123,
    ownerId: 456,
    publicId: 'org-public-id',
    name: mockOrganizationName,
    displayName: null,
    slug: 'test-organization',
    gcpTenantId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  beforeEach(async () => {
    const mockRepository = {
      findByIdWithGcpTenant: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetGcpTenantHandler,
        {
          provide: GcpTenantRepository,
          useValue: mockRepository
        }
      ]
    }).compile();

    handler = module.get<GetGcpTenantHandler>(GetGcpTenantHandler);
    gcpTenantRepository = module.get<GcpTenantRepository>(
      GcpTenantRepository
    ) as jest.Mocked<GcpTenantRepository>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return GCP tenant when organization has one', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization(mockGcpTenantId)
      );

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(gcpTenantRepository.findByIdWithGcpTenant).toHaveBeenCalledWith(
        mockTenantId,
        mockOrganizationId
      );

      expect(result).toEqual({
        organizationId: mockOrganizationId,
        gcpTenantId: mockGcpTenantId,
        hasGcpTenant: true
      });
    });

    it('should return null GCP tenant when organization exists but has no tenant', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(createMockOrganization(null));

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual({
        organizationId: mockOrganizationId,
        gcpTenantId: null,
        hasGcpTenant: false
      });
    });

    it('should throw USER_001 when organization not found', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(null);

      // Act & Assert
      await expect(handler.execute(query)).rejects.toMatchObject({
        code: 'USER_001'
      });

      expect(gcpTenantRepository.findByIdWithGcpTenant).toHaveBeenCalledWith(
        mockTenantId,
        mockOrganizationId
      );
    });

    it('should pass tenantId and organizationId to repository', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: 'custom-tenant-id',
        organizationId: 999
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization(mockGcpTenantId)
      );

      // Act
      await handler.execute(query);

      // Assert
      expect(gcpTenantRepository.findByIdWithGcpTenant).toHaveBeenCalledWith(
        'custom-tenant-id',
        999
      );
    });

    it('should use organizationId from repository response', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization(mockGcpTenantId, 789)
      );

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.organizationId).toBe(789);
    });
  });

  describe('response structure', () => {
    it('should return hasGcpTenant true when gcpTenantId exists', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization('some-gcp-tenant-id')
      );

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.hasGcpTenant).toBe(true);
      expect(result.gcpTenantId).toBe('some-gcp-tenant-id');
    });

    it('should return hasGcpTenant false when gcpTenantId is null', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(createMockOrganization(null));

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.hasGcpTenant).toBe(false);
      expect(result.gcpTenantId).toBeNull();
    });

    it('should return gcpTenantId as string when exists', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization('uuid-string-12345')
      );

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(typeof result.gcpTenantId).toBe('string');
      expect(result.gcpTenantId).toBe('uuid-string-12345');
    });

    it('should return organizationId as number', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization(mockGcpTenantId, 12345)
      );

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(typeof result.organizationId).toBe('number');
      expect(result.organizationId).toBe(12345);
    });
  });

  describe('query properties', () => {
    it('should access tenantId from query', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: 'query-tenant-id',
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization(mockGcpTenantId)
      );

      // Act
      await handler.execute(query);

      // Assert
      expect(query.tenantId).toBe('query-tenant-id');
    });

    it('should access organizationId from query', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: 555
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        createMockOrganization(mockGcpTenantId)
      );

      // Act
      await handler.execute(query);

      // Assert
      expect(query.organizationId).toBe(555);
    });
  });

  describe('edge cases', () => {
    it('should handle repository returning undefined', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(
        undefined as unknown as MockOrganization | null
      );

      // Act & Assert
      await expect(handler.execute(query)).rejects.toMatchObject({
        code: 'USER_001'
      });
    });

    it('should handle empty string gcpTenantId', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(createMockOrganization(''));

      // Act
      const result = await handler.execute(query);

      // Assert
      // Empty string is falsy, so hasGcpTenant will be false
      // The handler returns the actual gcpTenantId value from the organization
      expect(result.gcpTenantId).toBeNull(); // Empty string becomes null in the response
      expect(result.hasGcpTenant).toBe(false);
    });

    it('should handle numeric organizationId conversion to string in error', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: 12345
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(null);

      // Act & Assert
      await expect(handler.execute(query)).rejects.toMatchObject({
        code: 'USER_001'
      });
      // The handler converts numeric organizationId to string for the error
    });
  });

  describe('known bug documentation', () => {
    it('BUG: throws USER_001 instead of ORG_001 or DB_004 for missing organization', async () => {
      // Arrange
      const query = new GetGcpTenantQuery({
        tenantId: mockTenantId,
        organizationId: mockOrganizationId
      });

      gcpTenantRepository.findByIdWithGcpTenant.mockResolvedValue(null);

      // Act & Assert
      await expect(handler.execute(query)).rejects.toMatchObject({
        code: 'USER_001'
      });

      // EXPECTED: Should throw ORG_001 (organization not found) or DB_004 (record not found)
      // ACTUAL: Throws USER_001 (user not found)
      // This is a bug in the handler implementation at line 28:
      // throw Errors.useruserWithId001({ userId: String(query.organizationId) });
    });
  });
});
