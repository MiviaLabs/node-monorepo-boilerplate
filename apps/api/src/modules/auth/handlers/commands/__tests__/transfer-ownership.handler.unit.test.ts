/**
 * Unit Tests for TransferOwnershipHandler
 *
 * Tests organization ownership transfer with validation and events.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { TransferOwnershipCommand } from '../../../commands/transfer-ownership.command';
import { AuthRepository } from '../../../repositories/auth.repository';
import { OrganizationRepository } from '../../../repositories/organization.repository';
import { TransferOwnershipHandler } from '../transfer-ownership.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('TransferOwnershipHandler', () => {
  let handler: TransferOwnershipHandler;
  let authRepository: jest.Mocked<AuthRepository>;
  let orgRepository: jest.Mocked<OrganizationRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockOrganization = {
    id: 123,
    name: 'Test Organization',
    displayName: 'Test Organization',
    ownerId: 100,
    tenantId: 456,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    publicId: 'pub-123',
    slug: 'test-org',
    gcpTenantId: 'gcp-tenant-123',
    isActive: true,
    deletedAt: null
  };

  const mockNewOwner = {
    id: 200,
    organizationId: 123,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    emailHash: 'hash123',
    emailEncrypted: 'encrypted-email',
    displayName: 'New Owner',
    isVerified: true,
    passwordHash: null,
    lastSignInAt: null,
    firstNameEncrypted: null,
    lastNameEncrypted: null,
    phoneNumberEncrypted: null,
    photoUrl: null,
    avatarFileId: null,
    encryptionKeyVersion: 'primary-encryption-key/1'
  };

  const mockUpdatedOrg = {
    ...mockOrganization,
    ownerId: 200
  };

  beforeEach(async () => {
    dbTransaction = {
      transaction: jest.fn()
    } as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockAuthRepository = {
      findByIdGlobalWithTransaction: jest.fn()
    };

    const mockOrgRepository = {
      findByIdWithTransaction: jest.fn(),
      transferOwnership: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferOwnershipHandler,
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: OrganizationRepository,
          useValue: mockOrgRepository
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<TransferOwnershipHandler>(TransferOwnershipHandler);
    authRepository = module.get(AuthRepository);
    orgRepository = module.get(OrganizationRepository);
    outboxRepo = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('organization validation', () => {
    it('should throw BIZ_001 when organization not found', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(null);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });
  });

  describe('authorization', () => {
    it('should throw AUTH_004 when actor is not current owner', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '999', // Not the owner (100)
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_004'
      });
    });
  });

  describe('new owner validation', () => {
    it('should throw BIZ_001 when new owner is same as current owner', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '100' // Same as current owner
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });

    it('should throw USER_001 when new owner user not found', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(null);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '999' // Does not exist
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'USER_001'
      });
    });

    it('should throw BIZ_001 when new owner belongs to different organization', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue({
        ...mockNewOwner,
        organizationId: 999 // Different org
      });

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });

    it('should throw BIZ_001 when new owner is inactive', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue({
        ...mockNewOwner,
        isActive: false
      });

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });

    it('should throw BIZ_001 when new owner is soft-deleted', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue({
        ...mockNewOwner,
        isActive: true,
        deletedAt: new Date()
      });

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
    });
  });

  describe('ownership transfer', () => {
    it('should transfer ownership successfully', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(orgRepository.transferOwnership).toHaveBeenCalledWith('123', 200, dbTransaction);
    });

    it('should execute within transaction', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  describe('event publishing', () => {
    it('should publish ownership transferred event', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200',
        reason: 'Test transfer'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'organization.ownership.transferred',
          aggregateId: '123',
          payload: expect.objectContaining({
            tenantId: '123',
            organizationId: '123',
            previousOwnerId: '100',
            newOwnerId: '200',
            reason: 'Test transfer'
          })
        })
      );
    });

    it('should publish audit event', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'organization.ownership.transferred.audit',
          payload: expect.objectContaining({
            action: 'TRANSFER_OWNERSHIP',
            actorId: '100',
            tenantId: '123',
            target: expect.objectContaining({
              entityType: 'organization',
              entityId: '123'
            }),
            details: expect.objectContaining({
              newOwnerId: '200',
              reasonProvided: false
            })
          })
        })
      );
    });

    it('should publish both events within transaction', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledTimes(2);

      // Both calls should use the transaction
      expect(outboxRepo.insert.mock.calls[0]?.[0]).toBe(dbTransaction);
      expect(outboxRepo.insert.mock.calls[1]?.[0]).toBe(dbTransaction);
    });

    it('should include schema version in events', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          schemaVersion: '1.0'
        })
      );
    });
  });

  describe('optional reason', () => {
    it('should include reason when provided', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200',
        reason: 'CEO transition'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          payload: expect.objectContaining({
            reason: 'CEO transition'
          })
        })
      );
    });

    it('should handle undefined reason', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
        // No reason
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should rollback transaction on organization lookup failure', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockRejectedValue(new Error('Database error'));

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Database error');
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should rollback transaction on transfer failure', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockRejectedValue(new Error('Transfer failed'));

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Transfer failed');
    });

    it('should rollback transaction on outbox insert failure', async () => {
      // Arrange
      orgRepository.findByIdWithTransaction.mockResolvedValue(mockOrganization);
      authRepository.findByIdGlobalWithTransaction.mockResolvedValue(mockNewOwner);
      orgRepository.transferOwnership.mockResolvedValue(mockUpdatedOrg);
      outboxRepo.insert.mockRejectedValue(new Error('Outbox error'));

      const command = new TransferOwnershipCommand({
        tenantId: '123',
        actorId: '100',
        newOwnerId: '200'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Outbox error');
    });
  });
});
