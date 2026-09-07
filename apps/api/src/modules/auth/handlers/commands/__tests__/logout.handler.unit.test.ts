/**
 * Unit Tests for LogoutHandler
 *
 * Tests user logout and token invalidation using transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { LogoutCommand } from '../../../commands/logout.command';
import { AuthService } from '../../../services/auth.service';
import { LogoutHandler } from '../logout.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('LogoutHandler', () => {
  let handler: LogoutHandler;
  let authService: jest.Mocked<AuthService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    const mockAuthService = {
      logout: jest.fn()
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
        LogoutHandler,
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

    handler = module.get<LogoutHandler>(LogoutHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
    db = module.get(MAIN_DB);
  });

  describe('logout', () => {
    it('should logout user with refresh token', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        userId: 123,
        refreshToken: 'refresh-token-123',
        actorId: '123',
        accessToken: 'access-token-123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        'refresh-token-123',
        'access-token-123'
      );

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should logout user without access token', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '456',
        userId: 456,
        refreshToken: 'refresh-token-456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(
        456,
        'primary-encryption-key',
        'refresh-token-456',
        undefined
      );

      expect(result).toEqual({ success: true });
    });

    it('should handle different tenantIds', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'custom-tenant-789',
        actorId: '789',
        userId: 789,
        refreshToken: 'refresh-token-789'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(
        789,
        'custom-tenant-789',
        'refresh-token-789',
        undefined
      );
    });
  });

  describe('outbox event publishing', () => {
    beforeEach(() => {
      // Enable events for these tests
      process.env['EVENTS_ENABLED'] = 'true';
    });

    afterEach(() => {
      // Reset to default
      delete process.env['EVENTS_ENABLED'];
    });

    it('should save event to outbox after logout', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        refreshToken: 'refresh-token-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'user.loggedout',
          aggregateId: '123'
        })
      );
    });

    it('should generate session ID from user ID', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '456',
        userId: 456,
        refreshToken: 'refresh-token-456'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          aggregateId: '456'
        })
      );
    });

    it('should include tenantId in event', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'custom-tenant-999',
        actorId: '999',
        userId: 999,
        refreshToken: 'refresh-token-999'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'user.loggedout',
          tenantId: 'custom-tenant-999'
        })
      );
    });
  });

  describe('token handling', () => {
    it('should pass refresh token to service', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        refreshToken: 'valid-refresh-token',
        accessToken: 'valid-access-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(
        123,
        'primary-encryption-key',
        'valid-refresh-token',
        'valid-access-token'
      );
    });

    it('should handle empty refresh token', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        userId: 123,
        refreshToken: '',
        actorId: '123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(123, 'primary-encryption-key', '', undefined);
    });
  });

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      // Arrange
      authService.logout.mockRejectedValue(new Error('Token invalidation failed'));

      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        refreshToken: 'invalid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Token invalidation failed');
    });

    it('should not publish event on service failure', async () => {
      // Arrange
      authService.logout.mockRejectedValue(new Error('Logout failed'));

      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        refreshToken: 'refresh-token-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should handle invalid token errors', async () => {
      // Arrange
      authService.logout.mockRejectedValue(new Error('Invalid token'));

      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '123',
        userId: 123,
        refreshToken: 'malformed-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Invalid token');
    });
  });

  describe('user ID handling', () => {
    it('should handle numeric user IDs', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '1',
        userId: 1,
        refreshToken: 'refresh-token-1'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(
        1,
        'primary-encryption-key',
        'refresh-token-1',
        undefined
      );

      expect(result).toEqual({ success: true });
    });

    it('should handle large user IDs', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        actorId: '999999',
        userId: 999999,
        refreshToken: 'refresh-token-999999'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith(
        999999,
        'primary-encryption-key',
        'refresh-token-999999',
        undefined
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe('input validation', () => {
    it('should throw error when userId is invalid', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: 'primary-encryption-key',
        userId: 0, // Invalid
        actorId: '123',
        refreshToken: 'refresh-token-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when tenantId is missing', async () => {
      // Arrange
      const command = new LogoutCommand({
        tenantId: '',
        userId: 123,
        actorId: '123',
        refreshToken: 'refresh-token-123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });
  });
});
