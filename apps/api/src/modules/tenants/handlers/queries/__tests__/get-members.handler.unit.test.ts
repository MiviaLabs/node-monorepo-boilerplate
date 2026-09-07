/**
 * Unit Tests for GetMembersHandler
 *
 * Tests paginated member retrieval via TenantService delegation.
 */

import { Test } from '@nestjs/testing';

import { GetMembersQuery } from '../../../queries/get-members.query';
import { TenantService } from '../../../services/tenant.service';
import { GetMembersHandler } from '../get-members.handler';

import type { TestingModule } from '@nestjs/testing';

describe('GetMembersHandler', () => {
  let handler: GetMembersHandler;
  let tenantService: jest.Mocked<TenantService>;

  const mockMembersResponse = {
    data: [
      {
        id: 1,
        email: 'admin@acme.com',
        name: 'Admin User',
        role: 'tenant_owner',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 2,
        email: 'user@acme.com',
        name: 'Regular User',
        role: 'tenant_user',
        status: 'active',
        createdAt: '2024-01-02T00:00:00.000Z'
      }
    ],
    metadata: {
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }
    }
  };

  beforeEach(async () => {
    const mockTenantService = {
      getMembers: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetMembersHandler,
        {
          provide: TenantService,
          useValue: mockTenantService
        }
      ]
    }).compile();

    handler = module.get<GetMembersHandler>(GetMembersHandler);
    tenantService = module.get(TenantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return paginated members', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1' });
      tenantService.getMembers.mockResolvedValue(mockMembersResponse);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual(mockMembersResponse);
    });

    it('should delegate to TenantService.getMembers with pagination', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1', page: 2, pageSize: 10 });
      tenantService.getMembers.mockResolvedValue(mockMembersResponse);

      // Act
      await handler.execute(query);

      // Assert
      expect(tenantService.getMembers).toHaveBeenCalledWith({
        tenantId: '1',
        actorId: undefined,
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        page: 2,
        pageSize: 10
      });
    });

    it('should use default pagination values', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1' });
      tenantService.getMembers.mockResolvedValue(mockMembersResponse);

      // Act
      await handler.execute(query);

      // Assert
      expect(tenantService.getMembers).toHaveBeenCalledWith({
        tenantId: '1',
        actorId: undefined,
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        page: 1,
        pageSize: 20
      });
    });

    it('should return member data with expected structure', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1' });
      tenantService.getMembers.mockResolvedValue(mockMembersResponse);

      // Act
      const result = (await handler.execute(query)) as typeof mockMembersResponse;

      // Assert
      expect(result.data).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return pagination metadata', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1' });
      tenantService.getMembers.mockResolvedValue(mockMembersResponse);

      // Act
      const result = (await handler.execute(query)) as typeof mockMembersResponse;

      // Assert
      expect(result.metadata.pagination).toBeDefined();
      expect(result.metadata.pagination.page).toBe(1);
      expect(result.metadata.pagination.pageSize).toBe(20);
      expect(result.metadata.pagination.total).toBe(2);
      expect(result.metadata.pagination.totalPages).toBe(1);
      expect(result.metadata.pagination.hasNext).toBe(false);
      expect(result.metadata.pagination.hasPrevious).toBe(false);
    });

    it('should handle different page values', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1', page: 3 });
      const paginatedResponse = {
        ...mockMembersResponse,
        metadata: {
          pagination: {
            ...mockMembersResponse.metadata.pagination,
            page: 3,
            hasPrevious: true
          }
        }
      };
      tenantService.getMembers.mockResolvedValue(paginatedResponse);

      // Act
      const result = (await handler.execute(query)) as typeof paginatedResponse;

      // Assert
      expect(tenantService.getMembers).toHaveBeenCalledWith({
        tenantId: '1',
        actorId: undefined,
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        page: 3,
        pageSize: 20
      });
      expect(result.metadata.pagination.page).toBe(3);
    });

    it('should handle different pageSize values', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1', pageSize: 50 });
      tenantService.getMembers.mockResolvedValue(mockMembersResponse);

      // Act
      await handler.execute(query);

      // Assert
      expect(tenantService.getMembers).toHaveBeenCalledWith({
        tenantId: '1',
        actorId: undefined,
        requestId: undefined,
        correlationId: undefined,
        causationId: undefined,
        page: 1,
        pageSize: 50
      });
    });

    it('should return empty data array when no members', async () => {
      // Arrange
      const query = new GetMembersQuery({ tenantId: '1' });
      const emptyResponse = {
        data: [],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false
          }
        }
      };
      tenantService.getMembers.mockResolvedValue(emptyResponse);

      // Act
      const result = (await handler.execute(query)) as typeof emptyResponse;

      // Assert
      expect(result.data).toEqual([]);
      expect(result.metadata.pagination.total).toBe(0);
    });
  });
});
