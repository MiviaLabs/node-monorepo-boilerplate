/**
 * Unit Tests for DeleteAccountHandler
 *
 * Tests user account deletion with ownership validation and GCP integration.
 */

import { Test } from '@nestjs/testing';
import { AUTH_PROVIDER_FACTORY, type IAuthProvider, type AuthProviderFactory } from '@package/auth';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { TenantResolutionService } from '../../../../../common/services/tenant-resolution.service';
import { DeleteAccountCommand } from '../../../commands/delete-account.command';
import { AuthRepository } from '../../../repositories/auth.repository';
import { OrganizationRepository } from '../../../repositories/organization.repository';
import { UserIdentityRepository } from '../../../repositories/user-identity.repository';
import { DeleteAccountHandler } from '../delete-account.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('DeleteAccountHandler', () => {
  let handler: DeleteAccountHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let orgRepository: jest.Mocked<OrganizationRepository>;
  let userIdentityRepository: jest.Mocked<UserIdentityRepository>;
  let authProvider: jest.Mocked<IAuthProvider>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let tenantResolutionService: { invalidateTenantCache: jest.Mock };
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;
  let module: TestingModule;

  const mockOrg = {
    id: 1,
    tenantId: 1,
    publicId: 'org-public-id',
    name: 'Test Org',
    displayName: 'Test Org',
    slug: 'test-org',
    ownerId: 100,
    gcpTenantId: 'gcp-tenant-123',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: new Date('2099-12-31T00:00:00.000Z')
  };

  const mockUser = {
    id: 100,
    organizationId: 1,
    emailHash: 'abc123...',
    emailEncrypted: 'encrypted-email-mock',
    firstNameEncrypted: 'encrypted-first-name-mock',
    lastNameEncrypted: 'encrypted-last-name-mock',
    displayName: 'Owner User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: true,
    encryptionKeyVersion: 'primary-encryption-key/1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null
  };

  const mockRegularUser = {
    id: 200,
    organizationId: 1,
    emailHash: 'def456...',
    emailEncrypted: 'encrypted-email-mock-2',
    firstNameEncrypted: 'encrypted-first-name-mock-2',
    lastNameEncrypted: 'encrypted-last-name-mock-2',
    displayName: 'Regular User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: true,
    encryptionKeyVersion: 'primary-encryption-key/1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null
  };

  const mockIdentity = {
    id: 1,
    userId: 100,
    provider: 'google.com',
    providerUid: 'google-uid-123',
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    photoUrl: null,
    lastSignInAt: new Date('2024-01-15T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    emailVerified: true,
    phoneVerified: false,
    isPrimary: true,
    encryptionKeyVersion: 'primary-encryption-key/1',
    providerEmailHash: 'hash123',
    providerEmailEncrypted: 'encrypted-email'
  };

  // Helper function to create handler with custom environment variables
  async function createHandlerWithEnv(
    envOverrides: Record<string, string> = {}
  ): Promise<DeleteAccountHandler> {
    // Apply environment variable overrides
    const originalEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(envOverrides)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }

    // Create new module with updated environment
    const newModule = await Test.createTestingModule({
      providers: [
        DeleteAccountHandler,
        {
          provide: AuthRepository,
          useValue: module.get(AuthRepository)
        },
        {
          provide: OrganizationRepository,
          useValue: module.get(OrganizationRepository)
        },
        {
          provide: UserIdentityRepository,
          useValue: module.get(UserIdentityRepository)
        },
        {
          provide: AUTH_PROVIDER_FACTORY,
          useValue: module.get(AUTH_PROVIDER_FACTORY)
        },
        {
          provide: OutboxRepository,
          useValue: module.get(OutboxRepository)
        },
        {
          provide: TenantResolutionService,
          useValue: module.get(TenantResolutionService)
        },
        {
          provide: MAIN_DB,
          useValue: module.get(MAIN_DB)
        }
      ]
    }).compile();

    const newHandler = newModule.get<DeleteAccountHandler>(DeleteAccountHandler);

    // Restore original environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    return newHandler;
  }

  beforeEach(async () => {
    // Reset environment variables
    process.env['USE_SOFT_DELETE'] = 'false';
    process.env['GCP_DELETE_BATCH_SIZE'] = '10';
    process.env['GCP_DELETE_CONCURRENCY_LIMIT'] = '2';

    dbTransaction = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    authProvider = {
      name: 'test-provider',
      type: 'gcp',
      deleteUser: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockResolvedValue(true)
    } as unknown as jest.Mocked<IAuthProvider>;

    const mockAuthProviderFactory: AuthProviderFactory = {
      getDefaultProvider: jest.fn().mockReturnValue(authProvider),
      getProvider: jest.fn().mockReturnValue(authProvider)
    } as unknown as AuthProviderFactory;

    const mockAuthRepository = {
      findById: jest.fn(),
      findByIdWithTransaction: jest.fn(),
      findByOrganizationWithTransaction: jest.fn(),
      countByOrganizationWithLock: jest.fn(),
      softDeleteWithTransaction: jest.fn(),
      deleteWithTransaction: jest.fn(),
      softDeleteAllByOrganization: jest.fn()
    };

    const mockOrgRepository = {
      findById: jest.fn(),
      findByIdWithTransaction: jest.fn(),
      softDeleteWithTransaction: jest.fn(),
      deleteWithTransaction: jest.fn(),
      allowsPublicRegistration: jest.fn()
    };

    const mockUserIdentityRepository = {
      findPrimaryByUserId: jest.fn(),
      findPrimaryByUserIds: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };
    const mockTenantResolutionService = {
      invalidateTenantCache: jest.fn()
    };

    module = await Test.createTestingModule({
      providers: [
        DeleteAccountHandler,
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: OrganizationRepository,
          useValue: mockOrgRepository
        },
        {
          provide: UserIdentityRepository,
          useValue: mockUserIdentityRepository
        },
        {
          provide: AUTH_PROVIDER_FACTORY,
          useValue: mockAuthProviderFactory
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: TenantResolutionService,
          useValue: mockTenantResolutionService
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<DeleteAccountHandler>(DeleteAccountHandler);
    authRepository = module.get(AuthRepository);
    orgRepository = module.get(OrganizationRepository);
    userIdentityRepository = module.get(UserIdentityRepository);
    outboxRepo = module.get(OutboxRepository);
    tenantResolutionService = module.get(TenantResolutionService);
  });

  describe('validation', () => {
    it('should throw VAL_002 if targetUserId is not a valid integer', async () => {
      // Arrange
      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        targetUserId: 'invalid',
        reason: 'Test deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if targetUserId is zero', async () => {
      // Arrange
      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        targetUserId: '0',
        reason: 'Test deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if targetUserId is negative', async () => {
      // Arrange
      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        targetUserId: '-1',
        reason: 'Test deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw USER_001 if user not found', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(null);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      const loggerErrorSpy = jest.spyOn(
        (handler as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
        'error'
      );

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        targetUserId: '999',
        reason: 'Test deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'USER_001'
      });

      expect(dbTransaction.select).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[DeleteAccountHandler] USER NOT FOUND - tenant-scoped diagnostic',
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          userId: 999
        })
      );
      const diagnosticPayload = loggerErrorSpy.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(diagnosticPayload).not.toHaveProperty('organizationId');
    });

    it('should throw BIZ_001 if organization not found', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(null);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        targetUserId: '100',
        reason: 'Test deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });
  });

  describe('owner deletion safeguards', () => {
    it('should reject admin deleting owner account', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '456',
        targetUserId: '100',
        reason: 'Admin deleting owner'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });

      expect(authRepository.findByIdWithTransaction).toHaveBeenCalledWith(
        'primary-encryption-key',
        dbTransaction,
        100
      );
    });

    it('should reject owner self-deletion with other members', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      authRepository.countByOrganizationWithLock.mockResolvedValue(3);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Owner self-deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });

      expect(authRepository.countByOrganizationWithLock).toHaveBeenCalledWith(
        'primary-encryption-key',
        dbTransaction
      );
    });

    it('should allow owner self-deletion as sole member', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      authRepository.countByOrganizationWithLock.mockResolvedValue(1);
      authRepository.findByOrganizationWithTransaction.mockResolvedValue([mockUser]);
      userIdentityRepository.findPrimaryByUserIds.mockResolvedValue([mockIdentity]);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Owner self-deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).resolves.not.toThrow();
      expect(orgRepository.deleteWithTransaction).toHaveBeenCalledWith(dbTransaction, 1);
      expect(tenantResolutionService.invalidateTenantCache).toHaveBeenCalledWith(1, {
        previousSlug: 'test-org'
      });
    });
  });

  describe('regular user deletion', () => {
    it('should delete regular user successfully', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: 'User deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).resolves.not.toThrow();
      expect(authRepository.deleteWithTransaction).toHaveBeenCalledWith(
        'primary-encryption-key',
        dbTransaction,
        200
      );
      expect(tenantResolutionService.invalidateTenantCache).not.toHaveBeenCalled();
    });

    it('should delete from GCP when user has identity', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(mockIdentity);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: 'User deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).resolves.not.toThrow();
      expect(authProvider.deleteUser).toHaveBeenCalledWith('google-uid-123', 'gcp-tenant-123');
    });

    it('should skip GCP deletion in soft delete mode', async () => {
      // Arrange - Create handler with soft delete mode enabled
      const softDeleteHandler = await createHandlerWithEnv({ USE_SOFT_DELETE: 'true' });

      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(mockIdentity);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: 'Soft delete'
      });

      // Act & Assert
      await expect(softDeleteHandler.execute(command)).resolves.not.toThrow();
      expect(authProvider.deleteUser).not.toHaveBeenCalled();
      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledWith(
        'primary-encryption-key',
        dbTransaction,
        200
      );
    });
  });

  describe('organization deletion', () => {
    it('should delete organization when owner is sole member', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      authRepository.countByOrganizationWithLock.mockResolvedValue(1);
      authRepository.findByOrganizationWithTransaction.mockResolvedValue([mockUser]);
      userIdentityRepository.findPrimaryByUserIds.mockResolvedValue([mockIdentity]);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Owner self-deletion'
      });

      // Act & Assert
      await expect(handler.execute(command)).resolves.not.toThrow();
      expect(orgRepository.deleteWithTransaction).toHaveBeenCalledWith(dbTransaction, 1);
    });

    it('should soft delete organization in soft delete mode', async () => {
      // Arrange - Create handler with soft delete mode enabled
      const softDeleteHandler = await createHandlerWithEnv({ USE_SOFT_DELETE: 'true' });

      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      authRepository.countByOrganizationWithLock.mockResolvedValue(1);
      authRepository.findByOrganizationWithTransaction.mockResolvedValue([mockUser]);
      userIdentityRepository.findPrimaryByUserIds.mockResolvedValue([mockIdentity]);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Soft delete org'
      });

      // Act & Assert
      await expect(softDeleteHandler.execute(command)).resolves.not.toThrow();
      expect(authRepository.softDeleteAllByOrganization).toHaveBeenCalledWith(
        'primary-encryption-key',
        dbTransaction
      );
      expect(orgRepository.softDeleteWithTransaction).toHaveBeenCalledWith(dbTransaction, 1);
    });
  });

  describe('GCP deletion', () => {
    it('should batch delete users from GCP', async () => {
      // Arrange
      // Create handler with higher concurrency limit to test batch deletion
      const batchHandler = await createHandlerWithEnv({
        GCP_DELETE_CONCURRENCY_LIMIT: '10',
        GCP_DELETE_BATCH_SIZE: '10'
      });

      const users = [mockUser, { ...mockUser, id: 101 }, { ...mockUser, id: 102 }];

      const identities = [
        mockIdentity,
        { ...mockIdentity, userId: 101, providerUid: 'google-uid-456' },
        { ...mockIdentity, userId: 102, providerUid: 'google-uid-789' }
      ];

      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      // Owner is the sole member in the org (count=1) but we have 3 users in the mock
      // This tests the batch deletion logic when an org with multiple users is deleted
      authRepository.countByOrganizationWithLock.mockResolvedValue(1);
      authRepository.findByOrganizationWithTransaction.mockResolvedValue(users);
      userIdentityRepository.findPrimaryByUserIds.mockResolvedValue(identities);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Delete org'
      });

      // Act & Assert
      await expect(batchHandler.execute(command)).resolves.not.toThrow();
      expect(authProvider.deleteUser).toHaveBeenCalledTimes(3);
    });

    it('should skip GCP deletion when no gcpTenantId', async () => {
      // Arrange
      const orgWithoutGcp = { ...mockOrg, gcpTenantId: null };

      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(orgWithoutGcp);
      authRepository.countByOrganizationWithLock.mockResolvedValue(1);
      authRepository.findByOrganizationWithTransaction.mockResolvedValue([mockUser]);
      userIdentityRepository.findPrimaryByUserIds.mockResolvedValue([mockIdentity]);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Delete org'
      });

      // Act & Assert
      await expect(handler.execute(command)).resolves.not.toThrow();
      expect(authProvider.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('audit logging', () => {
    it('should create audit log for user deletion', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: 'GDPR request'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'account.deleted.audit',
          aggregateId: '200',
          tenantId: 'primary-encryption-key',
          payload: expect.objectContaining({
            action: 'DELETE_ACCOUNT',
            actorId: '100',
            tenantId: 'primary-encryption-key',
            target: expect.objectContaining({
              entityType: 'user',
              entityId: '200'
            }),
            details: expect.objectContaining({
              cascaded: false,
              deletedUserCount: 1,
              reasonProvided: true
            })
          })
        })
      );
    });

    it('should create audit log for organization deletion', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      authRepository.countByOrganizationWithLock.mockResolvedValue(1);
      authRepository.findByOrganizationWithTransaction.mockResolvedValue([mockUser]);
      userIdentityRepository.findPrimaryByUserIds.mockResolvedValue([mockIdentity]);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '100',
        reason: 'Close business'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'account.deleted.audit',
          payload: expect.objectContaining({
            action: 'DELETE_ORGANIZATION',
            details: expect.objectContaining({
              cascaded: true,
              deletedUserCount: 1,
              reasonProvided: true
            })
          })
        })
      );
    });

    it('should not persist free-text reason content in audit metadata', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: '<script>alert("xss")</script> Test reason'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls.find(
        (call) => call[1].eventType === 'account.deleted.audit'
      );

      expect(outboxCall).toBeDefined();
      if (outboxCall) {
        const payload = outboxCall[1].payload as { details?: Record<string, unknown> };
        expect(payload.details).toEqual(
          expect.objectContaining({
            reasonProvided: true
          })
        );
        expect(payload.details).not.toHaveProperty('reason');
      }
    });

    it('should keep audit metadata bounded when a long reason is supplied', async () => {
      // Arrange
      const longReason = 'A'.repeat(600);
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: longReason
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls.find(
        (call) => call[1].eventType === 'account.deleted.audit'
      );

      expect(outboxCall).toBeDefined();
      if (outboxCall) {
        const payload = outboxCall[1].payload as { details?: Record<string, unknown> };
        expect(payload.details).toEqual(
          expect.objectContaining({
            reasonProvided: true
          })
        );
        expect(payload.details).not.toHaveProperty('reason');
      }
    });
  });

  describe('transaction handling', () => {
    it('should execute all operations within transaction', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(null);

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: 'Test'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should roll back transaction on GCP deletion failure', async () => {
      // Arrange
      authRepository.findByIdWithTransaction.mockResolvedValue(mockRegularUser);
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrg);
      userIdentityRepository.findPrimaryByUserId.mockResolvedValue(mockIdentity);
      authProvider.deleteUser.mockRejectedValue(new Error('GCP deletion failed'));

      const command = new DeleteAccountCommand({
        tenantId: 'primary-encryption-key',
        actorId: '100',
        targetUserId: '200',
        reason: 'Test'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('GCP deletion failed');
    });
  });
});
