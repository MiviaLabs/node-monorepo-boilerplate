/**
 * UserResponseDto Unit Tests
 *
 * Tests DTO static factory methods.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - fromEntity() static method
 * - Field mapping (id, organizationId, createdAt, updatedAt)
 * - Null organizationId handling
 */

import { describe, it, expect } from '@jest/globals';

import { createMockUser } from '../../__tests__/fixtures/user.fixture';
import { UserResponseDto } from '../user-response.dto';

describe('UserResponseDto', () => {
  describe('fromEntity', () => {
    it('should create DTO from entity with all fields', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 42,
        organizationId: 123,
        createdAt: new Date('2024-01-15T10:30:00.000Z'),
        updatedAt: new Date('2024-02-20T15:45:00.000Z')
      });

      // Act
      const dto = UserResponseDto.fromEntity(mockUser);

      // Assert
      expect(dto).toBeInstanceOf(UserResponseDto);
      expect(dto.id).toBe(42);
      expect(dto.organizationId).toBe(123);
      expect(dto.createdAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
      expect(dto.updatedAt).toEqual(new Date('2024-02-20T15:45:00.000Z'));
    });

    it('should handle null organizationId by defaulting to 0', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 1,
        organizationId: null as unknown as number
      });

      // Act
      const dto = UserResponseDto.fromEntity(mockUser);

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
      const dto = UserResponseDto.fromEntity(mockUser);

      // Assert
      expect(dto.organizationId).toBe(0);
    });

    it('should preserve exact timestamps', () => {
      // Arrange
      const createdTimestamp = new Date('2023-06-20T14:45:30.123Z');
      const updatedTimestamp = new Date('2024-01-01T00:00:00.000Z');
      const mockUser = createMockUser({
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp
      });

      // Act
      const dto = UserResponseDto.fromEntity(mockUser);

      // Assert
      expect(dto.createdAt).toEqual(createdTimestamp);
      expect(dto.createdAt.getTime()).toBe(createdTimestamp.getTime());
      expect(dto.updatedAt).toEqual(updatedTimestamp);
      expect(dto.updatedAt.getTime()).toBe(updatedTimestamp.getTime());
    });

    it('should not include fields not in DTO', () => {
      // Arrange
      const mockUser = createMockUser({
        id: 1,
        organizationId: 100,
        isActive: true,
        isVerified: true,
        emailEncrypted: 'encrypted-email',
        displayName: 'Test User',
        firstNameEncrypted: 'encrypted-first',
        lastNameEncrypted: 'encrypted-last'
      });

      // Act
      const dto = UserResponseDto.fromEntity(mockUser);

      // Assert
      expect(dto).toHaveProperty('id');
      expect(dto).toHaveProperty('organizationId');
      expect(dto).toHaveProperty('createdAt');
      expect(dto).toHaveProperty('updatedAt');
      // These should NOT be present in the DTO (PII fields excluded)
      expect(dto).not.toHaveProperty('isActive');
      expect(dto).not.toHaveProperty('isVerified');
      expect(dto).not.toHaveProperty('emailEncrypted');
      expect(dto).not.toHaveProperty('displayName');
      expect(dto).not.toHaveProperty('firstNameEncrypted');
      expect(dto).not.toHaveProperty('lastNameEncrypted');
    });

    it('should create independent DTO instance', () => {
      // Arrange
      const mockUser = createMockUser({ id: 1 });

      // Act
      const dto1 = UserResponseDto.fromEntity(mockUser);
      const dto2 = UserResponseDto.fromEntity(mockUser);

      // Assert
      expect(dto1).not.toBe(dto2);
      expect(dto1.id).toBe(dto2.id);
    });

    it('should handle same createdAt and updatedAt', () => {
      // Arrange
      const sameTimestamp = new Date('2024-01-01T00:00:00.000Z');
      const mockUser = createMockUser({
        createdAt: sameTimestamp,
        updatedAt: sameTimestamp
      });

      // Act
      const dto = UserResponseDto.fromEntity(mockUser);

      // Assert
      expect(dto.createdAt).toEqual(dto.updatedAt);
    });
  });
});
