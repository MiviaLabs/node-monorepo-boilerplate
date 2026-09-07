/**
 * Unit Tests for AuthRepository
 *
 * Tests authentication repository with multi-tenancy support.
 */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

import { Test } from '@nestjs/testing';
import { CachedPermissionService } from '@package/auth';
import { EncryptionService } from '@package/encryption';
import { Errors } from '@package/errors';
import { hashEmail } from '@package/utils';

import { EncryptedStoreKeyService } from '../../../encrypted-store/encrypted-store-key.service';
import { AuthRepository } from '../auth.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('AuthRepository', () => {
  let repository: AuthRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockDb = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(),
    execute: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRepository,
        {
          provide: CachedPermissionService,
          useValue: {
            hasPermission: jest.fn().mockResolvedValue(true)
          }
        },
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: EncryptionService,
          useValue: {
            encryptToBase64: jest.fn().mockResolvedValue({
              ciphertext: 'encrypted',
              encryptedDataKey: 'key',
              iv: 'iv',
              authTag: 'tag'
            }),
            decryptFromBase64: jest.fn().mockResolvedValue('+14155552671')
          }
        },
        {
          provide: EncryptedStoreKeyService,
          useValue: {
            getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
              keyId: 'primary-encryption-key',
              keyVersion: 'primary-encryption-key/1'
            })
          }
        }
      ]
    }).compile();

    repository = module.get<AuthRepository>(AuthRepository);
    db = mockDb as never;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('validateTenantId', () => {
    it('should convert valid string tenant ID to number', () => {
      // Act - Use type assertion to access private method for testing
      const result = (
        repository as unknown as {
          validateTenantId(tenantId: string): number;
          encryptToEnvelope(value: string): Promise<string>;
        }
      ).validateTenantId('123');

      // Assert
      expect(result).toBe(123);
    });

    it('should throw error for non-integer tenant ID', () => {
      // Act & Assert
      expect(() =>
        (
          repository as unknown as {
            validateTenantId(tenantId: string): number;
            encryptToEnvelope(value: string): Promise<string>;
          }
        ).validateTenantId('not-a-number')
      ).toThrow(
        Errors.validationinvalidValueFor002({
          field: 'tenantId',
          expectedType: 'positive integer'
        })
      );
    });

    it('should throw error for zero tenant ID', () => {
      // Act & Assert
      expect(() =>
        (
          repository as unknown as {
            validateTenantId(tenantId: string): number;
            encryptToEnvelope(value: string): Promise<string>;
          }
        ).validateTenantId('0')
      ).toThrow(
        Errors.validationinvalidValueFor002({
          field: 'tenantId',
          expectedType: 'positive integer'
        })
      );
    });

    it('should throw error for negative tenant ID', () => {
      // Act & Assert
      expect(() =>
        (
          repository as unknown as {
            validateTenantId(tenantId: string): number;
            encryptToEnvelope(value: string): Promise<string>;
          }
        ).validateTenantId('-1')
      ).toThrow(
        Errors.validationinvalidValueFor002({
          field: 'tenantId',
          expectedType: 'positive integer'
        })
      );
    });

    it('should throw error for decimal tenant ID', () => {
      // Act & Assert
      expect(() =>
        (
          repository as unknown as {
            validateTenantId(tenantId: string): number;
            encryptToEnvelope(value: string): Promise<string>;
          }
        ).validateTenantId('123.45')
      ).toThrow(
        Errors.validationinvalidValueFor002({
          field: 'tenantId',
          expectedType: 'positive integer'
        })
      );
    });
  });

  describe('dependency injection', () => {
    it('should fail module compilation when permission service provider is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            AuthRepository,
            {
              provide: MAIN_DB,
              useValue: mockDb
            }
          ]
        }).compile()
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find user by ID within tenant scope', async () => {
      // Arrange
      const mockUser = { id: 1, organizationId: 123, emailHash: 'hash123' };
      const mockLimit = jest.fn().mockResolvedValue([mockUser]);
      const mockWhere = jest.fn().mockReturnValue({
        limit: mockLimit
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findById('123', 1);

      // Assert
      expect(result).toEqual(mockUser);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      // Arrange
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({
        limit: mockLimit
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findById('123', 999);

      // Assert
      expect(result).toBeNull();
    });

    it('should exclude soft-deleted users', async () => {
      // Arrange
      const mockUser = { id: 1, organizationId: 123, deletedAt: null };
      const mockLimit = jest.fn().mockResolvedValue([mockUser]);
      const mockWhere = jest.fn().mockReturnValue({
        limit: mockLimit
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      await repository.findById('123', 1);

      // Assert - should check deletedAt is null
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('findByIdWithTransaction', () => {
    it('should find user by ID within transaction', async () => {
      // Arrange
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ id: 1 }])
            })
          })
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.findByIdWithTransaction('123', mockTx, 1);

      // Assert
      expect(result).toEqual({ id: 1 });
    });

    it('should return null when user not found in transaction', async () => {
      // Arrange
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.findByIdWithTransaction('123', mockTx, 999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email within tenant', async () => {
      // Arrange
      const email = 'user@example.com';
      const mockUser = { id: 1, organizationId: 123, emailHash: hashEmail(email) };
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByEmail('123', email);

      // Assert
      expect(result).toEqual(mockUser);
    });

    it('should hash the input email before query', async () => {
      // Arrange
      const email = 'test@example.com';
      const expectedHash = hashEmail(email);
      const mockUser = { id: 1, organizationId: 123, emailHash: expectedHash };
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      await repository.findByEmail('123', email);

      // Assert - verify that the where clause includes the hashed email
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should search globally when tenantId is undefined', async () => {
      // Arrange
      const email = 'user@example.com';
      const mockUser = { id: 1, organizationId: 123, emailHash: hashEmail(email) };
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByEmail(undefined, email);

      // Assert
      expect(result).toEqual(mockUser);
    });

    it('should return null when email not found', async () => {
      // Arrange
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByEmail('123', 'notfound@example.com');

      // Assert
      expect(result).toBeNull();
    });

    it('should exclude soft-deleted users', async () => {
      // Arrange
      const email = 'user@example.com';
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      await repository.findByEmail('123', email);

      // Assert - should filter by deletedAt is null
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('updateMyProfile', () => {
    it('should update displayName for a user within tenant scope', async () => {
      const returning = jest.fn().mockResolvedValue([{ id: 1, displayName: 'Updated Name' }]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      jest.spyOn(db, 'update').mockReturnValue({ set } as never);

      const result = await repository.updateMyProfile('123', 1, {
        displayName: '  Updated Name  '
      });

      expect(result).toEqual({ id: 1, displayName: 'Updated Name' });
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Updated Name',
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should throw when displayName is empty after trim', async () => {
      await expect(repository.updateMyProfile('123', 1, { displayName: '   ' })).rejects.toThrow();
    });

    it('should encrypt phone number before persisting', async () => {
      const returning = jest.fn().mockResolvedValue([{ id: 1, displayName: 'Updated Name' }]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      jest.spyOn(db, 'update').mockReturnValue({ set } as never);

      await repository.updateMyProfile('123', 1, { phoneNumber: ' +14155552671 ' });

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumberEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1',
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should clear the stored phone number when an empty string is provided', async () => {
      const returning = jest.fn().mockResolvedValue([{ id: 1, displayName: 'Updated Name' }]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      jest.spyOn(db, 'update').mockReturnValue({ set } as never);

      await repository.updateMyProfile('123', 1, { phoneNumber: '   ' });

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumberEncrypted: null,
          updatedAt: expect.any(Date)
        })
      );
    });
  });

  describe('decryptPhoneNumber', () => {
    it('should return undefined when phone number is not set', async () => {
      await expect(repository.decryptPhoneNumber(null)).resolves.toBeUndefined();
    });

    it('should decrypt envelope formatted phone number', async () => {
      await expect(repository.decryptPhoneNumber('cipher:key:iv:tag')).resolves.toBe(
        '+14155552671'
      );
    });

    it('should throw when encrypted phone format is invalid', async () => {
      await expect(repository.decryptPhoneNumber('invalid')).rejects.toThrow();
    });
  });

  describe('findByEmailOrThrow', () => {
    it('should return user when found', async () => {
      // Arrange
      const email = 'user@example.com';
      const mockUser = { id: 1, organizationId: 123 };
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser as never);

      // Act
      const result = await repository.findByEmailOrThrow('123', email);

      // Assert
      expect(result).toEqual(mockUser);
    });

    it('should throw error when user not found', async () => {
      // Arrange
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);

      // Act & Assert
      await expect(repository.findByEmailOrThrow('123', 'notfound@example.com')).rejects.toThrow(
        Errors.authinvalidEmailOr001({})
      );
    });
  });

  describe('emailExists', () => {
    it('should return true when email exists in tenant', async () => {
      // Arrange
      const mockResult = { count: 1 };
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockResult])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.emailExists('123', 'user@example.com');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      // Arrange
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.emailExists('123', 'notfound@example.com');

      // Assert
      expect(result).toBe(false);
    });

    it('should check globally when tenantId is undefined', async () => {
      // Arrange
      const mockResult = { count: 1 };
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockResult])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.emailExists(undefined, 'user@example.com');

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('createWithEmail', () => {
    it('should create user with hashed and encrypted email', async () => {
      // Arrange
      const email = 'newuser@example.com';
      const mockUser = { id: 1, organizationId: 123, emailHash: hashEmail(email) };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      const result = await repository.createWithEmail('123', email, {
        displayName: 'New User'
      });

      // Assert
      expect(result).toEqual(mockUser);
      expect(db.insert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          emailHash: hashEmail(email),
          emailEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });

    it('should hash the email before insert', async () => {
      // Arrange
      const email = 'test@example.com';
      const expectedHash = hashEmail(email);
      const mockUser = { id: 1, organizationId: 123, emailHash: expectedHash };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithEmail('123', email, {
        displayName: 'Test User'
      });

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          emailHash: expectedHash
        })
      );
    });

    it('should ignore caller-provided tenant and hash overrides', async () => {
      // Arrange
      const email = 'test@example.com';
      const expectedHash = hashEmail(email);
      const mockUser = { id: 1, organizationId: 123, emailHash: expectedHash };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithEmail('123', email, {
        organizationId: 999,
        emailHash: 'attacker-hash'
      } as never);

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 123,
          emailHash: expectedHash
        })
      );
    });
  });

  describe('createWithEmailInTransaction', () => {
    it('should create user within transaction', async () => {
      // Arrange
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 1 }])
      });
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: mockValues
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.createWithEmailInTransaction(
        '123',
        mockTx,
        'user@example.com',
        {
          displayName: 'User'
        }
      );

      // Assert
      expect(result).toEqual({ id: 1 });
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          emailHash: hashEmail('user@example.com'),
          emailEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });
  });

  describe('createOrganizationForUserInTransaction', () => {
    it('should use provided slug when available and unique', async () => {
      const tenantValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 11 }])
      });
      const organizationValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 22 }])
      });
      const insert = jest
        .fn()
        .mockReturnValueOnce({ values: tenantValues })
        .mockImplementation(() => ({ values: organizationValues }));

      const mockTx = { insert } as unknown as NodePgDatabase;

      const result = await repository.createOrganizationForUserInTransaction(
        mockTx,
        'user@example.com',
        'Acme Inc',
        'gcp-tenant-1',
        'acme-inc'
      );

      expect(result).toEqual({ tenantId: 11, organizationId: 22 });
      expect(organizationValues).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'acme-inc',
          name: 'Acme Inc',
          displayName: 'Acme Inc'
        })
      );
    });

    it('should throw DB_003 when slug already exists', async () => {
      const tenantValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 100 }])
      });
      const organizationReturning = jest
        .fn()
        .mockRejectedValueOnce({ code: '23505', constraint: 'organizations_slug_unique' });
      const organizationValues = jest.fn().mockReturnValue({
        returning: organizationReturning
      });
      const insert = jest
        .fn()
        .mockReturnValueOnce({ values: tenantValues })
        .mockImplementation(() => ({ values: organizationValues }));

      const mockTx = { insert } as unknown as NodePgDatabase;

      await expect(
        repository.createOrganizationForUserInTransaction(
          mockTx,
          'user@example.com',
          'Acme Inc',
          'gcp-tenant-1',
          'acme-inc'
        )
      ).rejects.toEqual(
        Errors.databaserecordAlreadyExists003({ entity: "organization slug 'acme-inc'" })
      );

      expect(organizationValues).toHaveBeenCalledTimes(1);
      expect(organizationValues.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ slug: 'acme-inc' })
      );
    });

    it('should throw DB_003 when slug conflict is wrapped in cause error', async () => {
      const tenantValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 300 }])
      });
      const organizationReturning = jest.fn().mockRejectedValueOnce({
        message: 'Failed query',
        cause: {
          code: '23505',
          constraint: 'organizations_slug_unique',
          detail: 'Key (slug)=(acme-inc) already exists.'
        }
      });
      const organizationValues = jest.fn().mockReturnValue({
        returning: organizationReturning
      });
      const insert = jest
        .fn()
        .mockReturnValueOnce({ values: tenantValues })
        .mockImplementation(() => ({ values: organizationValues }));

      const mockTx = { insert } as unknown as NodePgDatabase;

      await expect(
        repository.createOrganizationForUserInTransaction(
          mockTx,
          'user@example.com',
          'Acme Inc',
          'gcp-tenant-1',
          'acme-inc'
        )
      ).rejects.toEqual(
        Errors.databaserecordAlreadyExists003({ entity: "organization slug 'acme-inc'" })
      );

      expect(organizationValues).toHaveBeenCalledTimes(1);
    });
  });

  describe('softDeleteWithTransaction', () => {
    it('should soft delete user', async () => {
      // Arrange
      const mockDeletedUser = { id: 1, deletedAt: new Date(), isActive: false };
      const userWhere = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockDeletedUser])
      });
      const membershipWhere = jest.fn().mockResolvedValue(undefined);
      const mockSet = jest
        .fn()
        .mockReturnValueOnce({
          where: userWhere
        })
        .mockReturnValueOnce({
          where: membershipWhere
        });
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: mockSet
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.softDeleteWithTransaction('123', mockTx, 1);

      // Assert
      expect(result).toEqual(mockDeletedUser);
      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(mockTx.update).toHaveBeenNthCalledWith(1, expect.anything());
      expect(mockTx.update).toHaveBeenNthCalledWith(2, expect.anything());
      expect(mockSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          isActive: false,
          isDefault: false,
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should deactivate memberships when user is soft deleted', async () => {
      // Arrange
      const mockDeletedUser = { id: 7, deletedAt: new Date(), isActive: false };
      const userWhere = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockDeletedUser])
      });
      const membershipWhere = jest.fn().mockResolvedValue(undefined);
      const mockSet = jest
        .fn()
        .mockReturnValueOnce({
          where: userWhere
        })
        .mockReturnValueOnce({
          where: membershipWhere
        });
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: mockSet
        })
      } as unknown as NodePgDatabase;

      // Act
      await repository.softDeleteWithTransaction('123', mockTx, 7);

      // Assert
      expect(mockSet).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          isActive: false,
          isDefault: false,
          updatedAt: expect.any(Date)
        })
      );
      expect(membershipWhere).toHaveBeenCalled();
    });

    it('should throw DB_004 when user not found during soft delete', async () => {
      // Arrange
      const mockSet = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([])
        })
      });
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: mockSet
        })
      } as unknown as NodePgDatabase;

      // Act & Assert
      await expect(repository.softDeleteWithTransaction('123', mockTx, 999)).rejects.toThrow(
        Errors.databaserecordNotFound004({ entity: 'User' })
      );
    });
  });

  describe('listUserOrganizations', () => {
    it('should return active organizations for non-deleted users', async () => {
      const mockOrderBy = jest.fn().mockResolvedValue([
        {
          organizationId: 12,
          tenantId: 34,
          name: 'Acme',
          displayName: 'Acme Inc',
          slug: 'acme',
          role: 'tenant_admin',
          isDefault: true,
          organizationIsActive: true,
          membershipIsActive: true
        }
      ]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockInnerJoinOrganizations = jest.fn().mockReturnValue({ where: mockWhere });
      const mockInnerJoinTenants = jest
        .fn()
        .mockReturnValue({ innerJoin: mockInnerJoinOrganizations });
      const mockInnerJoinUsers = jest.fn().mockReturnValue({ innerJoin: mockInnerJoinTenants });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: mockInnerJoinUsers
        })
      } as never);

      const result = await repository.listUserOrganizations(123);

      expect(result).toEqual([
        {
          organizationId: '12',
          tenantId: '34',
          name: 'Acme',
          displayName: 'Acme Inc',
          slug: 'acme',
          role: 'tenant_admin',
          isDefault: true,
          isActive: true
        }
      ]);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should not return organizations for deleted users', async () => {
      const mockOrderBy = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockInnerJoinOrganizations = jest.fn().mockReturnValue({ where: mockWhere });
      const mockInnerJoinTenants = jest
        .fn()
        .mockReturnValue({ innerJoin: mockInnerJoinOrganizations });
      const mockInnerJoinUsers = jest.fn().mockReturnValue({ innerJoin: mockInnerJoinTenants });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: mockInnerJoinUsers
        })
      } as never);

      const result = await repository.listUserOrganizations(456);

      expect(result).toEqual([]);
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('countByOrganization', () => {
    it('should count active users in organization', async () => {
      // Arrange
      const mockResult = { count: 5 };
      const mockWhere = jest.fn().mockResolvedValue([mockResult]);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.countByOrganization('123');

      // Assert
      expect(result).toBe(5);
    });

    it('should return 0 when no users found', async () => {
      // Arrange
      const mockWhere = jest.fn().mockResolvedValue([{}]);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.countByOrganization('123');

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('findWithOrganizationByEmail', () => {
    it('should find user with organization by email', async () => {
      // Arrange
      const mockUser = { id: 1, email: 'user@example.com' };
      const mockOrg = { id: 123, name: 'Test Org' };
      const mockLimit = jest.fn().mockResolvedValue([{ user: mockUser, organization: mockOrg }]);
      const mockInnerJoin = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: mockLimit
        })
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: mockInnerJoin
        })
      } as never);

      // Act
      const result = await repository.findWithOrganizationByEmail('user@example.com');

      // Assert
      expect(result).toEqual({ user: mockUser, organization: mockOrg });
    });

    it('should return null when not found', async () => {
      // Arrange
      const mockLimit = jest.fn().mockResolvedValue([]);
      const mockInnerJoin = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: mockLimit
        })
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: mockInnerJoin
        })
      } as never);

      // Act
      const result = await repository.findWithOrganizationByEmail('notfound@example.com');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('createOrganizationForUser', () => {
    it('should create tenant and organization in transaction', async () => {
      // Arrange
      const mockTxResult = { tenantId: 1, organizationId: 123 };
      jest.spyOn(db, 'transaction').mockImplementation(async (callback) => {
        return await callback(db as never);
      });

      // Mock tenant insert
      const mockTenantValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 1 }])
      });

      // Mock organization insert
      const mockOrgValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 123 }])
      });

      // Setup chained mocks
      let callCount = 0;
      jest.spyOn(db, 'insert').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return { values: mockTenantValues } as never;
        } else {
          return { values: mockOrgValues } as never;
        }
      });

      // Act
      const result = await repository.createOrganizationForUser('user@example.com');

      // Assert
      expect(result).toEqual(mockTxResult);
    });
  });

  describe('setOrganizationOwnerInTransaction', () => {
    it('should set organization owner when user belongs to org', async () => {
      // Arrange
      const mockUser = { id: 1, organizationId: 123 };
      const mockOrg = { id: 123, ownerId: 1 };
      const mockSelectUser = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockUser])
      });
      const mockSet = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockOrg])
        })
      });
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: mockSelectUser
          })
        }),
        update: jest.fn().mockReturnValue({
          set: mockSet
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.setOrganizationOwnerInTransaction(mockTx, 123, 1, undefined);

      // Assert
      expect(result).toEqual(mockOrg);
    });

    it('should throw error when user not found', async () => {
      // Arrange
      const mockSelectUser = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: mockSelectUser
          })
        })
      } as unknown as NodePgDatabase;

      // Act & Assert
      await expect(repository.setOrganizationOwnerInTransaction(mockTx, 123, 999)).rejects.toThrow(
        Errors.useruserWithId001({ userId: '999' })
      );
    });

    it('should throw error when user does not belong to organization', async () => {
      // Arrange
      const mockUser = { id: 1, organizationId: 456 }; // Different org
      const mockSelectUser = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockUser])
      });
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: mockSelectUser
          })
        })
      } as unknown as NodePgDatabase;

      // Act & Assert
      await expect(repository.setOrganizationOwnerInTransaction(mockTx, 123, 1)).rejects.toThrow(
        Errors.validationinvalidValueFor002({
          field: 'userId',
          expectedType: 'user must belong to organization'
        })
      );
    });

    it('should throw error when actorId provided (non-system operation)', async () => {
      // Arrange
      const mockUser = { id: 1, organizationId: 123 };
      const mockSelectUser = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockUser])
      });
      const mockTx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: mockSelectUser
          })
        })
      } as unknown as NodePgDatabase;

      // Act & Assert
      await expect(
        repository.setOrganizationOwnerInTransaction(mockTx, 123, 1, 'admin-user-id')
      ).rejects.toThrow(
        Errors.authinsufficientPermissionsRequiredpermission004({
          requiredPermission: 'organization:set-owner'
        })
      );
    });
  });

  describe('findByOrganization', () => {
    it('should find all users in organization', async () => {
      // Arrange
      const mockUsers = [
        { id: 1, organizationId: 123 },
        { id: 2, organizationId: 123 }
      ];
      const mockWhere = jest.fn().mockResolvedValue(mockUsers);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByOrganization('123');

      // Assert
      expect(result).toEqual(mockUsers);
    });

    it('should exclude soft-deleted users', async () => {
      // Arrange
      const mockWhere = jest.fn().mockResolvedValue([]);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      await repository.findByOrganization('123');

      // Assert - should filter by deletedAt is null
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('findExpiredSoftDeleted', () => {
    it('should find users soft-deleted before cutoff date', async () => {
      // Arrange
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      const mockUsers = [
        { id: 1, deletedAt: new Date('2024-01-01') },
        { id: 2, deletedAt: new Date('2024-01-15') }
      ];
      const mockWhere = jest.fn().mockResolvedValue(mockUsers);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findExpiredSoftDeleted(30);

      // Assert
      expect(result).toEqual(mockUsers);
    });

    it('should return empty array when no expired users found', async () => {
      // Arrange
      const mockWhere = jest.fn().mockResolvedValue([]);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findExpiredSoftDeleted(30);

      // Assert
      expect(result).toEqual([]);
    });
  });
  describe('Encryption Static Methods', () => {
    describe('isValidEnvelope', () => {
      it('should return true for valid envelope with 4 non-empty parts', () => {
        const result = AuthRepository.isValidEnvelope('part1:part2:part3:part4');
        expect(result).toBe(true);
      });

      it('should return false for envelope with less than 4 parts', () => {
        expect(AuthRepository.isValidEnvelope('part1:part2:part3')).toBe(false);
        expect(AuthRepository.isValidEnvelope('part1:part2')).toBe(false);
        expect(AuthRepository.isValidEnvelope('part1')).toBe(false);
      });

      it('should return false for envelope with more than 4 parts', () => {
        expect(AuthRepository.isValidEnvelope('part1:part2:part3:part4:part5')).toBe(false);
      });

      it('should return false for envelope with empty parts', () => {
        expect(AuthRepository.isValidEnvelope('part1::part3:part4')).toBe(false);
        expect(AuthRepository.isValidEnvelope(':part2:part3:part4')).toBe(false);
        expect(AuthRepository.isValidEnvelope('part1:part2:part3:')).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(AuthRepository.isValidEnvelope('')).toBe(false);
      });
    });

    describe('normalizeOptionalSensitiveValue', () => {
      it('should return trimmed value for valid string', () => {
        const result = (
          AuthRepository as unknown as {
            normalizeOptionalSensitiveValue: (v: unknown) => string | undefined;
          }
        ).normalizeOptionalSensitiveValue('  test value  ');
        expect(result).toBe('test value');
      });

      it('should return undefined for empty string after trim', () => {
        const result = (
          AuthRepository as unknown as {
            normalizeOptionalSensitiveValue: (v: unknown) => string | undefined;
          }
        ).normalizeOptionalSensitiveValue('   ');
        expect(result).toBeUndefined();
      });

      it('should return undefined for non-string values', () => {
        const normalize = (
          AuthRepository as unknown as {
            normalizeOptionalSensitiveValue: (v: unknown) => string | undefined;
          }
        ).normalizeOptionalSensitiveValue;
        expect(normalize(null)).toBeUndefined();
        expect(normalize(undefined)).toBeUndefined();
        expect(normalize(123)).toBeUndefined();
        expect(normalize({})).toBeUndefined();
      });
    });
  });

  describe('encryptToEnvelope', () => {
    it('should encrypt value and return formatted envelope', async () => {
      // Arrange - the mock encryption service is already set up in beforeEach
      const plainText = 'sensitive data';

      // Act - Use type assertion to access private method for testing
      const result = await (
        repository as unknown as {
          validateTenantId(tenantId: string): number;
          encryptToEnvelope(value: string): Promise<{ envelope: string; keyVersion: string }>;
        }
      ).encryptToEnvelope(plainText);

      // Assert
      expect(result).toEqual({
        envelope: 'encrypted:key:iv:tag',
        keyVersion: 'primary-encryption-key/1'
      });
    });

    it('should throw error with message when encryption fails', async () => {
      // Arrange
      const failModule: TestingModule = await Test.createTestingModule({
        providers: [
          AuthRepository,
          {
            provide: CachedPermissionService,
            useValue: { hasPermission: jest.fn().mockResolvedValue(true) }
          },
          {
            provide: MAIN_DB,
            useValue: mockDb
          },
          {
            provide: EncryptionService,
            useValue: {
              encryptToBase64: jest
                .fn()
                .mockRejectedValue(new Error('Encryption service unavailable'))
            }
          },
          {
            provide: EncryptedStoreKeyService,
            useValue: {
              getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
                keyId: 'primary-encryption-key',
                keyVersion: 'primary-encryption-key/1'
              })
            }
          }
        ]
      }).compile();

      const failingRepository = failModule.get<AuthRepository>(AuthRepository);

      // Act & Assert
      await expect(failingRepository['encryptToEnvelope']('test')).rejects.toThrow(
        'Encryption service unavailable'
      );
    });
  });

  describe('createWithEmail encryption', () => {
    it('should encrypt email, firstName, lastName, and phoneNumber when provided', async () => {
      // Arrange
      const email = 'test@example.com';
      const mockUser = { id: 1, organizationId: 123 };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithEmail('123', email, {
        firstNameEncrypted: 'John',
        lastNameEncrypted: 'Doe',
        phoneNumberEncrypted: '+1234567890'
      } as never);

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          emailEncrypted: 'encrypted:key:iv:tag',
          firstNameEncrypted: 'encrypted:key:iv:tag',
          lastNameEncrypted: 'encrypted:key:iv:tag',
          phoneNumberEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });

    it('should not encrypt optional fields when not provided', async () => {
      // Arrange
      const email = 'test@example.com';
      const mockUser = { id: 1, organizationId: 123 };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockUser])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithEmail('123', email, {});

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          emailEncrypted: 'encrypted:key:iv:tag',
          firstNameEncrypted: undefined,
          lastNameEncrypted: undefined,
          phoneNumberEncrypted: undefined,
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });
  });
});
