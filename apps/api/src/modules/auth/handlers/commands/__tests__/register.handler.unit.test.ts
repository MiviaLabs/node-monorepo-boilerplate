/**
 * Unit Tests for RegisterHandler
 *
 * Tests user registration with organization creation and GCP provisioning.
 */

import { Test } from '@nestjs/testing';
import { hashEmail } from '@package/utils';

import { InvitationRepository, UserTenantRepository } from '../../../../tenants/repositories';
import { RegisterCommand } from '../../../commands/register.command';
import { OrganizationRepository } from '../../../repositories/organization.repository';
import { AuthService } from '../../../services/auth.service';
import { RegisterHandler } from '../register.handler';

import type { TestingModule } from '@nestjs/testing';

interface MockOrganization {
  id: number;
  tenantId: number;
  ownerId: number | null;
  publicId: string;
  name: string;
  displayName: string | null;
  slug: string;
  gcpTenantId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  allowsPublicRegistration?: boolean;
}

describe('RegisterHandler', () => {
  let handler: RegisterHandler;
  let authService: jest.Mocked<AuthService>;
  let organizationRepository: jest.Mocked<OrganizationRepository>;
  let invitationRepository: jest.Mocked<InvitationRepository>;
  let userTenantRepository: jest.Mocked<UserTenantRepository>;

  const mockAuthResult = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idToken: 'id-token',
    expiresIn: 3600,
    refreshExpiresIn: 86400
  };

  const mockUserInfo = {
    userId: '123',
    tenantId: 'primary-encryption-key',
    email: 'user@example.com',
    displayName: 'Test User'
  };

  const mockUser = {
    id: 123,
    organizationId: 1,
    emailHash: 'abc123...',
    emailEncrypted: 'encrypted-email-mock',
    firstNameEncrypted: 'encrypted-first-name-mock',
    lastNameEncrypted: 'encrypted-last-name-mock',
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null,
    encryptionKeyVersion: 'primary-encryption-key/1'
  };

  /**
   * Helper function to create a mock organization with all required fields
   */
  const createMockOrganization = (allowsPublicRegistration = false): MockOrganization => ({
    id: 1,
    tenantId: 1,
    ownerId: 123,
    publicId: 'org-public-id',
    name: 'Test Org',
    displayName: 'Test Org',
    slug: 'test-org',
    gcpTenantId: 'gcp-tenant-123',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    allowsPublicRegistration
  });

  beforeEach(async () => {
    const mockAuthService = {
      registerWithEmailPassword: jest.fn(),
      authenticateWithEmailPassword: jest.fn(),
      findActiveUserByEmailInTenant: jest.fn(),
      activateAndVerifyExistingUserForInvitation: jest.fn(),
      findActiveUserByEmailGlobally: jest.fn()
    };

    const mockOrgRepository = {
      findById: jest.fn(),
      allowsPublicRegistration: jest.fn()
    };

    const mockInvitationRepository = {
      findPendingByTokenHash: jest.fn(),
      markAsAccepted: jest.fn(),
      markAsAcceptedWithTransaction: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([])
              })
            })
          })
        })
      )
    };

    const mockUserTenantRepository = {
      findByUserAndTenant: jest.fn(),
      createMembership: jest.fn(),
      createMembershipWithTransaction: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegisterHandler,
        {
          provide: AuthService,
          useValue: mockAuthService
        },
        {
          provide: OrganizationRepository,
          useValue: mockOrgRepository
        },
        {
          provide: InvitationRepository,
          useValue: mockInvitationRepository
        },
        {
          provide: UserTenantRepository,
          useValue: mockUserTenantRepository
        }
      ]
    }).compile();

    handler = module.get<RegisterHandler>(RegisterHandler);
    authService = module.get(AuthService);
    organizationRepository = module.get(OrganizationRepository);
    invitationRepository = module.get(InvitationRepository);
    userTenantRepository = module.get(UserTenantRepository);
  });

  describe('tenant validation', () => {
    it('should validate organization exists when tenantId provided', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(null);

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });

    it('should check public registration is allowed for tenant', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(false));

      organizationRepository.allowsPublicRegistration.mockResolvedValue(false);

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });

    it('should pass validation when organization allows public registration', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(true));

      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(organizationRepository.findById).toHaveBeenCalledWith('primary-encryption-key');
      expect(organizationRepository.allowsPublicRegistration).toHaveBeenCalledWith(
        'primary-encryption-key'
      );
      expect(result).toBeDefined();
    });
  });

  describe('organization auto-creation', () => {
    it('should allow registration without tenantId and without organizationName (auto-creates with defaults)', async () => {
      // Arrange
      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'new-tenant-123',
        isNewOrganization: true,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: undefined, // No tenant ID - will auto-create organization
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User',
        organizationName: undefined // No organization name - will use defaults
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.registerWithEmailPassword).toHaveBeenCalledWith(
        undefined,
        'user@example.com',
        'SecurePass123!',
        'Test User',
        undefined,
        true,
        true,
        undefined,
        {}
      );
      expect(result).toBeDefined();
    });

    it('should allow registration without tenantId when organizationName provided', async () => {
      // Arrange
      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'new-tenant-123',
        isNewOrganization: true,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: '',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User',
        organizationName: 'New Organization'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.registerWithEmailPassword).toHaveBeenCalledWith(
        '',
        'user@example.com',
        'SecurePass123!',
        'Test User',
        'New Organization',
        true,
        true,
        undefined,
        {}
      );
      expect(result).toBeDefined();
    });
  });

  describe('user registration', () => {
    it('should register user via auth service', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(true));

      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.registerWithEmailPassword).toHaveBeenCalledWith(
        'primary-encryption-key',
        'user@example.com',
        'SecurePass123!',
        'Test User',
        undefined,
        true,
        true,
        undefined,
        {}
      );
    });

    it('should pass isVerified and isActive flags', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(false));
      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User',
        isVerified: false,
        isActive: false
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.registerWithEmailPassword).toHaveBeenCalledWith(
        'primary-encryption-key',
        'user@example.com',
        'SecurePass123!',
        'Test User',
        undefined,
        false,
        false,
        undefined,
        {}
      );
    });

    it('should forward request trace metadata into registration service', async () => {
      organizationRepository.findById.mockResolvedValue(createMockOrganization(false));
      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      await handler.execute(
        new RegisterCommand({
          tenantId: 'primary-encryption-key',
          email: 'user@example.com',
          password: 'SecurePass123!',
          displayName: 'Test User',
          requestId: 'req-123',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        })
      );

      expect(authService.registerWithEmailPassword).toHaveBeenCalledWith(
        'primary-encryption-key',
        'user@example.com',
        'SecurePass123!',
        'Test User',
        undefined,
        true,
        true,
        undefined,
        {
          requestId: 'req-123',
          correlationId: 'corr-123',
          causationId: 'cause-123'
        }
      );
    });
  });

  describe('post-registration authentication', () => {
    it('should authenticate newly registered user', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(false));
      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.authenticateWithEmailPassword).toHaveBeenCalledWith(
        'primary-encryption-key',
        'user@example.com',
        'SecurePass123!',
        { isRetryForNewUser: true }
      );
    });

    it('should return auth response with tokens', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(false));
      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '123',
          tenantId: 'primary-encryption-key',
          email: 'user@example.com',
          emailVerified: undefined,
          permissions: [],
          roles: [],
          username: 'user@example.com'
        },
        isNewUser: true
      });
    });

    it('should always mark new user as true for registration', async () => {
      // Arrange
      organizationRepository.findById.mockResolvedValue(createMockOrganization(false));
      organizationRepository.allowsPublicRegistration.mockResolvedValue(true);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'primary-encryption-key',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isNewUser).toBe(true);
    });
  });

  describe('new organization creation', () => {
    it('should indicate new organization when created', async () => {
      // Arrange
      authService.registerWithEmailPassword.mockResolvedValue({
        user: mockUser,
        tenantId: 'new-tenant-123',
        isNewOrganization: true,
        gcpTenantId: 'new-gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new RegisterCommand({
        tenantId: '',
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'Test User',
        organizationName: 'New Organization'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.registerWithEmailPassword).toHaveBeenCalledWith(
        '',
        'user@example.com',
        'SecurePass123!',
        'Test User',
        'New Organization',
        true,
        true,
        undefined,
        {}
      );
    });
  });

  describe('invitation token flow', () => {
    it('should reject invitation registration when tenantId is missing', async () => {
      const command = new RegisterCommand({
        email: 'user@example.com',
        password: 'SecurePass123!',
        invitationToken: 'token-123'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should reject invalid invitation token', async () => {
      invitationRepository.findPendingByTokenHash.mockResolvedValue(null);

      const command = new RegisterCommand({
        tenantId: '123',
        email: 'user@example.com',
        password: 'SecurePass123!',
        invitationToken: 'token-123'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });

    it('should reject invitation-based registration when the email already belongs to another tenant', async () => {
      organizationRepository.findById.mockResolvedValue({
        ...createMockOrganization(false),
        id: 123,
        tenantId: 456
      });
      invitationRepository.findPendingByTokenHash.mockResolvedValue({
        id: 77,
        organizationId: 123,
        emailHash: hashEmail('user@example.com'),
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 1,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);
      authService.findActiveUserByEmailInTenant.mockResolvedValue(null);
      authService.findActiveUserByEmailGlobally.mockResolvedValue({
        ...mockUser,
        id: 888,
        organizationId: 999
      } as never);

      const command = new RegisterCommand({
        tenantId: '123',
        email: 'user@example.com',
        password: 'SecurePass123!',
        invitationToken: 'token-123'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
      expect(authService.registerWithEmailPassword).not.toHaveBeenCalled();
    });

    it('should accept invitation and create membership after registration', async () => {
      organizationRepository.findById.mockResolvedValue({
        ...createMockOrganization(false),
        id: 123,
        tenantId: 456
      });
      invitationRepository.findPendingByTokenHash.mockResolvedValue({
        id: 77,
        organizationId: 123,
        emailHash: hashEmail('user@example.com'),
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_admin',
        invitedByUserId: 1,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);
      userTenantRepository.createMembershipWithTransaction.mockResolvedValue({
        id: 1
      } as never);
      invitationRepository.markAsAcceptedWithTransaction.mockResolvedValue({
        id: 77,
        status: 'accepted'
      } as never);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: {
          ...mockUser,
          id: 1234
        } as never,
        tenantId: '123',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser as never
      });

      const command = new RegisterCommand({
        tenantId: '123',
        email: 'user@example.com',
        password: 'SecurePass123!',
        invitationToken: 'token-123'
      });

      await handler.execute(command);

      expect(organizationRepository.allowsPublicRegistration).not.toHaveBeenCalled();
      expect(userTenantRepository.createMembershipWithTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.any(Function)
        }),
        expect.objectContaining({
          userId: 1234,
          tenantId: 456,
          role: 'tenant_admin'
        })
      );
      expect(invitationRepository.markAsAcceptedWithTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.any(Function)
        }),
        123,
        77
      );
    });

    it('should reuse existing tenant account for invitation acceptance without creating user again', async () => {
      organizationRepository.findById.mockResolvedValue({
        ...createMockOrganization(false),
        id: 123,
        tenantId: 456
      });
      invitationRepository.findPendingByTokenHash.mockResolvedValue({
        id: 90,
        organizationId: 123,
        emailHash: hashEmail('user@example.com'),
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 1,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);
      authService.findActiveUserByEmailInTenant.mockResolvedValue({
        ...mockUser,
        id: 2222,
        organizationId: 123
      } as never);
      authService.activateAndVerifyExistingUserForInvitation.mockResolvedValue({
        ...mockUser,
        id: 2222,
        organizationId: 123,
        isActive: true,
        isVerified: true
      } as never);
      userTenantRepository.createMembershipWithTransaction.mockResolvedValue({ id: 1 } as never);
      invitationRepository.markAsAcceptedWithTransaction.mockResolvedValue({
        id: 90,
        status: 'accepted'
      } as never);
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser as never
      });

      const command = new RegisterCommand({
        tenantId: '123',
        email: 'user@example.com',
        password: 'SecurePass123!',
        invitationToken: 'token-123'
      });

      const result = await handler.execute(command);

      expect(authService.findActiveUserByEmailInTenant).toHaveBeenCalledWith(
        '123',
        'user@example.com'
      );
      expect(authService.activateAndVerifyExistingUserForInvitation).toHaveBeenCalledWith(
        '123',
        2222
      );
      expect(authService.registerWithEmailPassword).not.toHaveBeenCalled();
      expect(authService.authenticateWithEmailPassword).toHaveBeenCalledWith(
        '123',
        'user@example.com',
        'SecurePass123!',
        { isRetryForNewUser: false }
      );
      expect(userTenantRepository.createMembershipWithTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.any(Function)
        }),
        expect.objectContaining({
          userId: 2222,
          tenantId: 456,
          role: 'tenant_user'
        })
      );
      expect(invitationRepository.markAsAcceptedWithTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.any(Function)
        }),
        123,
        90
      );
      expect(result.isNewUser).toBe(false);
    });

    it('should not consume invitation when post-registration authentication fails', async () => {
      organizationRepository.findById.mockResolvedValue({
        ...createMockOrganization(false),
        id: 123,
        tenantId: 456
      });
      invitationRepository.findPendingByTokenHash.mockResolvedValue({
        id: 88,
        organizationId: 123,
        emailHash: hashEmail('user@example.com'),
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 1,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: {
          ...mockUser,
          id: 5678
        } as never,
        tenantId: '123',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });

      authService.authenticateWithEmailPassword.mockRejectedValue(new Error('Invalid credentials'));

      const command = new RegisterCommand({
        tenantId: '123',
        email: 'user@example.com',
        password: 'SecurePass123!',
        invitationToken: 'token-123'
      });

      await expect(handler.execute(command)).rejects.toThrow('Invalid credentials');
      expect(userTenantRepository.createMembershipWithTransaction).not.toHaveBeenCalled();
      expect(invitationRepository.markAsAcceptedWithTransaction).not.toHaveBeenCalled();
    });

    it('should not create membership if invitation consumption fails inside the transaction', async () => {
      organizationRepository.findById.mockResolvedValue({
        ...createMockOrganization(false),
        id: 123,
        tenantId: 456
      });
      invitationRepository.findPendingByTokenHash.mockResolvedValue({
        id: 99,
        organizationId: 123,
        emailHash: hashEmail('user@example.com'),
        emailEncrypted: 'ciphertext:key:iv:tag',
        tokenHash: 'token-hash',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 1,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);

      authService.registerWithEmailPassword.mockResolvedValue({
        user: {
          ...mockUser,
          id: 7777
        } as never,
        tenantId: '123',
        isNewOrganization: false,
        gcpTenantId: 'gcp-tenant-123'
      });
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser as never
      });
      invitationRepository.markAsAcceptedWithTransaction.mockResolvedValue(null);

      await expect(
        handler.execute(
          new RegisterCommand({
            tenantId: '123',
            email: 'user@example.com',
            password: 'SecurePass123!',
            invitationToken: 'token-123'
          })
        )
      ).rejects.toMatchObject({
        code: 'BIZ_001'
      });

      expect(userTenantRepository.createMembershipWithTransaction).not.toHaveBeenCalled();
    });
  });
});
