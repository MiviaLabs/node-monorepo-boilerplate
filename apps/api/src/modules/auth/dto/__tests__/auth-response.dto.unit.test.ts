/**
 * Unit Tests for AuthResponseDto
 *
 * Tests authentication response DTO structure and factory methods.
 */

import { AuthResponseDto } from '../auth-response.dto';

import type { AuthResponse } from '../../auth.types';

describe('AuthResponseDto', () => {
  describe('DTO structure', () => {
    it('should have all required fields', () => {
      // Arrange
      const dto: AuthResponseDto = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '123',
          username: 'user@example.com',
          email: 'user@example.com',
          roles: ['user'],
          permissions: [],
          tenantId: 'primary-encryption-key'
        },
        isNewUser: false
      };

      // Assert
      expect(dto.accessToken).toBe('access-token');
      expect(dto.refreshToken).toBe('refresh-token');
      expect(dto.idToken).toBe('id-token');
      expect(dto.expiresIn).toBe(3600);
      expect(dto.refreshExpiresIn).toBe(86400);
      expect(dto.isNewUser).toBe(false);
    });

    it('should allow optional emailVerified field', () => {
      // Arrange
      const dto: AuthResponseDto = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '123',
          username: 'user@example.com',
          email: 'user@example.com',
          emailVerified: true,
          roles: ['user'],
          permissions: [],
          tenantId: 'primary-encryption-key'
        },
        isNewUser: false
      };

      // Assert
      expect(dto.user.emailVerified).toBe(true);
    });

    it('should support empty roles and permissions', () => {
      // Arrange
      const dto: AuthResponseDto = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '123',
          username: 'user@example.com',
          email: 'user@example.com',
          roles: [],
          permissions: [],
          tenantId: 'primary-encryption-key'
        },
        isNewUser: false
      };

      // Assert
      expect(dto.user.roles).toEqual([]);
      expect(dto.user.permissions).toEqual([]);
    });

    it('should support multiple roles and permissions', () => {
      // Arrange
      const dto: AuthResponseDto = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '123',
          username: 'admin@example.com',
          email: 'admin@example.com',
          roles: ['admin', 'user'],
          permissions: ['users:read', 'users:write', 'organizations:read'],
          tenantId: 'primary-encryption-key'
        },
        isNewUser: false
      };

      // Assert
      expect(dto.user.roles).toHaveLength(2);
      expect(dto.user.permissions).toHaveLength(3);
    });

    it('should mark new user correctly', () => {
      // Arrange
      const dto: AuthResponseDto = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '123',
          username: 'newuser@example.com',
          email: 'newuser@example.com',
          roles: ['user'],
          permissions: [],
          tenantId: 'primary-encryption-key'
        },
        isNewUser: true
      };

      // Assert
      expect(dto.isNewUser).toBe(true);
    });
  });

  describe('fromAuthResponse factory method', () => {
    it('should create DTO from AuthResponse', () => {
      // Arrange
      const authResponse: AuthResponse = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        idToken: 'id-token-123',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '456',
          username: 'user@example.com',
          email: 'user@example.com',
          emailVerified: true,
          roles: ['user'],
          permissions: ['read'],
          tenantId: 'tenant-456'
        },
        isNewUser: false
      };

      // Act
      const dto = AuthResponseDto.fromAuthResponse(authResponse);

      // Assert
      expect(dto).toEqual(authResponse);
    });

    it('should handle AuthResponse without emailVerified', () => {
      // Arrange
      const authResponse: AuthResponse = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '789',
          username: 'user@example.com',
          email: 'user@example.com',
          roles: ['user'],
          permissions: [],
          tenantId: 'tenant-789'
        },
        isNewUser: true
      };

      // Act
      const dto = AuthResponseDto.fromAuthResponse(authResponse);

      // Assert
      expect(dto.user.emailVerified).toBeUndefined();
      expect(dto.isNewUser).toBe(true);
    });

    it('should copy all token fields', () => {
      // Arrange
      const authResponse: AuthResponse = {
        accessToken: 'custom-access-token',
        refreshToken: 'custom-refresh-token',
        idToken: 'custom-id-token',
        expiresIn: 7200,
        refreshExpiresIn: 172800,
        user: {
          userId: '999',
          username: 'user@example.com',
          email: 'user@example.com',
          roles: [],
          permissions: [],
          tenantId: 'tenant-999'
        },
        isNewUser: false
      };

      // Act
      const dto = AuthResponseDto.fromAuthResponse(authResponse);

      // Assert
      expect(dto.accessToken).toBe('custom-access-token');
      expect(dto.refreshToken).toBe('custom-refresh-token');
      expect(dto.idToken).toBe('custom-id-token');
      expect(dto.expiresIn).toBe(7200);
      expect(dto.refreshExpiresIn).toBe(172800);
    });

    it('should copy all user fields', () => {
      // Arrange
      const authResponse: AuthResponse = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '111',
          username: 'testuser',
          email: 'testuser@example.com',
          emailVerified: false,
          roles: ['admin', 'moderator'],
          permissions: ['all'],
          tenantId: 'tenant-111'
        },
        isNewUser: false
      };

      // Act
      const dto = AuthResponseDto.fromAuthResponse(authResponse);

      // Assert
      expect(dto.user.userId).toBe('111');
      expect(dto.user.username).toBe('testuser');
      expect(dto.user.email).toBe('testuser@example.com');
      expect(dto.user.emailVerified).toBe(false);
      expect(dto.user.roles).toEqual(['admin', 'moderator']);
      expect(dto.user.permissions).toEqual(['all']);
      expect(dto.user.tenantId).toBe('tenant-111');
    });
  });

  describe('edge cases', () => {
    it('should handle very long tokens', () => {
      // Arrange
      const longToken = 'a'.repeat(1000);

      // Act
      const dto: AuthResponseDto = {
        accessToken: longToken,
        refreshToken: longToken,
        idToken: longToken,
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: '1',
          username: 'u',
          email: 'u@e.com',
          roles: [],
          permissions: [],
          tenantId: 't-1'
        },
        isNewUser: false
      };

      // Assert
      expect(dto.accessToken.length).toBe(1000);
      expect(dto.refreshToken.length).toBe(1000);
      expect(dto.idToken.length).toBe(1000);
    });

    it('should handle very long userId and tenantId', () => {
      // Arrange
      const longId = 'id-'.repeat(100);

      // Act
      const dto: AuthResponseDto = {
        accessToken: 'a',
        refreshToken: 'r',
        idToken: 'i',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: longId,
          username: 'u',
          email: 'u@e.com',
          roles: [],
          permissions: [],
          tenantId: longId
        },
        isNewUser: false
      };

      // Assert
      expect(dto.user.userId).toBe(longId);
      expect(dto.user.tenantId).toBe(longId);
    });

    it('should handle zero expiration times', () => {
      // Arrange
      const dto: AuthResponseDto = {
        accessToken: 'a',
        refreshToken: 'r',
        idToken: 'i',
        expiresIn: 0,
        refreshExpiresIn: 0,
        user: {
          userId: '1',
          username: 'u',
          email: 'u@e.com',
          roles: [],
          permissions: [],
          tenantId: 't-1'
        },
        isNewUser: false
      };

      // Assert
      expect(dto.expiresIn).toBe(0);
      expect(dto.refreshExpiresIn).toBe(0);
    });
  });
});
