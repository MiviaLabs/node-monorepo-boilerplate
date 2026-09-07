/**
 * Unit Tests for ValidateTokenHandler
 *
 * Tests access token validation.
 */

import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ValidateTokenQuery } from '../../../queries/validate-token.query';
import { AuthService } from '../../../services/auth.service';
import { ValidateTokenHandler } from '../validate-token.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('ValidateTokenHandler', () => {
  let handler: ValidateTokenHandler;
  let authService: jest.Mocked<AuthService>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;

  beforeEach(async () => {
    const mockAuthService = {
      validateToken: jest.fn()
    };
    const mockAuditOutbox = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidateTokenHandler,
        {
          provide: AuthService,
          useValue: mockAuthService
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: {}
        }
      ]
    }).compile();

    handler = module.get<ValidateTokenHandler>(ValidateTokenHandler);
    authService = module.get(AuthService);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  describe('token validation', () => {
    it('should validate token successfully', async () => {
      // Arrange
      const mockUserInfo = {
        userId: '123',
        tenantId: 'primary-encryption-key',
        email: 'user@example.com',
        name: 'Test User'
      };

      authService.validateToken.mockResolvedValue(mockUserInfo);

      const query = new ValidateTokenQuery({
        tenantId: 'primary-encryption-key',
        token: 'valid-token',
        requestId: 'req-token-1',
        correlationId: 'corr-token-1',
        causationId: 'cause-token-1'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(authService.validateToken).toHaveBeenCalledWith(
        'primary-encryption-key',
        'valid-token'
      );
      expect(result).toEqual(mockUserInfo);
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'auth.token.validated.audit',
          correlationId: 'corr-token-1',
          causationId: 'cause-token-1',
          payload: expect.objectContaining({
            requestId: 'req-token-1',
            details: expect.objectContaining({
              roleCount: 0,
              permissionCount: 0
            })
          })
        })
      );
    });

    it('should pass tenantId to service', async () => {
      // Arrange
      authService.validateToken.mockResolvedValue({
        userId: '123',
        tenantId: 'tenant-456'
      });

      const query = new ValidateTokenQuery({
        tenantId: 'tenant-456',
        token: 'valid-token'
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(authService.validateToken).toHaveBeenCalledWith('tenant-456', 'valid-token');
    });

    it('should pass token to service', async () => {
      // Arrange
      authService.validateToken.mockResolvedValue({
        userId: '123',
        tenantId: 'primary-encryption-key'
      });

      const query = new ValidateTokenQuery({
        tenantId: 'primary-encryption-key',
        token: 'custom-token-123'
      });

      // Act
      await handler.execute(query);

      // Assert
      expect(authService.validateToken).toHaveBeenCalledWith(
        'primary-encryption-key',
        'custom-token-123'
      );
    });
  });

  describe('validation results', () => {
    it('should return user info for valid token', async () => {
      // Arrange
      const mockUserInfo = {
        userId: '456',
        tenantId: 'tenant-456',
        email: 'user@example.com',
        name: 'Test User',
        emailVerified: true,
        roles: ['user']
      };

      authService.validateToken.mockResolvedValue(mockUserInfo);

      const query = new ValidateTokenQuery({
        tenantId: 'tenant-456',
        token: 'valid-token'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual(mockUserInfo);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      // Arrange
      authService.validateToken.mockRejectedValue(
        new UnauthorizedException({
          code: 'AUTH_002',
          message: 'Invalid token'
        })
      );

      const query = new ValidateTokenQuery({
        tenantId: 'primary-encryption-key',
        token: 'invalid-token'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      // Arrange
      authService.validateToken.mockRejectedValue(
        new UnauthorizedException({
          code: 'AUTH_002',
          message: 'Token expired'
        })
      );

      const query = new ValidateTokenQuery({
        tenantId: 'primary-encryption-key',
        token: 'expired-token'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('tenant handling', () => {
    it('should work with empty tenantId', async () => {
      // Arrange
      authService.validateToken.mockResolvedValue({
        userId: '123',
        tenantId: 'primary-encryption-key'
      });

      const query = new ValidateTokenQuery({
        tenantId: '',
        token: 'valid-token'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(authService.validateToken).toHaveBeenCalledWith('', 'valid-token');
      expect(result).toEqual({
        userId: '123',
        tenantId: 'primary-encryption-key'
      });
    });

    it('should work with different tenantId formats', async () => {
      // Arrange
      authService.validateToken.mockResolvedValue({
        userId: '123',
        tenantId: 'tenant-999'
      });

      const query = new ValidateTokenQuery({
        tenantId: 'tenant-999',
        token: 'valid-token'
      });

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual({
        userId: '123',
        tenantId: 'tenant-999'
      });
    });
  });

  describe('error handling', () => {
    it('should propagate service errors', async () => {
      // Arrange
      authService.validateToken.mockRejectedValue(new Error('Validation service unavailable'));

      const query = new ValidateTokenQuery({
        tenantId: 'primary-encryption-key',
        token: 'valid-token'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Validation service unavailable');
    });

    it('should handle network errors', async () => {
      // Arrange
      authService.validateToken.mockRejectedValue(new Error('Network timeout'));

      const query = new ValidateTokenQuery({
        tenantId: 'primary-encryption-key',
        token: 'valid-token'
      });

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Network timeout');
    });
  });
});
