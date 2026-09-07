/**
 * Unit tests for InvitationRepository
 */

import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EncryptionService } from '@package/encryption';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { EncryptedStoreKeyService } from '../../../encrypted-store/encrypted-store-key.service';
import { InvitationRepository } from '../invitation.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('InvitationRepository', () => {
  let repository: InvitationRepository;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      transaction: jest.fn().mockImplementation(async (callback) => callback(db))
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockEncryptionService = {
      encryptToBase64: jest.fn().mockResolvedValue({
        ciphertext: 'encrypted',
        encryptedDataKey: 'key',
        iv: 'iv',
        authTag: 'tag'
      }),
      decryptFromBase64: jest.fn().mockResolvedValue('decrypted@example.com')
    };

    const mockEncryptedStoreKeyService = {
      getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
        keyId: 'primary-encryption-key',
        keyVersion: 'primary-encryption-key/1'
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationRepository,
        {
          provide: MAIN_DB,
          useValue: db
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JWT_SECRET') {
                return 'test-jwt-secret-key-at-least-32-characters';
              }
              return undefined;
            })
          }
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService
        },
        {
          provide: EncryptedStoreKeyService,
          useValue: mockEncryptedStoreKeyService
        }
      ]
    }).compile();

    repository = module.get<InvitationRepository>(InvitationRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createInvitation', () => {
    it('should create invitation with tokenHash/emailHash/emailEncrypted', async () => {
      const invitationRow = {
        id: 10,
        organizationId: 1,
        emailHash: 'placeholder',
        emailEncrypted: 'newuser@example.com',
        tokenHash: 'placeholder',
        status: 'pending',
        role: 'tenant_user',
        invitedByUserId: 5,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      };
      const persistedInvitationRow = {
        ...invitationRow,
        tokenHash: 'persisted-token-hash'
      };

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([invitationRow])
        })
      });
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([persistedInvitationRow])
          })
        })
      });

      const result = await repository.createInvitation({
        organizationId: 1,
        email: 'NewUser@Example.com',
        invitedByUserId: 5,
        role: 'tenant_user'
      });

      expect(result.invitation).toEqual(persistedInvitationRow);
      expect(result.invitationToken).toBeDefined();

      const valuesCall = (db.insert as jest.Mock).mock.results[0]?.value.values as jest.Mock;
      const payload = valuesCall.mock.calls[0]?.[0] as {
        emailHash: string;
        emailEncrypted: string;
        tokenHash: string;
        encryptionKeyVersion: string;
      };

      expect(payload.emailHash).toBe(hashEmail('newuser@example.com'));
      // emailEncrypted is now in encrypted format: ciphertext:key:iv:tag
      expect(payload.emailEncrypted).toBe('encrypted:key:iv:tag');
      expect(payload.tokenHash).toBeDefined();
      expect(payload.encryptionKeyVersion).toBe('primary-encryption-key/1');

      const updateSetCall = (db.update as jest.Mock).mock.results[0]?.value.set as jest.Mock;
      const updatePayload = updateSetCall.mock.calls[0]?.[0] as { tokenHash: string };
      expect(updatePayload.tokenHash).toBe(
        createHash('sha256').update(result.invitationToken).digest('hex')
      );
    });
  });

  describe('findPendingByTokenHash', () => {
    it('should return pending invitation for matching tenant scope', async () => {
      const invitation = {
        id: 11,
        organizationId: 1,
        status: 'pending'
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([invitation])
          })
        })
      });

      const result = await repository.findPendingByTokenHash(1, 'token-hash');

      expect(result).toEqual(invitation);
    });

    it('should return null for cross-tenant/non-existing lookup', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      const result = await repository.findPendingByTokenHash(2, 'token-hash');

      expect(result).toBeNull();
    });
  });

  describe('markAsAccepted', () => {
    it('should update pending invitation to accepted', async () => {
      const acceptedInvitation = {
        id: 12,
        organizationId: 1,
        status: 'accepted',
        acceptedAt: new Date()
      };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([acceptedInvitation])
          })
        })
      });

      const result = await repository.markAsAccepted(1, 12);

      expect(result).toEqual(acceptedInvitation);
      expect(db.update).toHaveBeenCalled();
    });

    it('should return null when invitation is outside tenant scope or not pending', async () => {
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      const result = await repository.markAsAccepted(999, 12);

      expect(result).toBeNull();
    });
  });

  describe('rotatePendingToken', () => {
    it('should rotate token hash for pending invitation and return raw token', async () => {
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 33 }])
          })
        })
      });

      const rawToken = await repository.rotatePendingToken(1, 33);

      expect(rawToken).toBeDefined();
      expect(typeof rawToken).toBe('string');

      const setCall = (db.update as jest.Mock).mock.results[0]?.value.set as jest.Mock;
      const updatePayload = setCall.mock.calls[0]?.[0] as { tokenHash: string };
      expect(updatePayload.tokenHash).toBe(
        createHash('sha256')
          .update(rawToken as string)
          .digest('hex')
      );
    });

    it('should derive the current invitation token from persisted invitation state', () => {
      const token = repository.getCurrentInvitationToken({
        id: 33,
        organizationId: 1,
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      } as never);

      expect(token).toHaveLength(64);
      expect(token).toBe(
        repository.getCurrentInvitationToken({
          id: 33,
          organizationId: 1,
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        } as never)
      );
    });

    it('should return null when invitation is not pending or missing', async () => {
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      const rawToken = await repository.rotatePendingToken(99, 404);
      expect(rawToken).toBeNull();
    });
  });
});
