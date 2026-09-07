/**
 * Unit Tests for LoginHandler
 *
 * Tests email/password authentication with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { LoginCommand } from '../../../commands/login.command';
import { AuthSessionStoreService } from '../../../services/auth-session-store.service';
import { AuthService } from '../../../services/auth.service';
import { LoginHandler } from '../login.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('LoginHandler', () => {
  let handler: LoginHandler;
  let authService: jest.Mocked<AuthService>;
  let authSessionStore: { createSession: jest.Mock };
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockAuthResult = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idToken: 'id-token',
    expiresIn: 3600,
    refreshExpiresIn: 86400
  };

  const mockUserInfo = {
    username: 'user@example.com',
    email: 'user@example.com',
    emailVerified: undefined,
    roles: [],
    permissions: [],
    tenantId: 'primary-encryption-key',
    userId: '123'
  };

  const mockUser = {
    id: 123,
    organizationId: 123,
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

  beforeEach(async () => {
    dbTransaction = {
      transaction: jest.fn()
    } as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockAuthService = {
      authenticateWithEmailPassword: jest.fn(),
      updateUserLastSignInWithTransaction: jest.fn()
    };
    authSessionStore = {
      createSession: jest.fn().mockResolvedValue({ sessionId: 'stored-session-id' })
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginHandler,
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

    handler = module.get<LoginHandler>(LoginHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
  });

  describe('validation', () => {
    it('should throw AUTH_001 if email is missing', async () => {
      // Arrange
      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: '',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_001'
      });
    });

    it('should throw AUTH_001 if password is missing', async () => {
      // Arrange
      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: ''
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_001'
      });
    });

    it('should throw AUTH_001 if userId is not a valid integer', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: { ...mockUserInfo, userId: 'invalid' },
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_001'
      });
    });

    it('should throw AUTH_001 if userId is zero or negative', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: { ...mockUserInfo, userId: '0' },
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_001'
      });
    });
  });

  describe('authentication', () => {
    it('should authenticate user with valid credentials', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.authenticateWithEmailPassword).toHaveBeenCalledWith(
        'primary-encryption-key',
        'user@example.com',
        'password123'
      );

      expect(result).toEqual({
        ...mockAuthResult,
        user: mockUserInfo,
        isNewUser: false
      });
    });

    it('should mark new user correctly', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isNewUser).toBe(true);
    });

    it('should work without tenantId for public auth routes', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: '',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.authenticateWithEmailPassword).toHaveBeenCalledWith(
        '',
        'user@example.com',
        'password123'
      );
      expect(result).toBeDefined();
    });
  });

  describe('transaction handling', () => {
    it('should execute operations within transaction', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should update last sign-in timestamp within transaction', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.updateUserLastSignInWithTransaction).toHaveBeenCalledWith(
        dbTransaction,
        123
      );
    });

    it('should save event to outbox within transaction', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123',
        ipAddress: '192.168.1.1',
        userAgent: 'TestAgent',
        correlationId: 'corr-123',
        causationId: 'caus-123'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'user.loggedin',
          aggregateId: '123',
          tenantId: 'primary-encryption-key',
          payload: expect.objectContaining({
            tenantId: 'primary-encryption-key',
            userId: '123',
            provider: 'email_password',
            ipAddress: '192.168.1.1',
            userAgent: 'TestAgent',
            sessionId: expect.any(String)
          }),
          correlationId: 'corr-123',
          causationId: 'caus-123'
        })
      );
      expect(authSessionStore.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'primary-encryption-key',
          userId: '123',
          refreshToken: 'refresh-token',
          accessToken: 'access-token'
        })
      );
    });

    it('should include sessionId in event payload', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      await handler.execute(command);

      // Assert
      const outboxCall = outboxRepo.insert.mock.calls[0];
      const payload = outboxCall?.[1]?.payload as { sessionId: string };

      expect(payload.sessionId).toBeDefined();
      expect(payload.sessionId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });
  });

  describe('token expiration', () => {
    it('should return access token with expiration time', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: {
          ...mockAuthResult,
          expiresIn: 3600 // 1 hour
        },
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.expiresIn).toBe(3600);
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should return refresh token with longer expiration', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: {
          ...mockAuthResult,
          refreshExpiresIn: 86400 // 24 hours
        },
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.refreshExpiresIn).toBe(86400);
      expect(result.refreshExpiresIn).toBeGreaterThan(Number(result.expiresIn));
    });

    it('should include token expiration times in response', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.expiresIn).toBeDefined();
      expect(result.refreshExpiresIn).toBeDefined();
      expect(Number(result.expiresIn)).toBeLessThan(Number(result.refreshExpiresIn));
    });

    it('should return all three tokens', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.idToken).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should propagate authentication errors', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockRejectedValue(
        new Error('Authentication failed')
      );

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'wrong-password'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Authentication failed');
    });

    it('should roll back transaction on error', async () => {
      // Arrange
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      outboxRepo.insert.mockRejectedValue(new Error('Database error'));

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Database error');
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should ensure partial data is not persisted on transaction failure', async () => {
      // Arrange
      const mockError = new Error('Transaction failed');
      authService.updateUserLastSignInWithTransaction.mockRejectedValue(mockError);
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Transaction failed');

      // Verify that the transaction was called but operations were rolled back
      expect(db.transaction).toHaveBeenCalled();

      // Verify that outbox insert was never reached due to rollback
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should roll back all operations when outbox insert fails', async () => {
      // Arrange
      const mockError = new Error('Outbox insert failed');
      authService.authenticateWithEmailPassword.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        user: mockUser
      });
      authService.updateUserLastSignInWithTransaction.mockResolvedValue(undefined);
      outboxRepo.insert.mockRejectedValue(mockError);

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Outbox insert failed');

      // Verify transaction was executed
      expect(db.transaction).toHaveBeenCalled();

      // Verify that updateLastSignIn was called but rolled back
      expect(authService.updateUserLastSignInWithTransaction).toHaveBeenCalledWith(
        dbTransaction,
        123
      );

      // Verify that outbox insert was attempted but failed
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'user.loggedin'
        })
      );
    });

    it('should not persist any data when authentication fails mid-transaction', async () => {
      // Arrange
      const mockError = new Error('Authentication service failed');
      authService.authenticateWithEmailPassword.mockRejectedValue(mockError);

      const command = new LoginCommand({
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        password: 'password123'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Authentication service failed');

      // Verify no database writes were attempted
      expect(authService.updateUserLastSignInWithTransaction).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });
});
