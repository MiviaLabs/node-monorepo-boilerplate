/**
 * Unit Tests for LoginWithPhoneHandler
 *
 * Tests phone number authentication using transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { LoginWithPhoneCommand } from '../../../commands/login-with-phone.command';
import { AuthSessionStoreService } from '../../../services/auth-session-store.service';
import { AuthService } from '../../../services/auth.service';
import { LoginWithPhoneHandler } from '../login-with-phone.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('LoginWithPhoneHandler', () => {
  let handler: LoginWithPhoneHandler;
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
    username: 'user@example.com',
    email: 'user@example.com',
    emailVerified: undefined,
    roles: [],
    permissions: [],
    tenantId: 'primary-encryption-key',
    userId: '123'
  };

  beforeEach(async () => {
    const mockAuthService = {
      authenticateWithPhone: jest.fn()
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
        LoginWithPhoneHandler,
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

    handler = module.get<LoginWithPhoneHandler>(LoginWithPhoneHandler);
    authService = module.get(AuthService);
    outboxRepo = module.get(OutboxRepository);
    db = module.get(MAIN_DB);
  });

  describe('phone authentication', () => {
    it('should authenticate user with valid phone and code', async () => {
      // Arrange
      authService.authenticateWithPhone.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false
      });

      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+1234567890',
        verificationCode: '123456'
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(authService.authenticateWithPhone).toHaveBeenCalledWith(
        'primary-encryption-key',
        '+1234567890',
        '123456'
      );

      expect(db.transaction).toHaveBeenCalled();
      expect(result).toEqual({
        ...mockAuthResult,
        user: mockUserInfo,
        isNewUser: false
      });
    });

    it('should mark new user correctly', async () => {
      // Arrange
      authService.authenticateWithPhone.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: true
      });

      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+155501234567',
        verificationCode: '654321'
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
      authService.authenticateWithPhone.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false
      });

      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+1234567890',
        verificationCode: '123456',
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

    it('should use phone as provider in event', async () => {
      // Arrange
      authService.authenticateWithPhone.mockResolvedValue({
        authResult: mockAuthResult,
        userInfo: mockUserInfo,
        isNewUser: false
      });

      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+1234567890',
        verificationCode: '123456'
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

  describe('error handling', () => {
    it('should propagate authentication errors', async () => {
      // Arrange
      authService.authenticateWithPhone.mockRejectedValue(new Error('Invalid verification code'));

      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+1234567890',
        verificationCode: '000000'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow('Invalid verification code');
    });

    it('should not publish event on authentication failure', async () => {
      // Arrange
      authService.authenticateWithPhone.mockRejectedValue(new Error('Phone authentication failed'));

      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+1234567890',
        verificationCode: 'invalid'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('should throw error when tenantId is missing', async () => {
      // Arrange
      const command = new LoginWithPhoneCommand({
        tenantId: '',
        phoneNumber: '+1234567890',
        verificationCode: '123456'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when phoneNumber is missing', async () => {
      // Arrange
      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '',
        verificationCode: '123456'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });

    it('should throw error when verificationCode is missing', async () => {
      // Arrange
      const command = new LoginWithPhoneCommand({
        tenantId: 'primary-encryption-key',
        phoneNumber: '+1234567890',
        verificationCode: ''
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow();
    });
  });
});
