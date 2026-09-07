/**
 * Unit Tests for JwtTenantGuard
 *
 * Tests JWT authentication guard.
 *
 * NOTE: Tenant header validation is now handled by TenantGuard (global APP_GUARD).
 * JwtTenantGuard focuses solely on JWT validation.
 */

import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AUTH_PROVIDER_FACTORY, AuthProviderType } from '@package/auth';

import { AuthRepository } from '../../repositories/auth.repository';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { JwtTenantGuard } from '../jwt-tenant.guard';

import type { ExecutionContext } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { AuthProviderFactory } from '@package/auth';

interface MockRequest {
  headers: Record<string, string | string[]>;
  user?: unknown;
}

interface MockExecutionContext {
  getClass: () => unknown;
  getHandler: () => unknown;
  switchToHttp: () => {
    getRequest: () => MockRequest;
  };
}

// Cast helper for passing mock context to guard
const toExecutionContext = (mock: MockExecutionContext): ExecutionContext =>
  mock as unknown as ExecutionContext;

function createMockJwtToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${headerB64}.${payloadB64}.mock-signature`;
}

describe('JwtTenantGuard', () => {
  let guard: JwtTenantGuard;
  let reflector: Reflector;
  let jwtService: JwtService;
  let authProviderFactory: AuthProviderFactory;
  let authRepository: { findById: jest.Mock };
  let organizationRepository: { findById: jest.Mock };

  const createMockExecutionContext = (
    _isPublic = false,
    token?: string,
    tenantId?: string
  ): MockExecutionContext => {
    const headers: Record<string, string | string[]> = {};
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    if (tenantId) {
      headers['x-tenant-id'] = tenantId;
    }

    // Create a single request object that will be returned by all calls to getRequest()
    // This ensures the guard modifies the same object that the test retrieves
    const request: MockRequest = { headers };

    return {
      getClass: () => ({}),
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request
      })
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTenantGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn()
          }
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn()
          }
        },
        {
          provide: AUTH_PROVIDER_FACTORY,
          useValue: {
            getProvider: jest.fn()
          }
        },
        {
          provide: AuthRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: 456, isActive: true })
          }
        },
        {
          provide: OrganizationRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: 1, isActive: true, deletedAt: null })
          }
        }
      ]
    }).compile();

    guard = module.get<JwtTenantGuard>(JwtTenantGuard);
    reflector = module.get<Reflector>(Reflector);
    jwtService = module.get<JwtService>(JwtService);
    authProviderFactory = module.get<AuthProviderFactory>(AUTH_PROVIDER_FACTORY);
    authRepository = module.get(AuthRepository);
    organizationRepository = module.get(OrganizationRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('public routes', () => {
    it('should allow access to public routes', async () => {
      // Arrange
      const context = createMockExecutionContext(true);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      // Act
      const result = await guard.canActivate(toExecutionContext(context));

      // Assert
      expect(result).toBe(true);
      expect(jwtService.verify).not.toHaveBeenCalled();
    });
  });

  describe('JWT validation', () => {
    it('should throw UnauthorizedException when token is missing', async () => {
      // Arrange
      const context = createMockExecutionContext(false, undefined, '123');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Access token is missing'
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      // Arrange
      const token = createMockJwtToken({ sub: 'user-1', tenant_id: '1', db_user_id: '10' });
      const context = createMockExecutionContext(false, token, '123');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Invalid or expired access token'
      );
    });

    it('should attach user to request after successful JWT validation', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com',
        roles: ['user']
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token, '123');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect(request.user).toEqual({
        userId: '456',
        tenantId: '1',
        actorId: '456',
        email: 'user@example.com',
        roles: ['user'],
        permissions: []
      });
    });

    it('should validate Firebase token via auth provider when configured', async () => {
      // Arrange
      const payload = {
        iss: 'https://securetoken.google.com/test-project',
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(payload);
      const context = createMockExecutionContext(false, token, '123');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const mockProvider = {
        validateToken: jest.fn().mockResolvedValue({
          valid: true,
          userId: 'firebase-uid',
          tenantId: '1',
          exp: 1234567890
        })
      };
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(mockProvider as never);

      // Act
      const result = await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect(result).toBe(true);
      expect(authProviderFactory.getProvider).toHaveBeenCalledWith(
        AuthProviderType.GOOGLE_IDENTITY_PLATFORM
      );
      expect(request.user).toEqual(
        expect.objectContaining({
          userId: '456',
          tenantId: '1',
          email: 'user@example.com'
        })
      );
    });

    it('should not fall back to auth provider validation when local JWT verification fails', async () => {
      const payload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(payload);
      const context = createMockExecutionContext(false, token, '123');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project';
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid algorithm');
      });

      const mockProvider = {
        validateToken: jest.fn().mockResolvedValue({
          valid: true,
          userId: 'firebase-uid',
          tenantId: '1',
          exp: 1234567890
        })
      };
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(mockProvider as never);

      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      expect(mockProvider.validateToken).not.toHaveBeenCalled();
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
    });
  });

  describe('buildCurrentUser', () => {
    it('should build CurrentUserData from payload with db_user_id', () => {
      // Arrange
      const payload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com',
        roles: ['admin'],
        permissions: ['read:all']
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result).toEqual({
        userId: '456',
        tenantId: '1',
        actorId: '456',
        email: 'user@example.com',
        roles: ['admin'],
        permissions: ['read:all']
      });
    });

    it('should use camelCase claims when snake_case not present', () => {
      // Arrange
      const payload = {
        sub: 'firebase-uid',
        tenantId: '1',
        dbUserId: '456',
        email: 'user@example.com'
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result.userId).toBe('456');
      expect(result.tenantId).toBe('1');
    });

    it('should fallback to sub when db_user_id is missing', () => {
      // Arrange
      const payload = {
        sub: 'firebase-uid-123',
        tenant_id: '1',
        email: 'user@example.com'
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result.userId).toBe('firebase-uid-123');
    });

    it('should handle number types for claims', () => {
      // Arrange
      const payload = {
        sub: 'firebase-uid',
        db_user_id: 456,
        tenant_id: 123
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result.userId).toBe('456');
      expect(result.tenantId).toBe('123');
    });

    it('should handle empty string claims', () => {
      // Arrange
      const payload = {
        sub: '',
        db_user_id: '',
        tenant_id: '',
        email: ''
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result.userId).toBe('');
      expect(result.tenantId).toBe('');
      expect(result.email).toBe('');
    });

    it('should default empty arrays for roles and permissions', () => {
      // Arrange
      const payload = {
        sub: 'uid',
        db_user_id: '456'
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result.roles).toEqual([]);
      expect(result.permissions).toEqual([]);
    });

    it('should handle non-array roles and permissions', () => {
      // Arrange
      const payload = {
        sub: 'uid',
        db_user_id: '456',
        roles: 'admin' as unknown as string[],
        permissions: null as unknown as string[]
      };

      // Act
      const result = guard['buildCurrentUser'](payload);

      // Assert
      expect(result.roles).toEqual([]);
      expect(result.permissions).toEqual([]);
    });
  });

  describe('principal activity checks', () => {
    it('should reject a soft-deleted user even with a valid token', async () => {
      const mockPayload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token, '1');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      authRepository.findById.mockResolvedValueOnce(null);

      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'User account is inactive or deleted'
      );
    });

    it('should reject a deleted organization even with a valid token', async () => {
      const mockPayload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token, '1');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      organizationRepository.findById.mockResolvedValueOnce({
        id: 1,
        isActive: false,
        deletedAt: new Date()
      });

      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Organization is inactive or deleted'
      );
    });
  });

  describe('token extraction', () => {
    it('should extract token from Bearer authorization header', () => {
      // Arrange
      const request = {
        headers: {
          authorization: 'Bearer my-token-123'
        }
      };

      // Act
      const result = guard['extractTokenFromHeader'](request as unknown as Request);

      // Assert
      expect(result).toBe('my-token-123');
    });

    it('should return undefined when authorization header is missing', () => {
      // Arrange
      const request = {
        headers: {}
      };

      // Act
      const result = guard['extractTokenFromHeader'](request as unknown as Request);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-Bearer authorization', () => {
      // Arrange
      const request = {
        headers: {
          authorization: 'Basic token-123'
        }
      };

      // Act
      const result = guard['extractTokenFromHeader'](request as unknown as Request);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle authorization header as array', () => {
      // Arrange
      const request = {
        headers: {
          authorization: ['Bearer my-token']
        }
      };

      // Act
      const result = guard['extractTokenFromHeader'](request as unknown as Request);

      // Assert - should extract token from first array element
      expect(result).toBe('my-token');
    });
  });
});
