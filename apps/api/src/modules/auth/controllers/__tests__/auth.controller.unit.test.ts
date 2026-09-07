/**
 * Unit Tests for IdentityController
 *
 * Tests authentication endpoints: register, login, logout, refresh, identities, sessions.
 */

import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { IdentityProvider } from '@package/db-core';

import { SecurityMonitoringService } from '../../../security/security-monitoring.service';
import { InvitationRepository } from '../../../tenants/repositories';
import { JwtAuthGuard, JwtTenantGuard } from '../../guards';
import { AuthRepository } from '../../repositories/auth.repository';
import { IdentityController } from '../auth.controller';

import type { TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('IdentityController', () => {
  let controller: IdentityController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;
  let securityMonitoring: jest.Mocked<SecurityMonitoringService>;
  let invitationRepository: jest.Mocked<InvitationRepository>;
  let authRepository: jest.Mocked<AuthRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;

  const mockRequest = {
    headers: { 'user-agent': 'Mozilla/5.0 Test Browser' }
  } as Request;

  const mockAuthResult = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    idToken: 'id-token-789',
    expiresIn: 3600,
    refreshExpiresIn: 86400,
    user: {
      userId: '123',
      email: 'test@example.com',
      tenantId: 'primary-encryption-key',
      roles: ['user'],
      permissions: ['read:profile']
    },
    isNewUser: false
  };

  const mockUser = {
    userId: '123',
    tenantId: 'primary-encryption-key',
    actorId: '123',
    email: 'test@example.com'
  };

  beforeEach(async () => {
    const mockCommandBus = {
      execute: jest.fn()
    };

    const mockQueryBus = {
      execute: jest.fn()
    };

    const mockSecurityMonitoring = {
      recordAuthSuccess: jest.fn(),
      recordAuthFailure: jest.fn()
    };
    const mockAuditOutbox = {
      insert: jest.fn()
    };
    const mockDb = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        {
          provide: CommandBus,
          useValue: mockCommandBus
        },
        {
          provide: QueryBus,
          useValue: mockQueryBus
        },
        {
          provide: SecurityMonitoringService,
          useValue: mockSecurityMonitoring
        },
        {
          provide: InvitationRepository,
          useValue: {
            findByTokenHashGlobal: jest.fn(),
            decryptEmail: jest.fn()
          }
        },
        {
          provide: AuthRepository,
          useValue: {
            findOrganizationById: jest.fn(),
            findById: jest.fn(),
            findWithOrganizationByEmailHash: jest.fn()
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    })
      .overrideGuard(JwtTenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IdentityController>(IdentityController);
    commandBus = module.get(CommandBus);
    queryBus = module.get(QueryBus);
    securityMonitoring = module.get(SecurityMonitoringService);
    invitationRepository = module.get(InvitationRepository);
    authRepository = module.get(AuthRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should execute RegisterCommand and return AuthResponseDto', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = {
        email: 'new@example.com',
        password: 'SecurePass123!'
      };

      // Act
      const result = await controller.register(undefined, dto, '127.0.0.1', mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          password: 'SecurePass123!',
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0 Test Browser'
        })
      );
      expect(result).toMatchObject({ accessToken: expect.any(String) });
    });

    it('should include tenantId when provided', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = { email: 'new@example.com', password: 'SecurePass123!' };

      // Act
      await controller.register('primary-encryption-key', dto, '127.0.0.1', mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key'
        })
      );
    });

    it('should include optional display name and org name', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = {
        email: 'new@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User',
        organizationName: 'Test Org',
        organizationSlug: 'test-org'
      };

      // Act
      await controller.register(undefined, dto, '127.0.0.1', mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Test User',
          organizationName: 'Test Org',
          organizationSlug: 'test-org'
        })
      );
    });
  });
  describe('previewInvitation', () => {
    it('should return invitation preview for valid invitation token', async () => {
      invitationRepository.findByTokenHashGlobal.mockResolvedValue({
        organizationId: 456,
        status: 'pending',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        invitedByUserId: 123,
        emailEncrypted: 'enc-value'
      } as never);
      invitationRepository.decryptEmail.mockResolvedValue('owner@example.com');
      authRepository.findOrganizationById.mockResolvedValue({
        id: 456,
        name: 'Acme Org'
      } as never);
      authRepository.findById.mockResolvedValue({
        displayName: 'Org Owner'
      } as never);

      const result = await controller.previewInvitation({
        token: 'token-123'
      });

      expect(result).toEqual({
        status: 'valid',
        acceptanceMode: 'register',
        tenantName: 'Acme Org',
        inviterDisplayName: 'Org Owner',
        invitedEmailMasked: 'o***r@example.com',
        expiresAt: '2030-01-01T00:00:00.000Z'
      });
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'auth.invitation.previewed.audit',
          correlationId: undefined,
          causationId: undefined,
          payload: expect.objectContaining({
            action: 'VIEW_INVITATION_PREVIEW',
            target: expect.objectContaining({
              entityType: 'invitation',
              entityId: '456'
            }),
            details: expect.objectContaining({
              invitationStatus: 'valid',
              acceptanceMode: 'register'
            })
          })
        })
      );
    });

    it('should return existing_account mode when invited email already belongs to another account', async () => {
      invitationRepository.findByTokenHashGlobal.mockResolvedValue({
        organizationId: 456,
        status: 'pending',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        invitedByUserId: null,
        emailEncrypted: 'enc-value',
        emailHash: 'hashed-email'
      } as never);
      invitationRepository.decryptEmail.mockResolvedValue('owner@example.com');
      authRepository.findOrganizationById.mockResolvedValue({
        id: 456,
        name: 'Acme Org'
      } as never);
      authRepository.findWithOrganizationByEmailHash.mockResolvedValue({
        user: { id: 789 },
        organization: { id: 999, name: 'Other Org' }
      } as never);

      const result = await controller.previewInvitation({
        token: 'token-123'
      });

      expect(result.acceptanceMode).toBe('existing_account');
    });

    it('should throw when invitation query is missing required parameters', async () => {
      await expect(
        controller.previewInvitation({
          token: '   ',
          tenantId: '456'
        })
      ).rejects.toThrow('token is required');
    });
  });

  describe('login', () => {
    it('should execute LoginCommand and return AuthResponseDto', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = { email: 'test@example.com', password: 'password123' };

      // Act
      const result = await controller.login(
        'primary-encryption-key',
        dto,
        '127.0.0.1',
        mockRequest
      );

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          email: 'test@example.com',
          password: 'password123'
        })
      );
      expect(result).toMatchObject({ accessToken: expect.any(String) });
    });

    it('should record successful authentication', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = { email: 'test@example.com', password: 'password123' };

      // Act
      await controller.login('primary-encryption-key', dto, '127.0.0.1', mockRequest);

      // Assert
      expect(securityMonitoring.recordAuthSuccess).toHaveBeenCalledWith(
        'primary-encryption-key',
        '123'
      );
    });

    it('should record failed authentication and rethrow error', async () => {
      // Arrange
      commandBus.execute.mockRejectedValue(new Error('Invalid credentials'));

      const dto = { email: 'test@example.com', password: 'wrong-password' };

      // Act & Assert
      await expect(
        controller.login('primary-encryption-key', dto, '127.0.0.1', mockRequest)
      ).rejects.toThrow('Invalid credentials');
      expect(securityMonitoring.recordAuthFailure).toHaveBeenCalledWith(
        'primary-encryption-key',
        'anonymous'
      );
    });
  });

  describe('trace propagation', () => {
    it('passes requestId, correlationId, and causationId to validateToken queries', async () => {
      queryBus.execute.mockResolvedValue({
        userId: '123',
        tenantId: 'primary-encryption-key'
      });

      await controller.validateToken('primary-encryption-key', 'valid-token', {
        requestId: 'req-auth-1',
        correlationId: 'corr-auth-1',
        causationId: 'cause-auth-1'
      });

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          token: 'valid-token',
          requestId: 'req-auth-1',
          correlationId: 'corr-auth-1',
          causationId: 'cause-auth-1'
        })
      );
    });

    it('passes request trace to list-user-identities queries', async () => {
      queryBus.execute.mockResolvedValue([]);

      await controller.getUserIdentities('primary-encryption-key', mockUser, {
        requestId: 'req-auth-2',
        correlationId: 'corr-auth-2',
        causationId: 'cause-auth-2'
      });

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          actorId: '123',
          userId: 123,
          requestId: 'req-auth-2',
          correlationId: 'corr-auth-2',
          causationId: 'cause-auth-2'
        })
      );
    });
  });

  describe('loginWithOAuth', () => {
    it('should execute LoginWithOAuthCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = { provider: IdentityProvider.GOOGLE, idToken: 'google-id-token' };

      // Act
      const result = await controller.loginWithOAuth(
        'primary-encryption-key',
        dto,
        '127.0.0.1',
        mockRequest
      );

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          provider: IdentityProvider.GOOGLE,
          idToken: 'google-id-token'
        })
      );
      expect(result).toMatchObject({ accessToken: expect.any(String) });
    });

    it('should include accessToken when provided', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'token',
        accessToken: 'access-token'
      };

      // Act
      await controller.loginWithOAuth('primary-encryption-key', dto, '127.0.0.1', mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token'
        })
      );
    });
  });

  describe('loginWithPhone', () => {
    it('should execute LoginWithPhoneCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = { phoneNumber: '+1234567890', verificationCode: '123456' };

      // Act
      const result = await controller.loginWithPhone(
        'primary-encryption-key',
        dto,
        '127.0.0.1',
        mockRequest
      );

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          phoneNumber: '+1234567890',
          verificationCode: '123456'
        })
      );
      expect(result).toMatchObject({ accessToken: expect.any(String) });
    });
  });

  describe('refreshToken', () => {
    it('should execute RefreshTokenCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);

      const dto = { refreshToken: 'old-refresh-token' };

      // Act
      const result = await controller.refreshToken(
        'primary-encryption-key',
        dto,
        '127.0.0.1',
        mockRequest
      );

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          refreshToken: 'old-refresh-token'
        })
      );
      expect(result).toMatchObject({ accessToken: expect.any(String) });
    });
  });

  describe('logout', () => {
    it('should execute LogoutCommand and return success message', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { refreshToken: 'refresh-token' };

      // Act
      const result = await controller.logout(
        'primary-encryption-key',
        dto,
        'Bearer access-token',
        '127.0.0.1',
        mockRequest,
        mockUser
      );

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          actorId: '123',
          userId: 123,
          refreshToken: 'refresh-token',
          accessToken: 'access-token'
        })
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('linkIdentity', () => {
    it('should execute LinkIdentityCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { provider: IdentityProvider.GITHUB, providerUid: 'github-uid-123' };

      // Act
      const result = await controller.linkIdentity('primary-encryption-key', dto, mockUser);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          actorId: '123',
          userId: 123,
          provider: IdentityProvider.GITHUB,
          providerUid: 'github-uid-123'
        })
      );
      expect(result).toEqual({ message: 'Identity linked successfully' });
    });
  });

  describe('unlinkIdentity', () => {
    it('should execute UnlinkIdentityCommand', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(undefined);

      const dto = { provider: IdentityProvider.GITHUB, providerUid: 'github-uid-123' };

      // Act
      const result = await controller.unlinkIdentity('primary-encryption-key', dto, mockUser);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          actorId: '123',
          userId: 123,
          provider: IdentityProvider.GITHUB,
          providerUid: 'github-uid-123'
        })
      );
      expect(result).toEqual({ message: 'Identity unlinked successfully' });
    });
  });

  describe('getUserIdentities', () => {
    it('should execute ListUserIdentitiesQuery and return identities', async () => {
      // Arrange
      const mockIdentities = [
        {
          id: 1,
          provider: IdentityProvider.GOOGLE,
          providerUid: 'google-uid',
          displayName: 'Test Google',
          emailVerified: true,
          createdAt: new Date()
        }
      ];
      queryBus.execute.mockResolvedValue(mockIdentities);

      // Act
      const result = await controller.getUserIdentities('primary-encryption-key', mockUser);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          userId: 123
        })
      );
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getUserSessions', () => {
    it('should execute GetUserSessionQuery and return sessions', async () => {
      // Arrange
      queryBus.execute.mockResolvedValue([]);

      // Act
      const result = await controller.getUserSessions('primary-encryption-key', mockUser);

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          userId: 123
        })
      );
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('validateToken', () => {
    it('should execute ValidateTokenQuery and return validation result', async () => {
      // Arrange
      const mockUserInfo = {
        userId: '123',
        email: 'test@example.com',
        roles: ['user']
      };
      queryBus.execute.mockResolvedValue(mockUserInfo);

      // Act
      const result = await controller.validateToken('primary-encryption-key', 'access-token');

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          token: 'access-token'
        })
      );
      expect(result).toEqual({
        valid: true,
        user: mockUserInfo
      });
    });
  });

  describe('getUserRoles', () => {
    it('should execute GetUserRolesQuery and return wrapped response', async () => {
      // Arrange
      const mockRolesResponse = {
        roles: ['admin'],
        permissions: ['admin:*']
      };
      queryBus.execute.mockResolvedValue(mockRolesResponse);

      // Act
      const result = await controller.getUserRoles('123', '456', '456');

      // Assert
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 123,
          userId: 456
        })
      );
      expect(result.data).toEqual(mockRolesResponse);
    });
  });

  describe('getMe', () => {
    it('should return current user profile with roles and permissions', async () => {
      // Arrange
      const currentUser = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['tenant_admin', 'tenant_user'],
        permissions: ['tenant:users:read', 'tenant:users:write']
      };

      const expectedProfile = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['tenant_admin', 'tenant_user'],
        permissions: ['tenant:users:read', 'tenant:users:write']
      };

      queryBus.execute.mockResolvedValue(expectedProfile);

      // Act
      const result = await controller.getMe(currentUser);

      // Assert
      expect(result.data).toEqual(expectedProfile);
    });

    it('should use username as name fallback when name is not provided', async () => {
      // Arrange
      const currentUser = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        username: 'testuser',
        roles: ['tenant_user'],
        permissions: []
      };

      const expectedProfile = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        name: 'testuser',
        roles: ['tenant_user'],
        permissions: []
      };

      queryBus.execute.mockResolvedValue(expectedProfile);

      // Act
      const result = await controller.getMe(currentUser);

      // Assert
      expect(result.data.name).toBe('testuser');
    });

    it('should use "User" as name fallback when neither name nor displayName provided', async () => {
      // Arrange
      const currentUser = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        roles: [],
        permissions: []
      };

      const expectedProfile = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        name: 'User',
        roles: [],
        permissions: []
      };

      queryBus.execute.mockResolvedValue(expectedProfile);

      // Act
      const result = await controller.getMe(currentUser);

      // Assert
      expect(result.data.name).toBe('User');
    });

    it('should return empty arrays when roles and permissions are undefined', async () => {
      // Arrange
      const currentUser = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com'
      };

      const expectedProfile = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        roles: [],
        permissions: []
      };

      queryBus.execute.mockResolvedValue(expectedProfile);

      // Act
      const result = await controller.getMe(currentUser);

      // Assert
      expect(result.data.roles).toEqual([]);
      expect(result.data.permissions).toEqual([]);
    });

    it('should convert readonly arrays to mutable arrays', async () => {
      // Arrange
      const currentUser = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        roles: ['tenant_admin'] as readonly string[],
        permissions: ['tenant:*'] as readonly string[]
      };

      const expectedProfile = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        roles: ['tenant_admin'],
        permissions: ['tenant:*']
      };

      queryBus.execute.mockResolvedValue(expectedProfile);

      // Act
      const result = await controller.getMe(currentUser);

      // Assert
      expect(Array.isArray(result.data.roles)).toBe(true);
      expect(Array.isArray(result.data.permissions)).toBe(true);
      expect(result.data.roles).toEqual(['tenant_admin']);
      expect(result.data.permissions).toEqual(['tenant:*']);
    });
  });

  describe('getMeBootstrap', () => {
    it('should execute GetAuthBootstrapQuery and return wrapped bootstrap data', async () => {
      const currentUser = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        actorId: 'actor-789',
        email: 'test@example.com',
        name: 'Test User',
        username: 'test-user',
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      };
      const bootstrap = {
        user: {
          userId: 'user-123',
          tenantId: 'tenant-456'
        },
        organizations: [],
        currentOrganizationId: 'tenant-456',
        currentUserSettings: {
          sidebarSectionOrder: ['yourWork', 'projects', 'members', 'settings'],
          dashboardDefaultView: 'projects',
          workspaceActiveProjectId: null
        },
        tenantName: 'Tenant',
        tenantDisplayName: 'Tenant',
        tenantSlug: 'tenant'
      };

      queryBus.execute.mockResolvedValue(bootstrap);

      const result = await controller.getMeBootstrap(currentUser, {
        requestId: 'req-1',
        correlationId: 'corr-1',
        causationId: 'cause-1'
      });

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-456',
          actorId: 'actor-789',
          email: 'test@example.com',
          name: 'Test User',
          username: 'test-user',
          requestId: 'req-1',
          correlationId: 'corr-1',
          causationId: 'cause-1'
        })
      );
      expect(result.data).toEqual(bootstrap);
    });
  });

  describe('updateMe', () => {
    it('should execute UpdateMyProfileCommand with authenticated subject user context', async () => {
      const currentUser = {
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Old Name'
      };
      const dto = { displayName: 'New Name' };
      queryBus.execute.mockResolvedValue(undefined);
      commandBus.execute.mockResolvedValue({
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'New Name',
        displayName: 'New Name',
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      const result = await controller.updateMe(currentUser, dto);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '456',
          userId: '123',
          actorId: '123',
          displayName: 'New Name'
        })
      );
      expect(result.data.displayName).toBe('New Name');
    });

    it('should forward phoneNumber when updating current profile', async () => {
      const currentUser = {
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Old Name'
      };
      const dto = { phoneNumber: '+14155552671' };
      commandBus.execute.mockResolvedValue({
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Old Name',
        displayName: 'Old Name',
        phoneNumber: '+14155552671',
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      const result = await controller.updateMe(currentUser, dto);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '456',
          userId: '123',
          actorId: '123',
          phoneNumber: '+14155552671'
        })
      );
      expect(result.data.phoneNumber).toBe('+14155552671');
    });
  });

  describe('updateMyAvatar', () => {
    it('should execute UpdateMyAvatarCommand with authenticated subject user context', async () => {
      const currentUser = {
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Avatar User'
      };
      const dto = { fileId: 301 };
      commandBus.execute.mockResolvedValue({
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Avatar User',
        displayName: 'Avatar User',
        photoUrl: 'https://signed.example.test/avatar.png',
        avatarFileId: 301,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      const result = await controller.updateMyAvatar(currentUser, dto);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '456',
          userId: '123',
          actorId: '123',
          fileId: 301
        })
      );
      expect(result.data.avatarFileId).toBe(301);
    });
  });

  describe('removeMyAvatar', () => {
    it('should execute RemoveMyAvatarCommand with authenticated subject user context', async () => {
      const currentUser = {
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Avatar User'
      };
      commandBus.execute.mockResolvedValue({
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com',
        name: 'Avatar User',
        displayName: 'Avatar User',
        photoUrl: null,
        avatarFileId: null,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      const result = await controller.removeMyAvatar(currentUser);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '456',
          userId: '123',
          actorId: '123'
        })
      );
      expect(result.data.avatarFileId).toBeNull();
      expect(result.data.photoUrl).toBeNull();
    });
  });

  describe('changeMyPassword', () => {
    it('should execute ChangeMyPasswordCommand with authenticated subject user context', async () => {
      const currentUser = {
        userId: '123',
        tenantId: '456',
        actorId: '123',
        email: 'test@example.com'
      };
      const dto = { currentPassword: 'OldPass123!', newPassword: 'NewPass123!' };
      commandBus.execute.mockResolvedValue(undefined);

      await controller.changeMyPassword(currentUser, dto);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '456',
          userId: '123',
          actorId: '123',
          email: 'test@example.com',
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!'
        })
      );
    });
  });

  describe('user-agent extraction', () => {
    it('should handle string user-agent header', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);
      const dto = { email: 'test@example.com', password: 'pass' };

      // Act
      await controller.register(undefined, dto, '127.0.0.1', mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Mozilla/5.0 Test Browser'
        })
      );
    });

    it('should handle missing user-agent header', async () => {
      // Arrange
      commandBus.execute.mockResolvedValue(mockAuthResult);
      const dto = { email: 'test@example.com', password: 'pass' };
      const requestWithoutUA = { headers: {} } as Request;

      // Act
      await controller.register(undefined, dto, '127.0.0.1', requestWithoutUA);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Unknown'
        })
      );
    });
  });
});
