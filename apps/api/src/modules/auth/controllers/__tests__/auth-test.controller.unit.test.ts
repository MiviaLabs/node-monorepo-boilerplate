/**
 * Unit Tests for IdentityProbeController
 *
 * Tests auth testing endpoints for guard and decorator testing.
 * Verifies alignment with OPA policies for role definitions.
 */

import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TENANT_ROLE } from '@package/constants';

import { EnhancedPermissionsGuard, RolesGuard } from '../../guards/auth.guards';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { IdentityProbeController } from '../auth-test.controller';

import type { TestingModule } from '@nestjs/testing';

import { EnvironmentGuard } from '@/common/guards/environment.guard';

describe('IdentityProbeController', () => {
  let controller: IdentityProbeController;
  let reflector: Reflector;

  // Valid roles from OPA policies and constants
  const VALID_TENANT_ROLES = [
    TENANT_ROLE.OWNER, // 'tenant_owner'
    TENANT_ROLE.ADMIN, // 'tenant_admin'
    TENANT_ROLE.USER, // 'tenant_user'
    TENANT_ROLE.VIEWER // 'tenant_viewer'
  ];

  // Invalid roles that should NOT be used
  const INVALID_ROLES = ['admin', 'moderator'];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityProbeController],
      providers: [Reflector]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EnhancedPermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EnvironmentGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IdentityProbeController>(IdentityProbeController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('getAdminDashboard', () => {
    it('should return admin access granted message', () => {
      // Act
      const result = controller.getAdminDashboard();

      // Assert
      expect(result).toEqual({ message: 'Admin access granted' });
    });

    it('should have correct roles metadata aligned with OPA policies', () => {
      // Act
      const roles = reflector.get<string[]>('roles', controller.getAdminDashboard);

      // Assert - Verify only OPA-defined roles are used
      expect(roles).toBeDefined();
      expect(roles).toEqual([TENANT_ROLE.OWNER, TENANT_ROLE.ADMIN]);

      // Verify no invalid roles are present
      INVALID_ROLES.forEach((invalidRole) => {
        expect(roles).not.toContain(invalidRole);
      });

      // Verify all roles are from valid set
      roles?.forEach((role) => {
        expect(VALID_TENANT_ROLES).toContain(role);
      });
    });
  });

  describe('createPost', () => {
    it('should return created post with id and timestamp', () => {
      // Arrange
      const post = { title: 'Test Post' };

      // Act
      const result = controller.createPost(post);

      // Assert
      expect(result).toMatchObject({
        title: 'Test Post',
        id: 'test-post-id'
      });
      expect(result['createdAt']).toBeDefined();
    });

    it('should preserve post properties', () => {
      // Arrange
      const post = { title: 'Another Post', tenantId: 'primary-encryption-key' };

      // Act
      const result = controller.createPost(post);

      // Assert
      expect(result['title']).toBe('Another Post');
      expect(result['tenantId']).toBe('primary-encryption-key');
    });
  });

  describe('deletePost', () => {
    it('should return post deleted message', () => {
      // Act
      const result = controller.deletePost();

      // Assert
      expect(result).toEqual({ message: 'Post deleted' });
    });
  });

  describe('getPosts', () => {
    it('should return empty array', () => {
      // Act
      const result = controller.getPosts();

      // Assert
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getTenant', () => {
    it('should return tenant ID', () => {
      // Act
      const result = controller.getTenant('primary-encryption-key');

      // Assert
      expect(result).toEqual({ tenantId: 'primary-encryption-key' });
    });
  });

  describe('getEmail', () => {
    it('should return email', () => {
      // Act
      const result = controller.getEmail('user@example.com');

      // Assert
      expect(result).toEqual({ email: 'user@example.com' });
    });
  });

  describe('getActor', () => {
    it('should return actor ID', () => {
      // Act
      const result = controller.getActor('actor-456');

      // Assert
      expect(result).toEqual({ actorId: 'actor-456' });
    });
  });

  describe('getUserId', () => {
    it('should return user ID', () => {
      // Act
      const result = controller.getUserId('user-789');

      // Assert
      expect(result).toEqual({ userId: 'user-789' });
    });
  });
});
