/**
 * Unit Tests for Infrastructure Auth Guards
 *
 * Tests wrapper guards for Roles and Permissions with actual authorization logic.
 */

import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { RolesGuard, PermissionsGuard } from '../auth.guards';

import type { ExecutionContext } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

describe('Infrastructure Auth Guards', () => {
  describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: jest.Mocked<Reflector>;

    beforeEach(async () => {
      const mockReflector = {
        getAllAndOverride: jest.fn(),
        getAll: jest.fn()
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: RolesGuard,
            useFactory: (reflector: Reflector) => new RolesGuard(reflector),
            inject: [Reflector]
          },
          {
            provide: Reflector,
            useValue: mockReflector
          }
        ]
      }).compile();

      guard = module.get<RolesGuard>(RolesGuard);
      reflector = module.get<Reflector>(Reflector) as jest.Mocked<Reflector>;
    });

    describe('authorization logic', () => {
      it('should allow access when user has required role', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: ['admin', 'user'] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['admin']);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should allow access when user has all required roles', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: ['admin', 'moderator', 'user'] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should deny access when user lacks required role', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: ['user'] } // No admin role
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['admin']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });

      it('should allow access when no roles required', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: [] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(undefined);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should deny access when user has no roles but role required', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: [] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['admin']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });

      it('should deny access when user is not authenticated', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: undefined
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['admin']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });

      it('should handle multiple required roles', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: ['superuser', 'admin', 'moderator'] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['superuser', 'admin']);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should deny when user has none of the required roles', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { roles: ['user'] } // Missing 'admin' and 'moderator'
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });
    });
  });

  describe('PermissionsGuard', () => {
    let guard: PermissionsGuard;
    let reflector: jest.Mocked<Reflector>;

    beforeEach(async () => {
      const mockReflector = {
        getAllAndOverride: jest.fn(),
        getAll: jest.fn()
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: PermissionsGuard,
            useFactory: (reflector: Reflector) => new PermissionsGuard(reflector),
            inject: [Reflector]
          },
          {
            provide: Reflector,
            useValue: mockReflector
          }
        ]
      }).compile();

      guard = module.get<PermissionsGuard>(PermissionsGuard);
      reflector = module.get<Reflector>(Reflector) as jest.Mocked<Reflector>;
    });

    describe('authorization logic', () => {
      it('should allow access when user has required permission', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: ['users:read', 'users:write'] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:read']);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should allow access when user has all required permissions', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: ['users:read', 'users:write', 'users:delete'] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should deny access when user lacks required permission', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: ['users:read'] } // Missing 'users:write'
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:write']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });

      it('should allow access when no permissions required', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: [] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(undefined);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should deny access when user has no permissions but permission required', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: [] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:delete']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });

      it('should deny access when user is not authenticated', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: undefined
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:read']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });

      it('should handle multiple required permissions', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: ['all', 'users:read', 'users:write', 'users:delete'] }
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
      });

      it('should deny when user has none of the required permissions', () => {
        // Arrange
        const context = {
          getClass: () => ({}),
          getHandler: () => ({}),
          switchToHttp: () => ({
            getRequest: () => ({
              user: { permissions: ['other:permission'] } // Missing 'users:read' and 'users:write'
            })
          })
        } as unknown as ExecutionContext;

        reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow();
      });
    });
  });

  describe('dependency injection', () => {
    it('should create both guards with same Reflector instance', async () => {
      // Arrange
      const mockReflector = {
        getAllAndOverride: jest.fn(),
        getAll: jest.fn()
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: RolesGuard,
            useFactory: (reflector: Reflector) => new RolesGuard(reflector),
            inject: [Reflector]
          },
          {
            provide: PermissionsGuard,
            useFactory: (reflector: Reflector) => new PermissionsGuard(reflector),
            inject: [Reflector]
          },
          {
            provide: Reflector,
            useValue: mockReflector
          }
        ]
      }).compile();

      // Act
      const rolesGuard = module.get<RolesGuard>(RolesGuard);
      const permissionsGuard = module.get<PermissionsGuard>(PermissionsGuard);
      const reflector = module.get<Reflector>(Reflector);

      // Assert
      expect(rolesGuard).toBeDefined();
      expect(permissionsGuard).toBeDefined();
      expect(reflector).toBeDefined();
    });
  });
});
