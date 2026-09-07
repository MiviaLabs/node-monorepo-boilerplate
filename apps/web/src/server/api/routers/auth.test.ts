/**
 * Auth Router Tests
 *
 * Unit tests for authentication tRPC procedures.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthResponse } from '~/types/auth.types';

// Mock the runtime-config module
vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: vi.fn((version = 'v1') => `http://localhost:3001/api/${version}`),
  getApiUrl: vi.fn(() => 'http://localhost:3001')
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('Auth Router', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should validate login input schema', async () => {
      // Arrange
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert - Invalid email
      await expect(
        caller.login({ email: 'invalid-email', password: 'password123' })
      ).rejects.toThrow('Invalid email address');

      // Act & Assert - Password too short
      await expect(caller.login({ email: 'test@example.com', password: 'short' })).rejects.toThrow(
        'Password must be at least 8 characters'
      );
    });

    it('should validate register input schema', async () => {
      // Arrange
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert - Invalid email
      await expect(
        caller.register({ email: 'invalid-email', password: 'password123' })
      ).rejects.toThrow('Invalid email address');

      // Act & Assert - Password too short
      await expect(
        caller.register({ email: 'test@example.com', password: 'short' })
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    it('should validate refresh input schema', async () => {
      // Arrange
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert - Empty refresh token
      await expect(caller.refresh({ refreshToken: '' })).rejects.toThrow(
        'Refresh token is required'
      );
    });

    it('should validate logout input schema', async () => {
      // Arrange
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert - Empty refresh token
      await expect(caller.logout({ refreshToken: '', accessToken: 'valid-token' })).rejects.toThrow(
        'Refresh token is required'
      );

      // Act & Assert - Empty access token
      await expect(caller.logout({ refreshToken: 'valid-token', accessToken: '' })).rejects.toThrow(
        'Access token is required'
      );
    });

    it('should validate getUserRoles input schema', async () => {
      // Arrange
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert - Empty access token
      await expect(caller.getUserRoles({ accessToken: '' })).rejects.toThrow(
        'Access token is required'
      );
    });

    it('should validate updateMyProfile input schema', async () => {
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      await expect(
        caller.updateMyProfile({ displayName: 'a', phoneNumber: '+14155552671' })
      ).rejects.toThrow('Display name must be at least 2 characters');

      await expect(
        caller.updateMyProfile({ displayName: 'Valid Name', phoneNumber: '12345' })
      ).rejects.toThrow('Phone number must be in E.164 format');
    });

    it('should validate deleteAccount input schema', async () => {
      // Arrange
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert - Empty user ID
      await expect(
        caller.deleteAccount({
          userId: '',
          accessToken: 'token',
          tenantId: 'tenant'
        })
      ).rejects.toThrow('User ID is required');

      // Act & Assert - Empty access token
      await expect(
        caller.deleteAccount({
          userId: 'user-123',
          accessToken: '',
          tenantId: 'tenant'
        })
      ).rejects.toThrow('Access token is required');

      // Act & Assert - Empty tenant ID
      await expect(
        caller.deleteAccount({
          userId: 'user-123',
          accessToken: 'token',
          tenantId: ''
        })
      ).rejects.toThrow('Tenant ID is required');
    });
  });

  describe('login', () => {
    it('should successfully login user', async () => {
      // Arrange
      const mockResponse: AuthResponse = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        idToken: 'id-token-123',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          emailVerified: true,
          roles: ['user'],
          permissions: ['read'],
          tenantId: 'tenant-123'
        },
        isNewUser: false
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.login({
        email: 'test@example.com',
        password: 'password123'
      });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/iam/sessions',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
        })
      );
    });

    it('should handle login error', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid credentials' })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(
        caller.login({ email: 'test@example.com', password: 'wrong-password' })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('should successfully register user', async () => {
      // Arrange
      const mockResponse: AuthResponse = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        idToken: 'id-token-123',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: 'user-123',
          email: 'newuser@example.com',
          emailVerified: false,
          roles: ['user'],
          permissions: ['read'],
          tenantId: 'tenant-123'
        },
        isNewUser: true
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.register({
        email: 'newuser@example.com',
        password: 'password123',
        displayName: 'New User'
      });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/iam/enroll',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      );
    });

    it('should handle registration error', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Email already exists' })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(
        caller.register({ email: 'existing@example.com', password: 'password123' })
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('refresh', () => {
    it('should successfully refresh token', async () => {
      // Arrange
      const mockResponse: AuthResponse = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        idToken: 'new-id-token',
        expiresIn: 3600,
        refreshExpiresIn: 86400,
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          emailVerified: true,
          roles: ['user'],
          permissions: ['read'],
          tenantId: 'tenant-123'
        },
        isNewUser: false
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.refresh({ refreshToken: 'old-refresh-token' });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/iam/sessions/refresh',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ refreshToken: 'old-refresh-token' })
        })
      );
    });

    it('should handle invalid refresh token', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid refresh token' })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(caller.refresh({ refreshToken: 'invalid-token' })).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      // Arrange
      const mockResponse = { message: 'Logout successful' };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.logout({
        refreshToken: 'refresh-token',
        accessToken: 'access-token'
      });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/v1/iam/sessions/close', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: 'refresh-token' })
      });
    });

    it('should handle logout error', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(
        caller.logout({ refreshToken: 'token', accessToken: 'invalid-token' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('getUserRoles', () => {
    it('should successfully get user roles', async () => {
      // Arrange
      const mockResponse = {
        roles: ['admin', 'user'],
        permissions: ['read', 'write', 'delete']
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResponse })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.getUserRoles({ accessToken: 'access-token' });

      // Assert
      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/v1/iam/roles', {
        method: 'GET',
        credentials: 'include',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json'
        }
      });
    });

    it('should handle unauthorized access', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(caller.getUserRoles({ accessToken: 'invalid-token' })).rejects.toThrow(
        'Unauthorized'
      );
    });
  });

  describe('updateMyProfile', () => {
    it('should update profile with auth context from headers', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            userId: 'user-123',
            tenantId: 'tenant-123',
            displayName: 'Updated User',
            phoneNumber: '+14155552671',
            roles: ['user'],
            permissions: ['read']
          }
        })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({
        headers: new Headers({
          authorization: 'Bearer access-token',
          'x-tenant-id': 'tenant-123'
        })
      });

      const result = await caller.updateMyProfile({
        displayName: 'Updated User',
        phoneNumber: '+14155552671'
      });

      expect(result.displayName).toBe('Updated User');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/v1/iam/identity', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-123'
        },
        body: JSON.stringify({
          displayName: 'Updated User',
          phoneNumber: '+14155552671'
        })
      });
    });

    it('should require auth context for profile updates', async () => {
      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      await expect(
        caller.updateMyProfile({ displayName: 'Updated User', phoneNumber: '+14155552671' })
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('deleteAccount', () => {
    it('should successfully delete account', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 204
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.deleteAccount({
        userId: 'user-123',
        accessToken: 'access-token',
        tenantId: 'tenant-123'
      });

      // Assert
      expect(result).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/iam/account/user-123',
        {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            Authorization: 'Bearer access-token',
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-123'
          }
        }
      );
    });

    it('should successfully delete account with reason', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 204
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      const result = await caller.deleteAccount({
        userId: 'user-123',
        accessToken: 'access-token',
        tenantId: 'tenant-123',
        reason: 'User requested deletion'
      });

      // Assert
      expect(result).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/iam/account/user-123?reason=User%20requested%20deletion',
        {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            Authorization: 'Bearer access-token',
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-123'
          }
        }
      );
    });

    it('should handle delete account error', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(
        caller.deleteAccount({
          userId: 'user-123',
          accessToken: 'invalid-token',
          tenantId: 'tenant-123'
        })
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      await expect(
        caller.login({ email: 'test@example.com', password: 'password123' })
      ).rejects.toThrow('Network error');
    });

    it('should handle malformed JSON response', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act & Assert
      // Error handling now sanitizes 500 errors to prevent leaking backend details
      await expect(
        caller.login({ email: 'test@example.com', password: 'password123' })
      ).rejects.toThrow('Internal server error');
    });
  });

  describe('Session Management', () => {
    it('should include credentials in all requests', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: {} })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      await caller.login({ email: 'test@example.com', password: 'password123' });

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include'
        })
      );
    });

    it('should set Content-Type header', async () => {
      // Arrange
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: {} })
      });

      const { authRouter } = await import('./auth');
      const caller = authRouter.createCaller({ headers: new Headers() });

      // Act
      await caller.register({ email: 'test@example.com', password: 'password123' });

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });
});
