/**
 * Unit Tests for UserRolesResponseDto
 *
 * Tests constructor and static factory methods.
 */

import { validate } from 'class-validator';

import { UserRolesResponseDto } from '../user-roles-response.dto';

describe('UserRolesResponseDto', () => {
  describe('constructor', () => {
    it('should create DTO with roles and permissions', () => {
      // Arrange
      const data = {
        roles: ['admin', 'user'],
        permissions: ['read:users', 'write:users']
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.roles).toEqual(['admin', 'user']);
      expect(dto.permissions).toEqual(['read:users', 'write:users']);
    });

    it('should create DTO with empty arrays', () => {
      // Arrange
      const data = { roles: [], permissions: [] };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.roles).toEqual([]);
      expect(dto.permissions).toEqual([]);
    });

    it('should create DTO with single role', () => {
      // Arrange
      const data = {
        roles: ['viewer'],
        permissions: ['read:products']
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.roles).toHaveLength(1);
      expect(dto.roles[0]).toBe('viewer');
    });

    it('should create DTO with many roles and permissions', () => {
      // Arrange
      const data = {
        roles: ['system_owner', 'tenant_admin', 'moderator', 'user'],
        permissions: ['system:*', 'tenant:users:read', 'tenant:users:write', 'tenant:posts:read']
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.roles).toHaveLength(4);
      expect(dto.permissions).toHaveLength(4);
    });

    it('should preserve original array references', () => {
      // Arrange
      const roles = ['admin'];
      const permissions = ['read:all'];
      const data = { roles, permissions };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.roles).toBe(roles);
      expect(dto.permissions).toBe(permissions);
    });
  });

  describe('static create', () => {
    it('should create DTO using static factory method', () => {
      // Arrange
      const roles = ['admin'];
      const permissions = ['admin:*'];

      // Act
      const dto = UserRolesResponseDto.create(roles, permissions);

      // Assert
      expect(dto).toBeInstanceOf(UserRolesResponseDto);
      expect(dto.roles).toEqual(['admin']);
      expect(dto.permissions).toEqual(['admin:*']);
    });

    it('should create DTO with empty arrays using static method', () => {
      // Act
      const dto = UserRolesResponseDto.create([], []);

      // Assert
      expect(dto).toBeInstanceOf(UserRolesResponseDto);
      expect(dto.roles).toEqual([]);
      expect(dto.permissions).toEqual([]);
    });

    it('should handle multiple roles via static method', () => {
      // Arrange
      const roles = ['tenant_owner', 'tenant_admin'];
      const permissions = ['tenant:*', 'tenant:users:write'];

      // Act
      const dto = UserRolesResponseDto.create(roles, permissions);

      // Assert
      expect(dto.roles).toEqual(['tenant_owner', 'tenant_admin']);
      expect(dto.permissions).toEqual(['tenant:*', 'tenant:users:write']);
    });
  });

  describe('validation', () => {
    it('should pass validation with valid arrays', async () => {
      // Arrange
      const dto = new UserRolesResponseDto({
        roles: ['admin'],
        permissions: ['read:all']
      });

      // Act - validate directly without re-instantiating
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with empty arrays', async () => {
      // Arrange
      const dto = new UserRolesResponseDto({
        roles: [],
        permissions: []
      });

      // Act - validate directly without re-instantiating
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with non-array roles', async () => {
      // Arrange - create instance and manually set invalid property
      const dto = new UserRolesResponseDto({ roles: [], permissions: [] });
      // @ts-expect-error - testing invalid data
      dto.roles = 'admin';

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail validation with non-string array items', async () => {
      // Arrange - create instance and manually set invalid property
      const dto = new UserRolesResponseDto({ roles: [], permissions: [] });
      // @ts-expect-error - testing invalid data
      dto.roles = [123, 456];

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate roles', () => {
      // Arrange
      const data = {
        roles: ['admin', 'admin', 'user'],
        permissions: ['read:all']
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.roles).toEqual(['admin', 'admin', 'user']);
      expect(dto.roles).toHaveLength(3);
    });

    it('should handle duplicate permissions', () => {
      // Arrange
      const data = {
        roles: ['admin'],
        permissions: ['read:users', 'read:users', 'write:users']
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.permissions).toEqual(['read:users', 'read:users', 'write:users']);
      expect(dto.permissions).toHaveLength(3);
    });

    it('should handle wildcard permissions', () => {
      // Arrange
      const data = {
        roles: ['system_owner'],
        permissions: ['system:*', '*']
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.permissions).toContain('system:*');
      expect(dto.permissions).toContain('*');
    });

    it('should handle long permission strings', () => {
      // Arrange
      const longPermission = 'organization:department:team:project:resource:action';
      const data = {
        roles: ['admin'],
        permissions: [longPermission]
      };

      // Act
      const dto = new UserRolesResponseDto(data);

      // Assert
      expect(dto.permissions[0]).toBe(longPermission);
    });
  });
});
