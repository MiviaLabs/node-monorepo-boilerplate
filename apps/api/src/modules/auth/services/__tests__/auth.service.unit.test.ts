/**
 * Unit Tests for AuthService
 *
 * Tests authentication service operations with mocked dependencies.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - authenticateWithEmailPassword: Email/password authentication flow
 * - authenticateWithOAuth: OAuth provider authentication
 * - authenticateWithPhone: Phone authentication (throws not implemented)
 * - registerWithEmailPassword: User registration with organization creation
 * - linkIdentity: Link identity provider to user
 * - unlinkIdentity: Unlink identity provider from user
 * - refreshToken: Token refresh flow
 * - logout: Session termination
 * - validateToken: Token validation
 * - getUserIdentities: Get user identities
 * - invalidateUserPermissions: Permission cache invalidation
 */

import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CachedPermissionService,
  CachedRoleService,
  RoleService,
  TokenExpiration
} from '@package/auth';
import { OutboxRepository } from '@package/events';
import { CacheService } from '@package/redis';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { AUTH_ERROR_CODES } from '../../auth.constants';
import { AuthRepository } from '../../repositories/auth.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';
import { AuthSessionStoreService } from '../auth-session-store.service';
import { AuthService } from '../auth.service';

import type { TestingModule } from '@nestjs/testing';
import type { AuthProviderFactory, IAuthProvider } from '@package/auth';
import type { User } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Mock IdentityProvider enum
jest.mock('@package/db-core', () => ({
  IdentityProvider: {
    EMAIL_PASSWORD: 'email_password',
    GOOGLE: 'google',
    GITHUB: 'github'
  }
}));

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let userIdentityRepository: jest.Mocked<UserIdentityRepository>;
  let cachedRoleService: jest.Mocked<CachedRoleService>;
  let cachedPermissionService: jest.Mocked<CachedPermissionService>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;
  let authProvider: jest.Mocked<IAuthProvider>;
  let authProviderFactory: jest.Mocked<AuthProviderFactory>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let authSessionStore: {
    isAccessTokenRevoked: jest.Mock;
    createSession: jest.Mock;
    getRefreshTokenInfo: jest.Mock;
    rotateSession: jest.Mock;
    revokeRefreshToken: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock; verify: jest.Mock };

  const mockUser: User = {
    id: 123,
    organizationId: 456,
    emailHash: 'email-hash-123',
    emailEncrypted: 'test@example.com',
    displayName: 'Test User',
    firstNameEncrypted: null,
    lastNameEncrypted: null,
    phoneNumberEncrypted: null,
    photoUrl: null,
    avatarFileId: null,
    encryptionKeyVersion: 'primary-encryption-key/1',
    isVerified: true,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    lastSignInAt: null
  };

  const mockOrganization = {
    id: 456,
    name: 'Test Org',
    displayName: 'Test Org',
    gcpTenantId: 'gcp-tenant-123',
    tenantId: 789,
    ownerId: 123,
    publicId: 'pub-456-uuid',
    slug: 'test-org',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null
  };

  const mockAuthResult = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    idToken: 'id-token-789',
    expiresIn: 3600,
    refreshExpiresIn: 86400
  };

  const mockIdentity = {
    id: 1,
    userId: 123,
    provider: 'email_password',
    providerUid: 'gcp-uid-123',
    providerEmailHash: 'hash123',
    providerEmailEncrypted: null,
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    photoUrl: null,
    emailVerified: true,
    phoneVerified: false,
    isPrimary: true,
    encryptionKeyVersion: 'primary-encryption-key/1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastSignInAt: null
  };

  const mockUserInfo = {
    userId: 'gcp-uid-123',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
    roles: [],
    permissions: [],
    tenantId: '456',
    attributes: {
      db_user_id: '123',
      tenant_id: '456'
    }
  };

  beforeEach(async () => {
    // Create mock auth provider
    authProvider = {
      name: 'google-identity-platform',
      type: 'google-identity-platform',
      authenticate: jest.fn().mockResolvedValue(mockAuthResult),
      getUserInfoFromToken: jest.fn().mockResolvedValue(mockUserInfo),
      refreshToken: jest.fn().mockResolvedValue(mockAuthResult),
      validateToken: jest.fn().mockResolvedValue({ valid: true }),
      logout: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<IAuthProvider>;

    // Create mock provider factory
    authProviderFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(authProvider),
      getProvider: jest.fn().mockReturnValue(authProvider)
    } as unknown as jest.Mocked<AuthProviderFactory>;

    // Create mock transaction
    dbTransaction = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([mockUser])
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined)
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    // Create mock database
    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    // Create mock repositories
    const mockAuthRepository = {
      findWithOrganizationByEmail: jest.fn(),
      findOrganizationById: jest.fn(),
      findById: jest.fn(),
      decryptEmail: jest.fn().mockImplementation(async (value: string) => value),
      findByEmail: jest.fn(),
      createWithEmail: jest.fn(),
      createWithEmailInTransaction: jest.fn(),
      createOrganizationForUser: jest.fn(),
      setOrganizationOwnerInTransaction: jest.fn()
    };

    const mockUserIdentityRepository = {
      findByProviderAndUid: jest.fn(),
      findByUserId: jest.fn(),
      createWithUserId: jest.fn(),
      createWithTransaction: jest.fn(),
      updateLastSignIn: jest.fn(),
      updateLastSignInWithTransaction: jest.fn(),
      userHasProvider: jest.fn(),
      countByUserId: jest.fn(),
      delete: jest.fn()
    };

    // Create mock services
    const mockCache = {
      withLock: jest.fn().mockImplementation(async (_key, fn) => fn()),
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const mockRoleService = {
      getSystemRoles: jest.fn().mockResolvedValue([]),
      getTenantRole: jest.fn().mockResolvedValue(null),
      assignTenantRoleInTransaction: jest.fn().mockResolvedValue(undefined)
    };

    const mockCachedRoleService = {
      getUserRoles: jest.fn().mockResolvedValue(['user'])
    };

    const mockCachedPermissionService = {
      getUserPermissions: jest.fn().mockResolvedValue(['read:profile']),
      invalidatePermissions: jest.fn().mockResolvedValue(undefined),
      invalidateAllPermissions: jest.fn().mockResolvedValue(undefined)
    };
    authSessionStore = {
      isAccessTokenRevoked: jest.fn().mockResolvedValue(false),
      createSession: jest.fn().mockResolvedValue({ sessionId: 'session-123' }),
      getRefreshTokenInfo: jest.fn(),
      rotateSession: jest.fn().mockResolvedValue({ sessionId: 'session-123' }),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined)
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('local-jwt-token'),
      verify: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: 'AUTH_PROVIDER_FACTORY',
          useValue: authProviderFactory
        },
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: UserIdentityRepository,
          useValue: mockUserIdentityRepository
        },
        {
          provide: CacheService,
          useValue: mockCache
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: RoleService,
          useValue: mockRoleService
        },
        {
          provide: CachedRoleService,
          useValue: mockCachedRoleService
        },
        {
          provide: CachedPermissionService,
          useValue: mockCachedPermissionService
        },
        {
          provide: AuthSessionStoreService,
          useValue: authSessionStore
        },
        {
          provide: JwtService,
          useValue: jwtService
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_EXPIRES_IN') return '1h';
              if (key === 'REFRESH_TOKEN_EXPIRES_IN') {
                return String(TokenExpiration.REFRESH_TOKEN);
              }
              return undefined;
            })
          }
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    service = module.get<AuthService>(AuthService);
    authRepository = module.get(AuthRepository);
    userIdentityRepository = module.get(UserIdentityRepository);
    cachedRoleService = module.get(CachedRoleService);
    cachedPermissionService = module.get(CachedPermissionService);
    outboxRepo = module.get(OutboxRepository);

    authRepository.findById.mockResolvedValue(mockUser as never);
    authRepository.findOrganizationById.mockResolvedValue(mockOrganization as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateWithEmailPassword', () => {
    it('should authenticate user with email and password', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });

      // Act
      const result = await service.authenticateWithEmailPassword(
        undefined,
        'test@example.com',
        'password123'
      );

      // Assert
      expect(authRepository.findWithOrganizationByEmail).toHaveBeenCalledWith(
        'test@example.com',
        undefined
      );
      expect(authProvider.authenticate).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test@example.com',
          password: 'password123',
          tenantId: 'gcp-tenant-123'
        })
      );
      expect(result.authResult).toBeDefined();
      expect(result.authResult.accessToken).toBe('local-jwt-token');
      expect(result.userInfo).toBeDefined();
      expect(result.isNewUser).toBe(false);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.authenticateWithEmailPassword(undefined, 'unknown@example.com', 'password')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when GCP authentication fails', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });
      authProvider.authenticate.mockRejectedValue(new Error('Invalid credentials'));

      // Act & Assert
      await expect(
        service.authenticateWithEmailPassword(undefined, 'test@example.com', 'wrongpassword')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should include roles and permissions from cache service', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });
      cachedRoleService.getUserRoles.mockResolvedValue(['admin', 'user']);
      cachedPermissionService.getUserPermissions.mockResolvedValue(['admin:*', 'read:profile']);

      // Act
      const result = await service.authenticateWithEmailPassword(
        undefined,
        'test@example.com',
        'password123'
      );

      // Assert
      expect(cachedRoleService.getUserRoles).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.organizationId
      );
      expect(cachedPermissionService.getUserPermissions).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.organizationId
      );
      expect(result.userInfo.roles).toEqual(['admin', 'user']);
      expect(result.userInfo.permissions).toEqual(['admin:*', 'read:profile']);
    });

    it('should issue app-local tokens after provider authentication', async () => {
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });

      const result = await service.authenticateWithEmailPassword(
        undefined,
        'test@example.com',
        'password123'
      );

      expect(jwtService.signAsync).toHaveBeenCalled();
      expect(result.authResult.accessToken).toBe('local-jwt-token');
      expect(result.authResult.idToken).toBe('local-jwt-token');
      expect(result.authResult.refreshToken).not.toBe(mockAuthResult.refreshToken);
      expect(authSessionStore.createSession).not.toHaveBeenCalled();
      expect(authProvider.refreshToken).not.toHaveBeenCalled();
    });

    it('should issue matching app-local access and id tokens for app authorization', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });

      // Act
      const result = await service.authenticateWithEmailPassword(
        undefined,
        'test@example.com',
        'password123'
      );

      // Assert
      expect(result.authResult.idToken).toBe('local-jwt-token');
      expect(result.authResult.accessToken).toBe(result.authResult.idToken);
    });

    it('should scope user lookup to tenant when tenantId is provided', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });

      // Act
      await service.authenticateWithEmailPassword('456', 'test@example.com', 'password123');

      // Assert
      expect(authRepository.findWithOrganizationByEmail).toHaveBeenCalledWith(
        'test@example.com',
        '456'
      );
    });

    it('should treat PUBLIC_AUTH tenant sentinel as unscoped lookup', async () => {
      // Arrange
      authRepository.findWithOrganizationByEmail.mockResolvedValue({
        user: mockUser,
        organization: mockOrganization
      });

      // Act
      await service.authenticateWithEmailPassword('PUBLIC_AUTH', 'test@example.com', 'password123');

      // Assert
      expect(authRepository.findWithOrganizationByEmail).toHaveBeenCalledWith(
        'test@example.com',
        undefined
      );
    });
  });

  describe('authenticateWithOAuth', () => {
    it('should authenticate existing OAuth user', async () => {
      // Arrange
      const oauthIdentity = {
        ...mockIdentity,
        provider: 'google'
      };
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(oauthIdentity);
      authRepository.findById.mockResolvedValue(mockUser);

      // Act
      const result = await service.authenticateWithOAuth('456', 'google', 'oauth-id-token');

      // Assert
      expect(authProvider.getUserInfoFromToken).toHaveBeenCalledWith('oauth-id-token');
      expect(userIdentityRepository.findByProviderAndUid).toHaveBeenCalled();
      expect(result.isNewUser).toBe(false);
      expect(result.authResult).toBeDefined();
    });

    it('should create new user for new OAuth registration', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(null);
      authRepository.createWithEmail.mockResolvedValue(mockUser);

      // Act
      const result = await service.authenticateWithOAuth('456', 'google', 'oauth-id-token');

      // Assert
      expect(authRepository.createWithEmail).toHaveBeenCalled();
      expect(userIdentityRepository.createWithUserId).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          providerEmail: mockUserInfo.email
        })
      );
      expect(result.isNewUser).toBe(true);
    });

    it('should throw UnauthorizedException when OAuth token is invalid', async () => {
      // Arrange
      authProvider.getUserInfoFromToken.mockRejectedValue(new Error('Invalid token'));

      // Act & Assert
      await expect(service.authenticateWithOAuth('456', 'google', 'invalid-token')).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('authenticateWithPhone', () => {
    it('should throw BadRequestException as phone auth is not implemented', async () => {
      // Act & Assert
      await expect(service.authenticateWithPhone('456', '+1234567890', '123456')).rejects.toThrow(
        BadRequestException
      );

      await expect(
        service.authenticateWithPhone('456', '+1234567890', '123456')
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED
        })
      });
    });
  });

  describe('registerWithEmailPassword', () => {
    it('should persist registration audit metadata and preserve trace ids in the same transaction', async () => {
      const serviceInternals = service as unknown as {
        checkUserExists: (tenantId: string | undefined, email: string) => Promise<void>;
        getOrCreateOrganization: (
          tenantId: string | undefined,
          email: string,
          displayName?: string,
          organizationName?: string,
          organizationSlug?: string
        ) => Promise<{
          effectiveTenantId: string;
          tenantIdForRole: string;
          isNewOrganization: boolean;
          gcpTenantId: string | null;
        }>;
        provisionUserInGcp: (
          email: string,
          password: string,
          displayName: string | undefined,
          gcpTenantId: string | null,
          isNewOrganization: boolean
        ) => Promise<string>;
        setUserCustomClaims: (
          gcpUid: string,
          effectiveTenantId: string,
          userId: number,
          gcpTenantId: string | null
        ) => Promise<void>;
      };

      jest.spyOn(serviceInternals, 'checkUserExists').mockResolvedValue(undefined);
      jest.spyOn(serviceInternals, 'getOrCreateOrganization').mockResolvedValue({
        effectiveTenantId: '456',
        tenantIdForRole: '789',
        isNewOrganization: true,
        gcpTenantId: 'gcp-tenant-123'
      });
      jest.spyOn(serviceInternals, 'provisionUserInGcp').mockResolvedValue('gcp-uid-123');
      jest.spyOn(serviceInternals, 'setUserCustomClaims').mockResolvedValue(undefined);
      authRepository.createWithEmailInTransaction.mockResolvedValue(mockUser);
      userIdentityRepository.createWithTransaction.mockResolvedValue(mockIdentity as never);

      await service.registerWithEmailPassword(
        undefined,
        'test@example.com',
        'password123',
        'Test User',
        'Test Org',
        true,
        true,
        undefined,
        {
          requestId: 'req-123',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        }
      );

      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'organization.owner.assigned',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        })
      );
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'auth.registration.completed.audit',
          tenantId: '456',
          correlationId: 'corr-123',
          causationId: 'cause-123',
          payload: expect.objectContaining({
            requestId: 'req-123',
            action: 'REGISTER_ACCOUNT',
            actorId: '123',
            target: expect.objectContaining({
              entityType: 'user',
              entityId: '123'
            }),
            details: expect.objectContaining({
              identityProvider: 'email_password',
              organizationCreated: true,
              gcpTenantProvisioned: true,
              emailVerified: true,
              accountActive: true
            })
          })
        })
      );
    });

    it('should skip GCP tenant provisioning for custom-jwt registration', async () => {
      const serviceInternals = service as unknown as {
        createOrganizationWithLock: (
          email: string,
          displayName?: string,
          organizationName?: string,
          organizationSlug?: string
        ) => Promise<{
          created: boolean;
          organizationId: number;
          tenantId: number | null;
          gcpTenantId: string | null;
        }>;
      };

      authProviderFactory.getDefaultProvider.mockReturnValue({
        ...authProvider,
        name: 'custom-jwt',
        type: 'custom-jwt'
      } as jest.Mocked<IAuthProvider>);
      authRepository.findByEmail.mockResolvedValue(null);
      authRepository.createOrganizationForUser.mockResolvedValue({
        organizationId: 456,
        tenantId: 789
      });

      await expect(
        serviceInternals.createOrganizationWithLock(
          'test@example.com',
          'Test User',
          'Test Org',
          'test-org'
        )
      ).resolves.toEqual({
        created: true,
        organizationId: 456,
        tenantId: 789,
        gcpTenantId: null
      });

      expect(authRepository.createOrganizationForUser).toHaveBeenCalledWith(
        'test@example.com',
        'Test Org',
        undefined,
        'test-org'
      );
    });

    it('should generate a local provider uid for custom-jwt registration', async () => {
      const serviceInternals = service as unknown as {
        provisionUserInGcp: (
          email: string,
          password: string,
          displayName: string | undefined,
          gcpTenantId: string | null,
          isNewOrganization: boolean
        ) => Promise<string>;
      };

      authProviderFactory.getDefaultProvider.mockReturnValue({
        ...authProvider,
        name: 'custom-jwt',
        type: 'custom-jwt'
      } as jest.Mocked<IAuthProvider>);

      await expect(
        serviceInternals.provisionUserInGcp(
          'test@example.com',
          'password123',
          'Test User',
          null,
          true
        )
      ).resolves.toMatch(/^custom-jwt:/);
    });
  });

  describe('linkIdentity', () => {
    it('should link identity to user', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(null);
      userIdentityRepository.userHasProvider.mockResolvedValue(false);
      authRepository.findById.mockResolvedValue(mockUser);

      const profile = {
        provider: 'github',
        providerUid: 'github-uid-123',
        displayName: 'Test User',
        emailVerified: true
      };

      // Act
      await service.linkIdentity(123, '456', 'github', 'github-uid-123', profile);

      // Assert
      expect(userIdentityRepository.createWithUserId).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 123,
          provider: 'github',
          providerUid: 'github-uid-123',
          isPrimary: false
        })
      );
    });

    it('should throw ConflictException when identity already linked to another user', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue({
        ...mockIdentity,
        userId: 999, // Different user
        provider: 'github',
        providerUid: 'github-uid-123'
      });

      // Act & Assert
      await expect(
        service.linkIdentity(123, '456', 'github', 'github-uid-123', {
          provider: 'github',
          providerUid: 'github-uid-123'
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when user already has provider', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(null);
      userIdentityRepository.userHasProvider.mockResolvedValue(true);

      // Act & Assert
      await expect(
        service.linkIdentity(123, '456', 'github', 'github-uid-123', {
          provider: 'github',
          providerUid: 'github-uid-123'
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unlinkIdentity', () => {
    it('should unlink identity from user', async () => {
      // Arrange
      const unlinkableIdentity = {
        ...mockIdentity,
        provider: 'github',
        providerUid: 'github-uid-123',
        isPrimary: false
      };
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(unlinkableIdentity);
      userIdentityRepository.countByUserId.mockResolvedValue(2);

      // Act
      await service.unlinkIdentity(123, 'github', 'github-uid-123');

      // Assert
      expect(userIdentityRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw BadRequestException when identity not found', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(null);

      // Act & Assert
      await expect(service.unlinkIdentity(123, 'github', 'github-uid-123')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw UnauthorizedException when identity belongs to another user', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue({
        ...mockIdentity,
        userId: 999, // Different user
        provider: 'github',
        providerUid: 'github-uid-123',
        isPrimary: false
      });

      // Act & Assert
      await expect(service.unlinkIdentity(123, 'github', 'github-uid-123')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw BadRequestException when trying to unlink primary identity', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue({
        ...mockIdentity,
        provider: 'github',
        providerUid: 'github-uid-123',
        isPrimary: true
      });

      // Act & Assert
      await expect(service.unlinkIdentity(123, 'github', 'github-uid-123')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when only one identity remains', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue({
        ...mockIdentity,
        provider: 'github',
        providerUid: 'github-uid-123',
        isPrimary: false
      });
      userIdentityRepository.countByUserId.mockResolvedValue(1);

      // Act & Assert
      await expect(service.unlinkIdentity(123, 'github', 'github-uid-123')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('refreshToken', () => {
    it('should issue app-local tokens when refreshing a valid session', async () => {
      authSessionStore.getRefreshTokenInfo.mockResolvedValue({
        userId: '123',
        tokenId: 'token-123',
        tenantId: '456',
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 60_000),
        revoked: false
      });

      const result = await service.refreshToken('456', 'old-refresh-token');

      expect(authSessionStore.getRefreshTokenInfo).toHaveBeenCalledWith('old-refresh-token', '456');
      expect(authProvider.refreshToken).not.toHaveBeenCalled();
      expect(jwtService.signAsync).toHaveBeenCalled();
      expect(result.accessToken).toBe('local-jwt-token');
      expect(result.idToken).toBe('local-jwt-token');
      expect(result.refreshToken).not.toBe('old-refresh-token');
      expect(result.user?.userId).toBe('123');
      expect(result.user?.email).toBe('test@example.com');
      expect(authSessionStore.rotateSession).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException when refresh fails', async () => {
      authSessionStore.getRefreshTokenInfo.mockResolvedValue(undefined);

      await expect(service.refreshToken('456', 'invalid-refresh-token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should reject refresh for a soft-deleted user', async () => {
      authSessionStore.getRefreshTokenInfo.mockResolvedValue({
        userId: '123',
        tokenId: 'token-123',
        tenantId: '456',
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 60_000),
        revoked: false
      });
      authRepository.findById.mockResolvedValue(null);
      authRepository.findOrganizationById.mockResolvedValue(mockOrganization as never);

      await expect(service.refreshToken('456', 'old-refresh-token')).rejects.toThrow(
        'User account is inactive or deleted'
      );
    });
  });

  describe('logout', () => {
    it('should skip provider logout for app-local sessions', async () => {
      await service.logout(123, '456', 'refresh-token', 'local-access-token');

      expect(authSessionStore.revokeRefreshToken).toHaveBeenCalledWith(
        'refresh-token',
        '456',
        'local-access-token'
      );
      expect(authProvider.logout).not.toHaveBeenCalled();
    });

    it('should not throw when logout fails (idempotent)', async () => {
      authProvider.logout.mockRejectedValue(new Error('Logout failed'));
      const providerAccessToken = [
        Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(
          JSON.stringify({ iss: 'https://securetoken.google.com/test-project' })
        ).toString('base64url'),
        'signature'
      ].join('.');

      await expect(
        service.logout(123, '456', 'refresh-token', providerAccessToken)
      ).resolves.not.toThrow();
    });
  });

  describe('validateToken', () => {
    it('should validate token and return user info', async () => {
      const firebaseLikeToken = [
        Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(
          JSON.stringify({
            iss: 'https://securetoken.google.com/test-project',
            sub: 'firebase-uid-123',
            tenant_id: '456',
            db_user_id: '123'
          })
        ).toString('base64url'),
        'signature'
      ].join('.');

      jwtService.verify.mockImplementation(() => {
        throw new Error('not a local jwt');
      });
      authProvider.validateToken.mockResolvedValue({ valid: true });
      authRepository.findById.mockResolvedValue(mockUser as never);
      authRepository.findOrganizationById.mockResolvedValue(mockOrganization as never);

      // Act
      const result = await service.validateToken('456', firebaseLikeToken);

      // Assert
      expect(authProvider.validateToken).toHaveBeenCalledWith(firebaseLikeToken);
      expect(authProvider.getUserInfoFromToken).toHaveBeenCalledWith(firebaseLikeToken);
      expect(result).toEqual(
        expect.objectContaining({
          tenantId: '456',
          name: 'Test User',
          displayName: 'Test User',
          photoUrl: null,
          avatarFileId: null
        })
      );
    });

    it('should validate app-local JWTs without calling the provider', async () => {
      jwtService.verify.mockReturnValue({
        sub: '123',
        db_user_id: '123',
        tenant_id: '456',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['admin'],
        permissions: ['read:profile']
      });
      authRepository.findById.mockResolvedValue(mockUser as never);
      authRepository.findOrganizationById.mockResolvedValue(mockOrganization as never);

      const result = await service.validateToken('456', 'local-jwt-token');

      expect(authProvider.validateToken).not.toHaveBeenCalled();
      expect(authProvider.getUserInfoFromToken).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          userId: '123',
          tenantId: '456',
          email: 'test@example.com',
          roles: ['admin'],
          permissions: ['read:profile']
        })
      );
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('not a local jwt');
      });
      authProvider.validateToken.mockResolvedValue({
        valid: false,
        error: 'Token expired'
      });

      // Act & Assert
      await expect(service.validateToken('456', 'invalid-token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should reject app-local tokens without calling the provider when local verification fails', async () => {
      const localLikeToken = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: '123', tenant_id: '456', db_user_id: '123' })).toString(
          'base64url'
        ),
        'signature'
      ].join('.');

      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.validateToken('456', localLikeToken)).rejects.toThrow(
        UnauthorizedException
      );
      expect(authProvider.validateToken).not.toHaveBeenCalled();
      expect(authProvider.getUserInfoFromToken).not.toHaveBeenCalled();
    });

    it('should reject validation for a deleted organization', async () => {
      const firebaseLikeToken = [
        Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(
          JSON.stringify({
            iss: 'https://securetoken.google.com/test-project',
            sub: 'firebase-uid-123',
            tenant_id: '456',
            db_user_id: '123'
          })
        ).toString('base64url'),
        'signature'
      ].join('.');

      jwtService.verify.mockImplementation(() => {
        throw new Error('not a local jwt');
      });
      authProvider.validateToken.mockResolvedValue({ valid: true });
      authRepository.findById.mockResolvedValue(mockUser as never);
      authRepository.findOrganizationById.mockResolvedValue({
        ...mockOrganization,
        isActive: false,
        deletedAt: new Date('2024-02-01T00:00:00.000Z')
      } as never);

      await expect(service.validateToken('456', firebaseLikeToken)).rejects.toThrow(
        'Organization is inactive or deleted'
      );
    });
  });

  describe('getUserIdentities', () => {
    it('should return user identities', async () => {
      // Arrange
      const mockIdentities = [
        { ...mockIdentity, id: 1, provider: 'email_password', providerUid: 'uid-1' },
        { ...mockIdentity, id: 2, provider: 'google', providerUid: 'uid-2' }
      ];
      userIdentityRepository.findByUserId.mockResolvedValue(mockIdentities);

      // Act
      const result = await service.getUserIdentities(123);

      // Assert
      expect(userIdentityRepository.findByUserId).toHaveBeenCalledWith(123);
      expect(result).toEqual(mockIdentities);
    });

    it('should return empty array when user has no identities', async () => {
      // Arrange
      userIdentityRepository.findByUserId.mockResolvedValue([]);

      // Act
      const result = await service.getUserIdentities(123);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('invalidateUserPermissions', () => {
    it('should invalidate user permissions cache', async () => {
      // Act
      await service.invalidateUserPermissions(123, 456);

      // Assert
      expect(cachedPermissionService.invalidateAllPermissions).toHaveBeenCalledWith(123);
    });

    it('should work without tenant ID', async () => {
      // Act
      await service.invalidateUserPermissions(123);

      // Assert
      expect(cachedPermissionService.invalidateAllPermissions).toHaveBeenCalledWith(123);
    });
  });

  describe('updateUserLastSignInWithTransaction', () => {
    it('should update last sign-in timestamp', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue({
        ...mockIdentity,
        providerUid: '123'
      });

      // Act
      await service.updateUserLastSignInWithTransaction(dbTransaction, 123);

      // Assert
      expect(userIdentityRepository.findByProviderAndUid).toHaveBeenCalledWith(
        'email_password',
        '123'
      );
      expect(userIdentityRepository.updateLastSignInWithTransaction).toHaveBeenCalledWith(
        dbTransaction,
        1
      );
    });

    it('should not throw when identity not found', async () => {
      // Arrange
      userIdentityRepository.findByProviderAndUid.mockResolvedValue(null);

      // Act & Assert - should not throw
      await expect(
        service.updateUserLastSignInWithTransaction(dbTransaction, 123)
      ).resolves.not.toThrow();
    });
  });

  describe('provider initialization', () => {
    it('should throw BadRequestException when no provider configured', async () => {
      // Arrange
      const noProviderFactory = {
        getDefaultProvider: jest.fn().mockReturnValue(null)
      };

      // Act & Assert
      await expect(
        Test.createTestingModule({
          providers: [
            AuthService,
            { provide: 'AUTH_PROVIDER_FACTORY', useValue: noProviderFactory },
            { provide: AuthRepository, useValue: {} },
            { provide: UserIdentityRepository, useValue: {} },
            { provide: CacheService, useValue: {} },
            { provide: OutboxRepository, useValue: {} },
            { provide: RoleService, useValue: {} },
            { provide: CachedRoleService, useValue: {} },
            { provide: CachedPermissionService, useValue: {} },
            { provide: AuthSessionStoreService, useValue: {} },
            { provide: JwtService, useValue: {} },
            { provide: ConfigService, useValue: { get: jest.fn() } },
            { provide: MAIN_DB, useValue: {} }
          ]
        }).compile()
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sanitizeGcpDisplayName (via reflection)', () => {
    // Access private method via reflection for testing
    const callSanitize = (displayName: string): string => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (service as any).sanitizeGcpDisplayName(displayName);
    };

    it('should remove special characters and spaces', () => {
      // Act
      const result = callSanitize('MiviaLabs LLC');

      // Assert
      expect(result).toBe('MiviaLabsLLC'); // Spaces removed, all valid chars kept
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle names with multiple special characters', () => {
      // Act
      const result = callSanitize('Test & Company, Inc.');

      // Assert
      expect(result).toBe('TestCompanyInc');
      expect(/^[a-zA-Z][a-zA-Z0-9-]*$/.test(result)).toBe(true);
    });

    it('should remove leading non-letters', () => {
      // Act
      const result = callSanitize('123-ABC-Corp');

      // Assert
      expect(result).toBe('ABC-Corp');
      expect(result[0]).toMatch(/[a-zA-Z]/);
    });

    it('should truncate names longer than 20 characters', () => {
      // Act
      const result = callSanitize('VeryLongOrganizationNameThatExceedsTwentyCharacters');

      // Assert
      expect(result.length).toBe(20);
      expect(result).toBe('VeryLongOrganization');
    });

    it('should preserve hyphens between words', () => {
      // Act
      const result = callSanitize('Tech-Solutions-Group');

      // Assert
      expect(result).toBe('Tech-Solutions-Group'); // Exactly 20 chars
      expect(result.length).toBe(20);
      expect(result).toContain('-');
    });

    it('should pad short names with timestamp suffix', () => {
      // Act
      const result = callSanitize('AB');

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result).toMatch(/^Org-\d{4}$/);
    });

    it('should handle empty string by generating default name', () => {
      // Act
      const result = callSanitize('');

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result).toMatch(/^Org-\d{4}$/);
    });

    it('should handle string with only special characters', () => {
      // Act
      const result = callSanitize('!@#$%^&*()');

      // Assert
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result).toMatch(/^Org-\d{4}$/);
    });

    it('should handle unicode and emoji characters', () => {
      // Act
      const result = callSanitize('Café ☕ Company');

      // Assert
      expect(result).toBe('CafCompany');
      expect(/^[a-zA-Z][a-zA-Z0-9-]*$/.test(result)).toBe(true);
    });

    it('should preserve exactly 4 characters when input is exactly 4 letters', () => {
      // Act
      const result = callSanitize('Test');

      // Assert
      expect(result).toBe('Test');
      expect(result.length).toBe(4);
    });

    it('should handle mixed case and preserve it', () => {
      // Act
      const result = callSanitize('MixedCaseOrg');

      // Assert
      expect(result).toBe('MixedCaseOrg');
      expect(result[0]).toMatch(/[A-Z]/);
    });
  });
});
