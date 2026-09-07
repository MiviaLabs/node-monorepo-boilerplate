/**
 * Unit Tests for UserProfileResponseDto
 *
 * Tests factory method and field mapping logic.
 */

import { validate } from 'class-validator';

import { UserProfileResponseDto } from '../user-profile-response.dto';

describe('UserProfileResponseDto', () => {
  describe('fromUserData factory method', () => {
    it('should create DTO with all required fields', () => {
      // Arrange
      const userData = {
        userId: '123',
        tenantId: 'tenant-abc',
        actorId: '123',
        email: 'user@example.com',
        name: 'John Doe',
        phoneNumber: '+14155552671',
        roles: ['admin'],
        permissions: ['read:all']
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto).toBeInstanceOf(UserProfileResponseDto);
      expect(dto.userId).toBe('123');
      expect(dto.tenantId).toBe('tenant-abc');
      expect(dto.actorId).toBe('123');
      expect(dto.email).toBe('user@example.com');
      expect(dto.name).toBe('John Doe');
      expect(dto.displayName).toBe('John Doe');
      expect(dto.phoneNumber).toBe('+14155552671');
      expect(dto.photoUrl).toBeUndefined();
      expect(dto.roles).toEqual(['admin']);
      expect(dto.permissions).toEqual(['read:all']);
    });

    it('should create DTO with optional fields omitted', () => {
      // Arrange
      const userData = {
        userId: '456',
        tenantId: 'tenant-xyz',
        actorId: '456'
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.userId).toBe('456');
      expect(dto.tenantId).toBe('tenant-xyz');
      expect(dto.actorId).toBe('456');
      expect(dto.email).toBeUndefined();
      expect(dto.name).toBe('User'); // Default fallback
      expect(dto.displayName).toBe('User');
      expect(dto.photoUrl).toBeUndefined();
      expect(dto.roles).toEqual([]);
      expect(dto.permissions).toEqual([]);
    });

    it('should keep resolved photoUrl when provided', () => {
      const dto = UserProfileResponseDto.fromUserData({
        userId: '777',
        tenantId: 'tenant-photo',
        actorId: '777',
        photoUrl: 'https://signed.example.test/avatar.png'
      });

      expect(dto.photoUrl).toBe('https://signed.example.test/avatar.png');
    });

    it('should prefer explicit displayName over name and username fallbacks', () => {
      const dto = UserProfileResponseDto.fromUserData({
        userId: '999',
        tenantId: 'tenant',
        actorId: '999',
        displayName: 'Persisted Display Name',
        name: 'Token Name',
        username: 'token-username'
      });

      expect(dto.displayName).toBe('Persisted Display Name');
      expect(dto.name).toBe('Persisted Display Name');
    });

    it('should fallback name to username when name is not provided', () => {
      // Arrange
      const userData = {
        userId: '789',
        tenantId: 'tenant-def',
        actorId: '789',
        username: 'johndoe'
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.name).toBe('johndoe');
    });

    it('should fallback name to "User" when neither name nor username provided', () => {
      // Arrange
      const userData = {
        userId: '101',
        tenantId: 'tenant-ghi',
        actorId: '101',
        email: 'no-name@example.com'
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      // The implementation uses 'User' as final fallback, not email
      expect(dto.name).toBe('User');
    });

    it('should prefer name over username and email', () => {
      // Arrange
      const userData = {
        userId: '102',
        tenantId: 'tenant-jkl',
        actorId: '102',
        name: 'Preferred Name',
        username: 'fallback-username',
        email: 'fallback@example.com'
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.name).toBe('Preferred Name');
    });

    it('should use "User" placeholder when name, username, and email are all undefined', () => {
      // Arrange
      const userData = {
        userId: '103',
        tenantId: 'tenant-mno',
        actorId: '103'
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.name).toBe('User');
    });

    it('should convert Set roles to Array', () => {
      // Arrange
      const userData = {
        userId: '104',
        tenantId: 'tenant-pqr',
        actorId: '104',
        roles: new Set(['admin', 'moderator', 'user'])
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.roles).toBeInstanceOf(Array);
      expect(dto.roles).toEqual(['admin', 'moderator', 'user']);
    });

    it('should convert Set permissions to Array', () => {
      // Arrange
      const userData = {
        userId: '105',
        tenantId: 'tenant-stu',
        actorId: '105',
        permissions: new Set(['read:own', 'write:own', 'delete:own'])
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.permissions).toBeInstanceOf(Array);
      expect(dto.permissions).toEqual(['read:own', 'write:own', 'delete:own']);
    });

    it('should handle empty Set for roles and permissions', () => {
      // Arrange
      const userData = {
        userId: '106',
        tenantId: 'tenant-vwx',
        actorId: '106',
        roles: new Set<string>(),
        permissions: new Set<string>()
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.roles).toEqual([]);
      expect(dto.permissions).toEqual([]);
    });

    it('should handle mixed Array and Set for roles', () => {
      // Arrange
      const userData = {
        userId: '107',
        tenantId: 'tenant-yz',
        actorId: '107',
        roles: ['admin', 'user']
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.roles).toEqual(['admin', 'user']);
    });

    it('should handle mixed Array and Set for permissions', () => {
      // Arrange
      const userData = {
        userId: '108',
        tenantId: 'primary-encryption-key',
        actorId: '108',
        permissions: ['read:all', 'write:all']
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.permissions).toEqual(['read:all', 'write:all']);
    });

    it('should handle undefined roles and permissions', () => {
      // Arrange
      const userData = {
        userId: '109',
        tenantId: 'tenant-456',
        actorId: '109',
        email: 'test@example.com'
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.roles).toEqual([]);
      expect(dto.permissions).toEqual([]);
    });
  });

  describe('validation', () => {
    it('should pass validation with all required fields', async () => {
      // Arrange
      const dto = UserProfileResponseDto.fromUserData({
        userId: '123',
        tenantId: 'tenant-abc',
        actorId: '123',
        email: 'user@example.com',
        name: 'Test User',
        roles: ['admin'],
        permissions: ['read:all']
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with only required fields', async () => {
      // Arrange
      const dto = UserProfileResponseDto.fromUserData({
        userId: '456',
        tenantId: 'tenant-xyz',
        actorId: '456'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with optional email field', async () => {
      // Arrange
      const dto = UserProfileResponseDto.fromUserData({
        userId: '789',
        tenantId: 'tenant-def',
        actorId: '789',
        email: 'valid@example.com'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with optional phoneNumber field', async () => {
      const dto = UserProfileResponseDto.fromUserData({
        userId: '800',
        tenantId: 'tenant-def',
        actorId: '800',
        phoneNumber: '+14155552671'
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.phoneNumber).toBe('+14155552671');
    });

    it('should pass validation with optional name field', async () => {
      // Arrange
      const dto = UserProfileResponseDto.fromUserData({
        userId: '101',
        tenantId: 'tenant-ghi',
        actorId: '101',
        name: 'Jane Doe'
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with roles array', async () => {
      // Arrange
      const dto = UserProfileResponseDto.fromUserData({
        userId: '102',
        tenantId: 'tenant-jkl',
        actorId: '102',
        roles: ['system_owner', 'tenant_admin', 'moderator']
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with permissions array', async () => {
      // Arrange
      const dto = UserProfileResponseDto.fromUserData({
        userId: '103',
        tenantId: 'tenant-mno',
        actorId: '103',
        permissions: ['system:*', 'tenant:*', 'read:own']
      });

      // Act
      const errors = await validate(dto);

      // Assert
      expect(errors).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string email', () => {
      // Arrange
      const userData = {
        userId: '104',
        tenantId: 'tenant-pqr',
        actorId: '104',
        email: ''
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.email).toBe('');
    });

    it('should handle empty string name', () => {
      // Arrange
      const userData = {
        userId: '105',
        tenantId: 'tenant-stu',
        actorId: '105',
        name: ''
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.name).toBe('');
    });

    it('should handle very long roles array', () => {
      // Arrange
      const userData = {
        userId: '106',
        tenantId: 'tenant-vwx',
        actorId: '106',
        roles: Array.from({ length: 100 }, (_, i) => `role-${i}`)
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.roles).toHaveLength(100);
      expect(dto.roles[0]).toBe('role-0');
      expect(dto.roles[99]).toBe('role-99');
    });

    it('should handle very long permissions array', () => {
      // Arrange
      const userData = {
        userId: '107',
        tenantId: 'tenant-yz',
        actorId: '107',
        permissions: Array.from({ length: 100 }, (_, i) => `permission:${i}`)
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.permissions).toHaveLength(100);
      expect(dto.permissions[0]).toBe('permission:0');
      expect(dto.permissions[99]).toBe('permission:99');
    });

    it('should handle Set with duplicate roles', () => {
      // Arrange
      const userData = {
        userId: '108',
        tenantId: 'tenant-111',
        actorId: '108',
        roles: new Set(['admin', 'admin', 'user'])
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      // Set deduplicates automatically
      expect(dto.roles).toEqual(['admin', 'user']);
    });

    it('should handle Set with duplicate permissions', () => {
      // Arrange
      const userData = {
        userId: '109',
        tenantId: 'tenant-222',
        actorId: '109',
        permissions: new Set(['read:own', 'read:own', 'write:own'])
      };

      // Act
      const dto = UserProfileResponseDto.fromUserData(userData);

      // Assert
      expect(dto.permissions).toEqual(['read:own', 'write:own']);
    });
  });
});
