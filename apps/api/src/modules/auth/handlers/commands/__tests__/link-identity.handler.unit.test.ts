/**
 * Unit Tests for LinkIdentityHandler
 *
 * Tests linking identity providers to users using transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { IdentityProvider } from '@package/db-core';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { LinkIdentityCommand } from '../../../commands/link-identity.command';
import { AuthService } from '../../../services/auth.service';
import { LinkIdentityHandler } from '../link-identity.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('LinkIdentityHandler', () => {
  let handler: LinkIdentityHandler;
  let authService: jest.Mocked<AuthService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    const mockAuthService = {
      linkIdentity: jest.fn()
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
        LinkIdentityHandler,
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

    handler = module.get<LinkIdentityHandler>(LinkIdentityHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
    db = module.get(MAIN_DB);
  });

  describe('linking identity', () => {
    it('should link Google identity to user', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        displayName: 'Google User',
        photoUrl: 'https://example.com/photo.jpg'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.GOOGLE,
        'google-uid-123',
        {
          provider: IdentityProvider.GOOGLE,
          providerUid: 'google-uid-123',
          displayName: 'Google User',
          photoUrl: 'https://example.com/photo.jpg'
        }
      );

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should link Apple identity to user', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.APPLE,
        providerUid: 'apple-uid-456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.APPLE,
        'apple-uid-456',
        {
          provider: IdentityProvider.APPLE,
          providerUid: 'apple-uid-456',
          displayName: undefined,
          photoUrl: undefined
        }
      );

      expect(result).toEqual({ success: true });
    });

    it('should link Microsoft identity to user', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.MICROSOFT,
        providerUid: 'microsoft-uid-789',
        displayName: 'Microsoft User'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.MICROSOFT,
        'microsoft-uid-789',
        expect.objectContaining({
          provider: IdentityProvider.MICROSOFT,
          providerUid: 'microsoft-uid-789',
          displayName: 'Microsoft User'
        })
      );
    });
  });

  describe('outbox event publishing', () => {
    it('should save event to outbox after linking', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalled();
    });

    it('should include all provider types in event', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '456',
        userId: 456,
        provider: IdentityProvider.GITHUB,
        providerUid: 'github-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'identity.linked',
          aggregateId: '456'
        })
      );
    });
  });

  describe('optional parameters', () => {
    it('should work without displayName', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.GOOGLE,
        'google-uid-123',
        {
          provider: IdentityProvider.GOOGLE,
          providerUid: 'google-uid-123'
        }
      );
    });

    it('should work without photoUrl', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        displayName: 'Google User'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.GOOGLE,
        'google-uid-123',
        {
          provider: IdentityProvider.GOOGLE,
          providerUid: 'google-uid-123',
          displayName: 'Google User'
        }
      );
    });

    it('should work with only required parameters', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: 'email-123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      // Arrange
      authService.linkIdentity.mockRejectedValue(new Error('Identity already linked'));

      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Identity already linked');
    });

    it('should not publish event on service failure', async () => {
      // Arrange
      authService.linkIdentity.mockRejectedValue(new Error('Link failed'));

      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
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
    it('should support Facebook provider', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.FACEBOOK,
        providerUid: 'facebook-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.FACEBOOK,
        'facebook-uid-123',
        expect.any(Object)
      );
    });

    it('should support LinkedIn provider', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.LINKEDIN,
        providerUid: 'linkedin-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.LINKEDIN,
        'linkedin-uid-123',
        expect.any(Object)
      );
    });

    it('should support email_password provider', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: 'email-uid-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.linkIdentity).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        IdentityProvider.EMAIL_PASSWORD,
        'email-uid-123',
        expect.any(Object)
      );
    });
  });

  describe('input validation', () => {
    it('should throw error when userId is missing', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 0, // Invalid
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when tenantId is missing', async () => {
      // Arrange
      const command = new LinkIdentityCommand({
        tenantId: '',
        actorId: '123',
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });
  });
});
