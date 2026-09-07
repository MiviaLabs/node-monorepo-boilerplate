/**
 * Users schema unit tests
 * Validates multi-provider authentication schema and PII compliance
 */

import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { users } from '../users.schema';

describe('users.schema', () => {
  describe('users table', () => {
    it('should be defined', () => {
      expect(typeof users).toBe('object');
    });

    it('should be a valid Drizzle table schema', () => {
      expect(typeof users).toBe('object');
      expect(users !== null).toBe(true);
    });
  });

  describe('Profile data fields', () => {
    it('should have firstNameEncrypted column for encrypted first name (PII)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('firstNameEncrypted')).toBe(true);
    });

    it('should have lastNameEncrypted column for encrypted last name (PII)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('lastNameEncrypted')).toBe(true);
    });

    it('should have displayName column for public display name', () => {
      const columns = Object.keys(users);
      expect(columns.includes('displayName')).toBe(true);
    });

    it('should have photoUrl column for user avatar', () => {
      const columns = Object.keys(users);
      expect(columns.includes('photoUrl')).toBe(true);
    });

    it('should have avatarFileId column for canonical uploaded avatars', () => {
      const columns = Object.keys(users);
      expect(columns.includes('avatarFileId')).toBe(true);
    });

    it('should NOT have name column (replaced by firstName/lastName + displayName)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('name')).toBe(false);
    });
  });

  describe('Email fields (nullable for phone-only users)', () => {
    it('should have emailEncrypted column for PII encryption', () => {
      const columns = Object.keys(users);
      expect(columns.includes('emailEncrypted')).toBe(true);
    });

    it('should have emailHash column for lookups', () => {
      const columns = Object.keys(users);
      expect(columns.includes('emailHash')).toBe(true);
    });
  });

  describe('Phone number field', () => {
    it('should have phoneNumberEncrypted for encrypted phone numbers', () => {
      const columns = Object.keys(users);
      expect(columns.includes('phoneNumberEncrypted')).toBe(true);
    });
  });

  describe('Status fields', () => {
    it('should have isActive column for user status', () => {
      const columns = Object.keys(users);
      expect(columns.includes('isActive')).toBe(true);
    });

    it('should have isVerified column for verification status', () => {
      const columns = Object.keys(users);
      expect(columns.includes('isVerified')).toBe(true);
    });
  });

  describe('Timestamp fields', () => {
    it('should have createdAt column', () => {
      const columns = Object.keys(users);
      expect(columns.includes('createdAt')).toBe(true);
    });

    it('should have updatedAt column', () => {
      const columns = Object.keys(users);
      expect(columns.includes('updatedAt')).toBe(true);
    });

    it('should have lastSignInAt column for tracking login activity', () => {
      const columns = Object.keys(users);
      expect(columns.includes('lastSignInAt')).toBe(true);
    });
  });

  describe('Multi-provider changes', () => {
    it('should NOT have gcpUid column (moved to user_identities)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('gcpUid')).toBe(false);
    });

    it('should NOT have provider column (moved to user_identities)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('provider')).toBe(false);
    });

    it('should NOT have emailVerified column (moved to user_identities)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('emailVerified')).toBe(false);
    });
  });

  describe('PII compliance', () => {
    it('should have encrypted fields for first and last name', () => {
      const columns = Object.keys(users);
      expect(columns.includes('firstNameEncrypted')).toBe(true);
      expect(columns.includes('lastNameEncrypted')).toBe(true);
    });

    it('should have displayName field for public display (not encrypted)', () => {
      const columns = Object.keys(users);
      expect(columns.includes('displayName')).toBe(true);
    });

    it('should have emailEncrypted field for PII', () => {
      const columns = Object.keys(users);
      expect(columns.includes('emailEncrypted')).toBe(true);
    });

    it('should have phoneNumberEncrypted field for PII', () => {
      const columns = Object.keys(users);
      expect(columns.includes('phoneNumberEncrypted')).toBe(true);
    });
  });

  describe('Avatar file linkage', () => {
    it('should define a foreign key from avatarFileId to files.id', () => {
      const foreignKeyNames = getTableConfig(users).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      );

      expect(foreignKeyNames).toContain('users_avatar_file_id_files_id_fk');
    });
  });
});
