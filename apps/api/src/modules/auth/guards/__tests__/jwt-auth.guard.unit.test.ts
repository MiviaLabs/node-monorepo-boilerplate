/**
 * Unit Tests for JwtAuthGuard
 *
 * Tests JWT authentication guard with Firebase token verification support.
 */

import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AUTH_PROVIDER_FACTORY, AuthProviderType } from '@package/auth';

import { AuthRepository } from '../../repositories/auth.repository';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { JwtAuthGuard } from '../jwt-auth.guard';

import type { ExecutionContext } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { AuthProviderFactory } from '@package/auth';

interface MockRequest {
  headers: Record<string, string>;
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

/**
 * Helper to create a valid JWT-like token for testing
 *
 * Creates a token with 3 parts (header.payload.signature) where header and payload
 * are valid base64-encoded JSON. The signature can be any string since JwtService.verify
 * is mocked in tests.
 *
 * @param payload - The payload object to encode
 * @returns A JWT-like token string
 */
function createMockJwtToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock-signature';
  return `${headerB64}.${payloadB64}.${signature}`;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let jwtService: JwtService;
  let authProviderFactory: AuthProviderFactory;
  let authRepository: { findById: jest.Mock };
  let organizationRepository: { findById: jest.Mock };

  const createMockExecutionContext = (_isPublic = false, token?: string): MockExecutionContext => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }

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
        JwtAuthGuard,
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

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
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

  describe('token extraction', () => {
    it('should extract token from Bearer authorization header', async () => {
      // Arrange
      const token = createMockJwtToken({
        sub: 'user-123',
        tenant_id: '1',
        db_user_id: '456'
      });
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        tenant_id: '1',
        db_user_id: '456'
      });

      // Act
      const result = await guard.canActivate(toExecutionContext(context));

      // Assert
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      // Arrange
      const context = createMockExecutionContext(false);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Access token is missing'
      );
    });

    it('should throw UnauthorizedException when authorization header is not Bearer', async () => {
      // Arrange
      const context = createMockExecutionContext(false);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Add non-Bearer authorization header
      context.switchToHttp().getRequest().headers = {
        authorization: 'Basic invalid-token'
      };

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Access token is missing'
      );
    });
  });

  describe('local JWT verification', () => {
    beforeEach(() => {
      // Mock GCP as not configured
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(undefined);
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
      delete process.env['FIREBASE_PROJECT_ID'];
      delete process.env['GCP_PROJECT_ID'];
      delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    });

    it('should verify local JWT token successfully', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid-123',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com',
        roles: ['user'],
        permissions: ['read:own']
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      const result = await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect(result).toBe(true);
      expect(jwtService.verify).toHaveBeenCalledWith(token);
      // actorId falls back to sub when no actor_id claim is present
      expect((request.user as { userId?: string }).userId).toBe('456');
      expect((request.user as { tenantId?: string }).tenantId).toBe('1');
      expect((request.user as { actorId?: string }).actorId).toBe('firebase-uid-123');
      expect((request.user as { email?: string }).email).toBe('user@example.com');
      expect((request.user as { roles?: string[] }).roles).toEqual(['user']);
      expect((request.user as { permissions?: string[] }).permissions).toEqual(['read:own']);
    });

    it('should throw UnauthorizedException for invalid local JWT', async () => {
      // Arrange
      const token = createMockJwtToken({ sub: 'test' });
      const context = createMockExecutionContext(false, token);
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

    it('should not fall back to auth provider validation when local JWT verification fails', async () => {
      const payload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(payload);
      const context = createMockExecutionContext(false, token);
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

    it('should use sub as fallback when db_user_id is missing', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid-123',
        tenant_id: '1',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      const result = await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect(result).toBe(true);
      expect((request.user as { userId?: string }).userId).toBe('firebase-uid-123');
    });
  });

  describe('Firebase token verification', () => {
    beforeEach(() => {
      // Mock GCP as configured
      const mockProvider = {
        name: 'google-identity-platform',
        type: AuthProviderType.GOOGLE_IDENTITY_PLATFORM,
        authenticate: jest.fn(),
        validateToken: jest.fn(),
        getToken: jest.fn(),
        refreshToken: jest.fn(),
        revokeToken: jest.fn(),
        getUserInfo: jest.fn(),
        getProviderUrl: jest.fn(),
        isEnabled: jest.fn(),
        initialize: jest.fn(),
        healthCheck: jest.fn()
      };
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(mockProvider as never);
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project';
    });

    it('should verify Firebase token when GCP is configured', async () => {
      // Arrange
      const token = createMockJwtToken({
        iss: 'https://securetoken.google.com/test-project',
        sub: 'firebase-uid-123',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      });
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const mockProvider = authProviderFactory.getProvider(
        AuthProviderType.GOOGLE_IDENTITY_PLATFORM
      ) as unknown as { validateToken: jest.Mock };
      jest.spyOn(mockProvider, 'validateToken').mockResolvedValue({
        valid: true,
        userId: 'firebase-uid-123',
        tenantId: '1',
        exp: 1234567890
      });

      // Act
      const result = await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect(result).toBe(true);
      expect(request.user).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid Firebase token', async () => {
      // Arrange
      const token = createMockJwtToken({
        iss: 'https://securetoken.google.com/test-project',
        sub: 'test'
      });
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const mockProvider = authProviderFactory.getProvider(
        AuthProviderType.GOOGLE_IDENTITY_PLATFORM
      ) as unknown as { validateToken: jest.Mock };
      jest.spyOn(mockProvider, 'validateToken').mockResolvedValue({
        valid: false,
        error: 'Invalid Firebase token'
      });

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Invalid Firebase token'
      );
    });

    it('should throw UnauthorizedException when auth provider not available', async () => {
      // Arrange
      const token = createMockJwtToken({
        iss: 'https://securetoken.google.com/test-project',
        sub: 'test'
      });
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(undefined);

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'GCP Identity Platform provider not available'
      );
    });
  });

  describe('payload extraction', () => {
    it('should extract user data from JWT payload with snake_case claims', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com',
        username: 'johndoe',
        name: 'John Doe',
        roles: ['admin', 'user'],
        permissions: ['read:all', 'write:own']
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert - actorId falls back to sub when no actor_id claim is present
      expect((request.user as { userId?: string }).userId).toBe('456');
      expect((request.user as { tenantId?: string }).tenantId).toBe('1');
      expect((request.user as { actorId?: string }).actorId).toBe('firebase-uid');
      expect((request.user as { email?: string }).email).toBe('user@example.com');
      expect((request.user as { username?: string }).username).toBe('johndoe');
      expect((request.user as { name?: string }).name).toBe('John Doe');
      expect((request.user as { roles?: string[] }).roles).toEqual(['admin', 'user']);
      expect((request.user as { permissions?: string[] }).permissions).toEqual([
        'read:all',
        'write:own'
      ]);
    });

    it('should extract user data from JWT payload with camelCase claims', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid',
        tenantId: '1',
        dbUserId: '456',
        email: 'user@example.com',
        roles: ['user'],
        permissions: ['read:own']
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert - actorId falls back to sub when no actor_id claim is present
      expect((request.user as { userId?: string }).userId).toBe('456');
      expect((request.user as { tenantId?: string }).tenantId).toBe('1');
      expect((request.user as { actorId?: string }).actorId).toBe('firebase-uid');
      expect((request.user as { email?: string }).email).toBe('user@example.com');
      expect((request.user as { roles?: string[] }).roles).toEqual(['user']);
      expect((request.user as { permissions?: string[] }).permissions).toEqual(['read:own']);
    });

    it('should handle missing optional fields in payload', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid',
        db_user_id: '456'
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert - actorId falls back to sub (firebase-uid) when no actor_id claim
      // and userId is set to db_user_id (456)
      expect((request.user as { userId?: string }).userId).toBe('456');
      expect((request.user as { tenantId?: string }).tenantId).toBe('');
      expect((request.user as { actorId?: string }).actorId).toBe('firebase-uid');
      expect((request.user as { email?: string }).email).toBe('');
      expect((request.user as { roles?: string[] }).roles).toEqual([]);
      expect((request.user as { permissions?: string[] }).permissions).toEqual([]);
    });

    it('should handle null and undefined values in payload', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid',
        db_user_id: null,
        tenant_id: undefined,
        email: null,
        username: undefined
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect((request.user as { userId?: string }).userId).toBe('firebase-uid'); // fallback to sub
      expect((request.user as { tenantId?: string }).tenantId).toBe('');
      expect((request.user as { email?: string }).email).toBe('');
    });

    it('should handle non-string values in payload', async () => {
      // Arrange
      const mockPayload = {
        sub: 'firebase-uid',
        db_user_id: 456, // number
        tenant_id: 123, // number
        email: 'user@example.com',
        roles: ['admin'],
        permissions: null // null should become empty array
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      // Act
      await guard.canActivate(toExecutionContext(context));
      const request = context.switchToHttp().getRequest();

      // Assert
      expect((request.user as { userId?: string }).userId).toBe('456'); // converted to string
      expect((request.user as { tenantId?: string }).tenantId).toBe('123'); // converted to string
      expect((request.user as { email?: string }).email).toBe('user@example.com');
      expect((request.user as { roles?: string[] }).roles).toEqual(['admin']);
      expect((request.user as { permissions?: string[] }).permissions).toEqual([]);
    });
  });

  describe('principal activity checks', () => {
    it('should reject a soft-deleted or inactive user even with a valid token', async () => {
      const mockPayload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);
      authRepository.findById.mockResolvedValueOnce(null);

      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'User account is inactive or deleted'
      );
      expect(organizationRepository.findById).toHaveBeenCalledWith('1');
    });

    it('should reject a deleted organization even with a valid token', async () => {
      const mockPayload = {
        sub: 'firebase-uid',
        tenant_id: '1',
        db_user_id: '456',
        email: 'user@example.com'
      };
      const token = createMockJwtToken(mockPayload);
      const context = createMockExecutionContext(false, token);
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

  describe('token payload decoding', () => {
    it('should decode valid JWT token payload', async () => {
      // Arrange - create a valid JWT-like token structure
      const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64');
      const payload = Buffer.from('{"sub":"123","tenant_id":"1"}').toString('base64');
      const signature = 'signature';
      const token = `${header}.${payload}.${signature}`;

      const context = createMockExecutionContext(false, token);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest.spyOn(jwtService, 'verify').mockReturnValue({ sub: '123', tenant_id: '1' });

      // Act
      const result = await guard.canActivate(toExecutionContext(context));

      // Assert
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException for malformed token', async () => {
      // Arrange - token with only 2 parts (not valid JWT format)
      const context = createMockExecutionContext(false, 'invalid.token');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        'Invalid token format'
      );
    });

    it('should throw UnauthorizedException for token with invalid base64', async () => {
      // Arrange
      const context = createMockExecutionContext(false, 'header.not-base64.signature');
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Act & Assert
      await expect(guard.canActivate(toExecutionContext(context))).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('Firebase token detection', () => {
    it('should detect Firebase token by securetoken.google.com issuer', () => {
      // Arrange
      const guardWithMockedGcp = Object.create(JwtAuthGuard.prototype);
      Object.assign(guardWithMockedGcp, guard);

      // Act & Assert
      expect(
        guardWithMockedGcp['isFirebaseToken']({
          iss: 'https://securetoken.google.com/test-project'
        })
      ).toBe(true);
    });

    it('should not detect non-Firebase token', () => {
      // Arrange
      const guardWithMockedGcp = Object.create(JwtAuthGuard.prototype);
      Object.assign(guardWithMockedGcp, guard);

      // Act & Assert
      expect(
        guardWithMockedGcp['isFirebaseToken']({
          iss: 'https://custom-issuer.com'
        })
      ).toBe(false);
    });

    it('should handle missing issuer in payload', () => {
      // Arrange
      const guardWithMockedGcp = Object.create(JwtAuthGuard.prototype);
      Object.assign(guardWithMockedGcp, guard);

      // Act & Assert
      expect(guardWithMockedGcp['isFirebaseToken']({})).toBe(false);
    });
  });

  describe('GCP configuration detection', () => {
    afterEach(() => {
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];
      delete process.env['FIREBASE_PROJECT_ID'];
      delete process.env['GCP_PROJECT_ID'];
      delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    });

    it('should detect GCP configuration from environment variable', () => {
      // Arrange
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project';

      // Act
      const result = guard['isGcpConfigured']();

      // Assert
      expect(result).toBe(true);
    });

    it('should detect GCP configuration from auth provider factory', () => {
      // Arrange
      const mockProvider = {
        name: 'google-identity-platform',
        type: AuthProviderType.GOOGLE_IDENTITY_PLATFORM,
        authenticate: jest.fn(),
        validateToken: jest.fn(),
        getToken: jest.fn(),
        refreshToken: jest.fn(),
        revokeToken: jest.fn(),
        getUserInfo: jest.fn(),
        getProviderUrl: jest.fn(),
        isEnabled: jest.fn(),
        initialize: jest.fn(),
        healthCheck: jest.fn()
      };
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(mockProvider as never);

      // Act
      const result = guard['isGcpConfigured']();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when GCP is not configured', () => {
      // Arrange
      jest.spyOn(authProviderFactory, 'getProvider').mockReturnValue(undefined);

      // Act
      const result = guard['isGcpConfigured']();

      // Assert
      expect(result).toBe(false);
    });
  });
});
