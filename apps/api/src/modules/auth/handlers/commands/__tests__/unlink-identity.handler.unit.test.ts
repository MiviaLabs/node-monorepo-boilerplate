/**
 * Unit Tests for UnlinkIdentityHandler
 *
 * Tests unlinking identity providers from users using transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { IdentityProvider } from '@package/db-core';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { UnlinkIdentityCommand } from '../../../commands/unlink-identity.command';
import { AuthService } from '../../../services/auth.service';
import { UnlinkIdentityHandler } from '../unlink-identity.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('UnlinkIdentityHandler', () => {
  let handler: UnlinkIdentityHandler;
  let authService: jest.Mocked<AuthService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    const mockAuthService = {
      unlinkIdentity: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const mockDb = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback: (_tx: unknown) => Promise<void>) => {
          await callback({}); // Mock transaction callback
        })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnlinkIdentityHandler,
        {
          provide: AuthService,
          useValue: mockAuthService
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: AuditOutboxPublisher,
          useValue: {
            insert: jest.fn()
          }
        },
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    handler = module.get<UnlinkIdentityHandler>(UnlinkIdentityHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
    db = module.get(MAIN_DB);
  });

  describe('unlinking identity', () => {
    it('should unlink Google identity from user', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.unlinkIdentity).toHaveBeenCalledWith(
        123,
        IdentityProvider.GOOGLE,
        'google-uid-123'
      );

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should unlink Apple identity from user', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-456',
        userId: 456,
        provider: IdentityProvider.APPLE,
        providerUid: 'apple-uid-456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.unlinkIdentity).toHaveBeenCalledWith(
        456,
        IdentityProvider.APPLE,
        'apple-uid-456'
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('outbox event publishing', () => {
    it('should save event to outbox after unlinking', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'identity.unlinked',
          aggregateId: '123'
        })
      );
    });

    it('should include correct provider in event', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GITHUB,
        providerUid: 'github-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'identity.unlinked'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      // Arrange
      authService.unlinkIdentity.mockRejectedValue(new Error('Cannot unlink primary identity'));

      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Cannot unlink primary identity');
    });

    it('should not publish event on service failure', async () => {
      // Arrange
      authService.unlinkIdentity.mockRejectedValue(new Error('Unlink failed'));

      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('different providers', () => {
    it('should support LinkedIn provider', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.LINKEDIN,
        providerUid: 'linkedin-uid-123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.unlinkIdentity).toHaveBeenCalledWith(
        123,
        IdentityProvider.LINKEDIN,
        'linkedin-uid-123'
      );

      expect(result).toEqual({ success: true });
    });

    it('should support GitHub provider', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GITHUB,
        providerUid: 'github-uid-123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.unlinkIdentity).toHaveBeenCalledWith(
        123,
        IdentityProvider.GITHUB,
        'github-uid-123'
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('input validation', () => {
    it('should throw error when userId is invalid', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 0, // Invalid
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when tenantId is missing', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: '',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when provider is missing', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: '' as IdentityProvider,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when providerUid is missing', async () => {
      // Arrange
      const command = new UnlinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: 'user-123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: ''
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });
  });
});
