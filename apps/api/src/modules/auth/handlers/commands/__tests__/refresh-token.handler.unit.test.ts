/**
 * Unit Tests for RefreshTokenHandler
 *
 * Tests token refresh operations with transactional outbox pattern.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { RefreshTokenCommand } from '../../../commands/refresh-token.command';
import { AuthSessionStoreService } from '../../../services/auth-session-store.service';
import { AuthService } from '../../../services/auth.service';
import { RefreshTokenHandler } from '../refresh-token.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  let authService: jest.Mocked<AuthService>;
  let authSessionStore: { getRefreshTokenInfo: jest.Mock };
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockAuthResult = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    idToken: 'new-id-token',
    expiresIn: 3600,
    refreshExpiresIn: 86400,
    user: {
      userId: '123',
      tenantId: 'primary-encryption-key',
      email: 'user@example.com'
    }
  };

  beforeEach(async () => {
    dbTransaction = {} as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockAuthService = {
      refreshToken: jest.fn()
    };
    authSessionStore = {
      getRefreshTokenInfo: jest.fn().mockResolvedValue({
        sessionId: '11111111-1111-4111-8111-111111111111'
      })
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        {
          provide: AuthService,
          useValue: mockAuthService
        },
        {
          provide: AuthSessionStoreService,
          useValue: authSessionStore
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
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<RefreshTokenHandler>(RefreshTokenHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
  });

  describe('validation', () => {
    it('should throw VAL_001 if refreshToken is missing', async () => {
      // Arrange
      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: ''
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_001'
      });
    });

    it('should throw VAL_001 if refreshToken is undefined', async () => {
      // Arrange
      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: undefined as unknown as string
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_001'
      });
    });

    it('should throw AUTH_003 if userId is not a valid integer', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue({
        ...mockAuthResult,
        user: { ...mockAuthResult.user, userId: 'invalid' }
      });

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_003'
      });
    });

    it('should throw AUTH_003 if userId is zero or negative', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue({
        ...mockAuthResult,
        user: { ...mockAuthResult.user, userId: '0' }
      });

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_003'
      });
    });
  });

  describe('token refresh', () => {
    it('should refresh token successfully', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-refresh-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.refreshToken).toHaveBeenCalledWith(
        'primary-encryption-key',
        'valid-refresh-token'
      );
      expect(authSessionStore.getRefreshTokenInfo).toHaveBeenCalledWith(
        'new-refresh-token',
        'primary-encryption-key'
      );

      expect(result).toEqual({
        ...mockAuthResult,
        isNewUser: false
      });
    });

    it('should return new tokens', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'old-refresh-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.idToken).toBe('new-id-token');
    });

    it('should mark isNewUser as false', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isNewUser).toBe(false);
    });
  });

  describe('tenant handling', () => {
    it('should work without tenantId for public auth routes', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: '',
        refreshToken: 'valid-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.refreshToken).toHaveBeenCalledWith('', 'valid-token');
      expect(result).toBeDefined();
    });

    it('should extract tenantId from token when not provided', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: '',
        refreshToken: 'token-with-embedded-tenant'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.refreshToken).toHaveBeenCalledWith('', 'token-with-embedded-tenant');
      expect(result).toBeDefined();
    });
  });

  describe('transaction handling', () => {
    it('should execute operations within transaction', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should save event to outbox within transaction', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token',
        ipAddress: '192.168.1.1',
        correlationId: 'corr-123',
        causationId: 'caus-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'token.refreshed',
          aggregateId: '123',
          tenantId: 'primary-encryption-key',
          payload: expect.objectContaining({
            tenantId: 'primary-encryption-key',
            userId: '123',
            ipAddress: '192.168.1.1',
            sessionId: expect.any(String)
          }),
          correlationId: 'corr-123',
          causationId: 'caus-123'
        })
      );
    });

    it('should include sessionId in event payload', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls[0];
      const payload = outboxCall?.[1]?.payload as { sessionId?: string };

      expect(payload.sessionId).toBeDefined();
      expect(payload.sessionId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should include timestamp in event payload', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls[0];
      const payload = outboxCall?.[1]?.payload as { timestamp?: string };

      expect(payload.timestamp).toBeDefined();
      expect(payload.timestamp).not.toBeNull();
      const timestamp = new Date(payload.timestamp as string | number);
      expect(timestamp).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('should propagate refresh errors', async () => {
      // Arrange
      authService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'invalid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Invalid refresh token');
    });

    it('should roll back transaction on error', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);
      outboxRepo.insert.mockRejectedValue(new Error('Database error'));

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Database error');
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should handle expired tokens', async () => {
      // Arrange
      authService.refreshToken.mockRejectedValue(new Error('Token expired'));

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'expired-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Token expired');
    });
  });

  describe('optional parameters', () => {
    it('should work without ipAddress', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls[0];
      const payload = outboxCall?.[1]?.payload;

      expect((payload as { ipAddress?: string }).ipAddress).toBeUndefined();
    });

    it('should work without correlationId', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls[0];
      const eventData = outboxCall?.[1];

      expect(eventData?.correlationId).toBeUndefined();
    });

    it('should work without causationId', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResult);

      const command = new RefreshTokenCommand({
        tenantId: 'primary-encryption-key',
        refreshToken: 'valid-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls[0];
      const eventData = outboxCall?.[1];

      expect(eventData?.causationId).toBeUndefined();
    });
  });
});
