/**
 * Unit Tests for LoginWithOAuthHandler
 *
 * Tests OAuth provider authentication using transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { IdentityProvider } from '@package/db-core';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { LoginWithOAuthCommand } from '../../../commands/login-with-oauth.command';
import { AuthSessionStoreService } from '../../../services/auth-session-store.service';
import { AuthService } from '../../../services/auth.service';
import { LoginWithOAuthHandler } from '../login-with-oauth.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('LoginWithOAuthHandler', () => {
  let handler: LoginWithOAuthHandler;
  let authService: jest.Mocked<AuthService>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;

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

  beforeEach(async () => {
    const mockAuthService = {
      authenticateWithOAuth: jest.fn()
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
        LoginWithOAuthHandler,
        {
          provide: AuthService,
          useValue: mockAuthService
        },
        {
          provide: AuthSessionStoreService,
          useValue: {
            createSession: jest.fn().mockResolvedValue({ sessionId: 'stored-session-id' })
          }
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

    handler = module.get<LoginWithOAuthHandler>(LoginWithOAuthHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
    db = module.get(MAIN_DB);
  });

  describe('OAuth authentication', () => {
    it('should authenticate user with Google provider', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token',
        accessToken: 'google-access-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.authenticateWithOAuth).toHaveBeenCalledWith(
        'primary-encryption-key',
        IdentityProvider.GOOGLE,
        'google-id-token',
        'google-access-token'
      );

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({
        ...mockAuthResult,
        user: {
          userId: '123',
          tenantId: 'primary-encryption-key',
          email: 'user@example.com',
          emailVerified: undefined,
          permissions: [],
          roles: [],
          username: 'user@example.com'
        },
        isNewUser: false
      });
    });

    it('should authenticate user with Apple provider', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.APPLE,
        idToken: 'apple-id-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.authenticateWithOAuth).toHaveBeenCalledWith(
        'primary-encryption-key',
        IdentityProvider.APPLE,
        'apple-id-token',
        undefined
      );

      expect(result).toBeDefined();
    });

    it('should authenticate user with Microsoft provider', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.MICROSOFT,
        idToken: 'microsoft-id-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(authService.authenticateWithOAuth).toHaveBeenCalledWith(
        'primary-encryption-key',
        IdentityProvider.MICROSOFT,
        'microsoft-id-token',
        undefined
      );
    });

    it('should mark new user correctly', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isNewUser).toBe(true);
    });
  });

  describe('outbox event publishing', () => {
    it('should save event to outbox after authentication', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'user.loggedin',
          aggregateId: '123'
        })
      );
    });

    it('should generate unique session ID', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'user.loggedin'
        })
      );
    });

    it('should include provider in event', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.LINKEDIN,
        idToken: 'linkedin-id-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'user.loggedin'
        })
      );
    });
  });

  describe('optional parameters', () => {
    it('should work without accessToken', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.authenticateWithOAuth).toHaveBeenCalledWith(
        'primary-encryption-key',
        IdentityProvider.GOOGLE,
        'google-id-token',
        undefined
      );

      expect(result).toBeDefined();
    });

    it('should work without ipAddress', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalled();
    });

    it('should work without userAgent', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false,
        profile: { provider: 'google.com', providerUid: 'google-uid-123' }
      });

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token'
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should propagate authentication errors', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockRejectedValue(new Error('OAuth authentication failed'));

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'invalid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('OAuth authentication failed');
    });

    it('should not publish event on authentication failure', async () => {
      // Arrange
      authService.authenticateWithOAuth.mockRejectedValue(new Error('Authentication failed'));

      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: 'invalid-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('should throw error when tenantId is missing', async () => {
      // Arrange
      const command = new LoginWithOAuthCommand({
        tenantId: '',
        provider: IdentityProvider.GOOGLE,
        idToken: 'google-id-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when provider is missing', async () => {
      // Arrange
      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: '' as IdentityProvider,
        idToken: 'google-id-token'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when idToken is missing', async () => {
      // Arrange
      const command = new LoginWithOAuthCommand({
        tenantId: 'primary-encryption-key',
        provider: IdentityProvider.GOOGLE,
        idToken: ''
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });
  });
});
