/**
 * Unit Tests for User Factory
 *
 * Tests user seed data factory with PII protection.
 */

import { describe, it, expect } from '@jest/globals';

import { createTestUser, createTestUsers } from '../../factories/user.factory';

import type { NewUser } from '../../../schemas';

describe('User Factory', () => {
  describe('createTestUser', () => {
    it('should create user with [SEED-TEST] prefix in email', () => {
      // Act
      const user = createTestUser();

      // Assert
      expect(user.emailEncrypted).toMatch(/^\[SEED-TEST\]-/);
    });

    it('should create user with @dev.local domain', () => {
      // Act
      const user = createTestUser();

      // Assert
      expect(user.emailEncrypted).toMatch(/@dev\.local$/);
    });

    it('should create email hash for PII protection', () => {
      // Act
      const user = createTestUser();

      // Assert
      expect(user.emailHash).toBeDefined();
      expect(typeof user.emailHash).toBe('string');
      expect(user.emailHash.length).toBe(64); // SHA-256 = 64 hex chars
    });

    it('should create user with display name', () => {
      // Act
      const user = createTestUser();

      // Assert
      expect(user.displayName).toBeDefined();
      expect(user.displayName).toMatch(/^\[SEED-TEST] User /);
    });

    it('should create user with default status values', () => {
      // Act
      const user = createTestUser();

      // Assert
      expect(user.isActive).toBe(true);
      expect(user.isVerified).toBe(false);
    });

    it('should merge provided overrides', () => {
      // Arrange
      const overrides: Partial<NewUser> = {
        organizationId: 123,
        isActive: false,
        isVerified: true
      };

      // Act
      const user = createTestUser(overrides);

      // Assert
      expect(user.organizationId).toBe(123);
      expect(user.isActive).toBe(false);
      expect(user.isVerified).toBe(true);
    });

    it('should override defaults with provided values', () => {
      // Arrange
      const overrides: Partial<NewUser> = {
        displayName: 'Custom User'
      };

      // Act
      const user = createTestUser(overrides);

      // Assert
      expect(user.displayName).toBe('Custom User');
    });

    it('should create unique emails for each call', () => {
      // Act
      const user1 = createTestUser();
      const user2 = createTestUser();

      // Assert
      expect(user1.emailEncrypted).not.toBe(user2.emailEncrypted);
      expect(user1.emailHash).not.toBe(user2.emailHash);
    });

    it('should create unique display names for each call', () => {
      // Act
      const user1 = createTestUser();
      const user2 = createTestUser();

      // Assert
      expect(user1.displayName).not.toBe(user2.displayName);
    });

    it('should set PII fields to null by default', () => {
      // Act
      const user = createTestUser();

      // Assert
      expect(user.photoUrl).toBeNull();
      expect(user.phoneNumberEncrypted).toBeNull();
      expect(user.firstNameEncrypted).toBeNull();
      expect(user.lastNameEncrypted).toBeNull();
    });
  });

  describe('createTestUsers', () => {
    it('should create specified number of users', () => {
      // Arrange
      const count = 5;

      // Act
      const users = createTestUsers(count);

      // Assert
      expect(users.length).toBe(count);
    });

    it('should create users with unique emails', () => {
      // Arrange
      const count = 10;

      // Act
      const users = createTestUsers(count);

      // Assert
      const emails = users.map((u) => u.emailEncrypted);
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBe(count);
    });

    it('should apply overrides to all users', () => {
      // Arrange
      const overrides: Partial<NewUser> = {
        organizationId: 456,
        isActive: true
      };

      // Act
      const users = createTestUsers(3, overrides);

      // Assert
      for (const user of users) {
        expect(user.organizationId).toBe(456);
        expect(user.isActive).toBe(true);
      }
    });

    it('should create zero users when count is 0', () => {
      // Act
      const users = createTestUsers(0);

      // Assert
      expect(users.length).toBe(0);
    });

    it('should create single user when count is 1', () => {
      // Act
      const users = createTestUsers(1);

      // Assert
      expect(users.length).toBe(1);
      expect(users[0]?.emailEncrypted).toBeDefined();
    });
  });
});
