/**
 * Unit Tests for GetUserRolesHandler
 *
 * Tests user roles and permissions retrieval.
 */

import { Test } from '@nestjs/testing';

import { UserRolesResponseDto } from '../../../dto/user-roles-response.dto';
import { GetUserRolesQuery } from '../../../queries/get-user-roles.query';
import { RoleRepository } from '../../../repositories';
import { GetUserRolesHandler } from '../get-user-roles.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

// Mock getPermissionsForRole from @package/constants
jest.mock('@package/constants', () => ({
  getPermissionsForRole: jest.fn((role: string) => {
    const permissions: Record<string, string[]> = {
      system_owner: ['system:*', 'tenant:*'],
      tenant_admin: ['tenant:users:read', 'tenant:users:write', 'tenant:settings:read'],
      tenant_member: ['tenant:read'],
      moderator: ['tenant:posts:moderate', 'tenant:users:read']
    };
    return permissions[role] ?? [];
  })
}));

describe('GetUserRolesHandler', () => {
  let handler: GetUserRolesHandler;
  let roleRepository: jest.Mocked<RoleRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;

  beforeEach(async () => {
    const mockRoleRepository = {
      getSystemRolesForUser: jest.fn(),
      getTenantRoleForUser: jest.fn()
    };
    const mockAuditOutbox = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUserRolesHandler,
        {
          provide: RoleRepository,
          useValue: mockRoleRepository
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: {}
        }
      ]
    }).compile();

    handler = module.get<GetUserRolesHandler>(GetUserRolesHandler);
    roleRepository = module.get(RoleRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return roles and permissions for user with system roles only', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue(['system_owner']);
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({
        tenantId: 123,
        userId: 456,
        actorId: '456',
        requestId: 'req-roles-1',
        correlationId: 'corr-roles-1',
        causationId: 'cause-roles-1'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBeInstanceOf(UserRolesResponseDto);
      expect(result.roles).toEqual(['system_owner']);
      expect(result.permissions).toContain('system:*');
      expect(result.permissions).toContain('tenant:*');
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'auth.roles.viewed.audit',
          correlationId: 'corr-roles-1',
          causationId: 'cause-roles-1',
          payload: expect.objectContaining({
            requestId: 'req-roles-1',
            details: expect.objectContaining({
              roleCount: 1,
              permissionCount: 2
            })
          })
        })
      );
    });

    it('should return roles and permissions for user with tenant role only', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue([]);
      roleRepository.getTenantRoleForUser.mockResolvedValue('tenant_admin');

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.roles).toEqual(['tenant_admin']);
      expect(result.permissions).toContain('tenant:users:read');
      expect(result.permissions).toContain('tenant:users:write');
    });

    it('should combine system and tenant roles', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue(['moderator']);
      roleRepository.getTenantRoleForUser.mockResolvedValue('tenant_member');

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.roles).toEqual(['moderator', 'tenant_member']);
      expect(result.roles).toHaveLength(2);
    });

    it('should deduplicate permissions across roles', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue(['moderator']);
      roleRepository.getTenantRoleForUser.mockResolvedValue('tenant_admin');

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      const result = await handler.execute(query);

      // Assert
      // tenant:users:read appears in both moderator and tenant_admin
      const userReadCount = result.permissions.filter((p) => p === 'tenant:users:read').length;
      expect(userReadCount).toBe(1); // Deduplicated
    });

    it('should return empty arrays when user has no roles', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue([]);
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.roles).toEqual([]);
      expect(result.permissions).toEqual([]);
    });

    it('should handle multiple system roles', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue(['system_owner', 'moderator']);
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.roles).toEqual(['system_owner', 'moderator']);
      expect(result.permissions).toContain('system:*');
      expect(result.permissions).toContain('tenant:posts:moderate');
    });

    it('should call repository with correct parameters', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue([]);
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({ tenantId: 999, userId: 888 });

      // Act
      await handler.execute(query);

      // Assert
      expect(roleRepository.getSystemRolesForUser).toHaveBeenCalledWith(888);
      expect(roleRepository.getTenantRoleForUser).toHaveBeenCalledWith(999, 888);
    });

    it('should handle unknown role gracefully', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue(['unknown_role']);
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result.roles).toEqual(['unknown_role']);
      expect(result.permissions).toEqual([]); // No permissions for unknown role
    });
  });

  describe('role repository interactions', () => {
    it('should call getSystemRolesForUser before getTenantRoleForUser', async () => {
      // Arrange
      const callOrder: string[] = [];
      roleRepository.getSystemRolesForUser.mockImplementation(async () => {
        callOrder.push('system');
        return [];
      });
      roleRepository.getTenantRoleForUser.mockImplementation(async () => {
        callOrder.push('tenant');
        return null;
      });

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act
      await handler.execute(query);

      // Assert
      expect(callOrder).toEqual(['system', 'tenant']);
    });

    it('should throw if system roles repository returns undefined (not iterable)', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue(undefined as unknown as string[]);
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act & Assert
      // Handler doesn't have defensive coding for undefined - it throws
      await expect(handler.execute(query)).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should propagate repository errors for system roles', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockRejectedValue(new Error('Database error'));
      roleRepository.getTenantRoleForUser.mockResolvedValue(null);

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Database error');
    });

    it('should propagate repository errors for tenant role', async () => {
      // Arrange
      roleRepository.getSystemRolesForUser.mockResolvedValue([]);
      roleRepository.getTenantRoleForUser.mockRejectedValue(new Error('Tenant lookup failed'));

      const query = new GetUserRolesQuery({ tenantId: 123, userId: 456 });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Tenant lookup failed');
    });
  });
});
