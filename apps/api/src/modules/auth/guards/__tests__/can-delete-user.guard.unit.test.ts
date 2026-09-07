/**
 * Unit Tests for CanDeleteUserGuard
 *
 * Tests authorization guard for user deletion operations.
 */

import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';

import { CanDeleteUserGuard } from '../can-delete-user.guard';

import type { CurrentUserData } from '@/common/decorators/current-user.decorator';
import type { ExecutionContext } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('CanDeleteUserGuard', () => {
  let guard: CanDeleteUserGuard;

  const createMockExecutionContext = (
    user: CurrentUserData | undefined,
    targetUserId: string,
    tenantId?: string
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { id: targetUserId },
          tenantId
        })
      }),
      getHandler: () => ({}),
      getClass: () => ({})
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CanDeleteUserGuard]
    }).compile();

    guard = module.get<CanDeleteUserGuard>(CanDeleteUserGuard);
  });

  describe('admin users', () => {
    it('should allow admin to delete any user', () => {
      // Arrange
      const adminUser: CurrentUserData = {
        userId: '1',
        tenantId: '1',
        actorId: '1',
        email: 'admin@example.com',
        roles: ['admin'],
        permissions: []
      };
      const context = createMockExecutionContext(adminUser, '999', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow admin to delete themselves', () => {
      // Arrange
      const adminUser: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'admin@example.com',
        roles: ['admin'],
        permissions: []
      };
      const context = createMockExecutionContext(adminUser, '123', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow admin with additional roles', () => {
      // Arrange
      const adminUser: CurrentUserData = {
        userId: '1',
        tenantId: '1',
        actorId: '1',
        email: 'super-admin@example.com',
        roles: ['admin', 'superuser', 'moderator'],
        permissions: []
      };
      const context = createMockExecutionContext(adminUser, '999', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('self-deletion', () => {
    it('should allow user to delete their own account', () => {
      // Arrange
      const regularUser: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(regularUser, '123', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow user with only user role to delete themselves', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '456',
        tenantId: '1',
        actorId: '456',
        email: 'regular@example.com',
        roles: ['user'],
        permissions: ['read:own']
      };
      const context = createMockExecutionContext(user, '456', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('unauthorized access', () => {
    it('should deny non-admin user deleting different user', () => {
      // Arrange
      const regularUser: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(regularUser, '456', '1');

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        Errors.authinsufficientPermissionsRequiredpermission004({
          requiredPermission: 'users:delete'
        })
      );
    });

    it('should deny user with custom role but not admin', () => {
      // Arrange
      const customRoleUser: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'moderator@example.com',
        roles: ['moderator'],
        permissions: ['moderate:content']
      };
      const context = createMockExecutionContext(customRoleUser, '456', '1');

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(
        Errors.authinsufficientPermissionsRequiredpermission004({
          requiredPermission: 'users:delete'
        })
      );
    });

    it('should deny when user is not authenticated', () => {
      // Arrange
      const context = createMockExecutionContext(undefined, '123', '1');

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(Errors.authinvalidEmailOr001({}));
    });
  });

  describe('edge cases', () => {
    it('should handle string number userId comparisons', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(user, '123', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle numeric string userId', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '999',
        tenantId: '1',
        actorId: '999',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(user, '999', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle empty roles array', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(user, '123', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle undefined roles', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '123',
        tenantId: '1',
        actorId: '123',
        email: 'user@example.com',
        roles: undefined as unknown as string[],
        permissions: []
      };
      const context = createMockExecutionContext(user, '123', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('admin role detection', () => {
    it('should identify admin from roles array', () => {
      // Arrange
      const adminUser: CurrentUserData = {
        userId: '1',
        tenantId: '1',
        actorId: '1',
        email: 'admin@example.com',
        roles: ['user', 'admin', 'moderator'],
        permissions: []
      };
      const context = createMockExecutionContext(adminUser, '999', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-admin roles', () => {
      // Arrange
      const moderatorUser: CurrentUserData = {
        userId: '1',
        tenantId: '1',
        actorId: '1',
        email: 'moderator@example.com',
        roles: ['user', 'moderator'],
        permissions: []
      };
      const context = createMockExecutionContext(moderatorUser, '999', '1');

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow();
    });
  });

  describe('self-deletion detection', () => {
    it('should correctly identify self-deletion', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '777',
        tenantId: '1',
        actorId: '777',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(user, '777', '1');

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should correctly identify non-self-deletion', () => {
      // Arrange
      const user: CurrentUserData = {
        userId: '777',
        tenantId: '1',
        actorId: '777',
        email: 'user@example.com',
        roles: [],
        permissions: []
      };
      const context = createMockExecutionContext(user, '888', '1');

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow();
    });
  });
});
