/**
 * UserListItemDto Unit Tests
 *
 * Tests DTO static factory methods.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - fromEntity() static method
 * - Field mapping (id, organizationId, createdAt)
 * - Null organizationId handling
 */

import { describe, it, expect } from '@jest/globals';

import { createMockUser } from '../../__tests__/fixtures/user.fixture';
import { UserListItemDto } from '../user-list-item.dto';

describe('UserListItemDto', () => {
  describe('fromEntity', () => {
    it('should create DTO from entity with all fields', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 42,
        organizationId: 123,
        createdAt: new Date('2024-01-15T10:30:00.000Z')
      });

      // Act
      const dto = UserListItemDto.fromEntity(mockUser);

      // Assert
      expect(dto).toBeInstanceOf(UserListItemDto);
      expect(dto.id).toBe(42);
      expect(dto.organizationId).toBe(123);
      expect(dto.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    });

    it('should handle null organizationId by defaulting to 0', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 1,
        organizationId: null as unknown as number
      });

      // Act
      const dto = UserListItemDto.fromEntity(mockUser);

      // Assert
      expect(dto.organizationId).toBe(0);
    });

    it('should handle undefined organizationId by defaulting to 0', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 1
      });
      // Simulate undefined organizationId
      (mockUser as { organizationId: number | undefined }).organizationId = undefined;

      // Act
      const dto = UserListItemDto.fromEntity(mockUser);

      // Assert
      expect(dto.organizationId).toBe(0);
    });

    it('should preserve exact createdAt timestamp', () => {
      // Arrange
      const timestamp = new Date('2023-06-20T14:45:30.123Z');
      const mockUser = createMockUser({
        createdAt: timestamp
      });

      // Act
      const dto = UserListItemDto.fromEntity(mockUser);

      // Assert
      expect(dto.createdAt).toEqual(timestamp);
      expect(dto.createdAt.getTime()).toBe(timestamp.getTime());
    });

    it('should not include fields not in DTO', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 1,
        organizationId: 100,
        isActive: true,
        isVerified: true,
        emailEncrypted: 'encrypted-email',
        displayName: 'Test User'
      });

      // Act
      const dto = UserListItemDto.fromEntity(mockUser);

      // Assert
      expect(dto).toHaveProperty('id');
      expect(dto).toHaveProperty('organizationId');
      expect(dto).toHaveProperty('createdAt');
      // These should NOT be present in the DTO
      expect(dto).not.toHaveProperty('isActive');
      expect(dto).not.toHaveProperty('isVerified');
      expect(dto).not.toHaveProperty('emailEncrypted');
      expect(dto).not.toHaveProperty('displayName');
      expect(dto).not.toHaveProperty('updatedAt');
    });

    it('should create independent DTO instance', () => {
      // Arrange
      const mockUser = createMockUser({ id: 1 });

      // Act
      const dto1 = UserListItemDto.fromEntity(mockUser);
      const dto2 = UserListItemDto.fromEntity(mockUser);

      // Assert
      expect(dto1).not.toBe(dto2);
      expect(dto1.id).toBe(dto2.id);
    });
  });
});
