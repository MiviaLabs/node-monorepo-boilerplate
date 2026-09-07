/**
 * User identities schema unit tests
 * Validates multi-provider authentication schema
 */

import { describe, expect, it } from '@jest/globals';

import { userIdentities, IdentityProvider } from '../user-identities.schema';

describe('user-identities.schema', () => {
  describe('userIdentities table', () => {
    it('should be defined', () => {
      expect(typeof userIdentities).toBe('object');
    });

    it('should be a valid Drizzle table schema', () => {
      expect(typeof userIdentities).toBe('object');
      expect(userIdentities !== null).toBe(true);
    });
  });

  describe('IdentityProvider enum', () => {
    it('should have GOOGLE provider', () => {
      expect(IdentityProvider.GOOGLE).toBe('google.com');
    });

    it('should have PHONE provider', () => {
      expect(IdentityProvider.PHONE).toBe('phone');
    });

    it('should have EMAIL_PASSWORD provider', () => {
      expect(IdentityProvider.EMAIL_PASSWORD).toBe('email_password');
    });

    it('should have MICROSOFT provider', () => {
      expect(IdentityProvider.MICROSOFT).toBe('microsoft.com');
    });

    it('should have APPLE provider', () => {
      expect(IdentityProvider.APPLE).toBe('apple.com');
    });

    it('should have LINKEDIN provider', () => {
      expect(IdentityProvider.LINKEDIN).toBe('linkedin.com');
    });

    it('should have GITHUB provider', () => {
      expect(IdentityProvider.GITHUB).toBe('github.com');
    });

    it('should have FACEBOOK provider', () => {
      expect(IdentityProvider.FACEBOOK).toBe('facebook.com');
    });
  });

  describe('Multi-provider support fields', () => {
    it('should have provider column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('provider')).toBe(true);
    });

    it('should have providerUid column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('providerUid')).toBe(true);
    });

    it('should have userId column for foreign key', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('userId')).toBe(true);
    });

    it('should NOT have gcpUid column (removed, use providerUid instead)', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('gcpUid')).toBe(false);
    });
  });

  describe('Provider-specific data fields', () => {
    it('should have providerEmailHash column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('providerEmailHash')).toBe(true);
    });

    it('should have providerEmailEncrypted column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('providerEmailEncrypted')).toBe(true);
    });

    it('should have phoneNumberEncrypted column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('phoneNumberEncrypted')).toBe(true);
    });

    it('should have displayName column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('displayName')).toBe(true);
    });

    it('should have photoUrl column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('photoUrl')).toBe(true);
    });
  });

  describe('Verification status fields', () => {
    it('should have emailVerified column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('emailVerified')).toBe(true);
    });

    it('should have phoneVerified column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('phoneVerified')).toBe(true);
    });
  });

  describe('Account linking support', () => {
    it('should have isPrimary column for primary identity flag', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('isPrimary')).toBe(true);
    });
  });

  describe('Timestamp fields', () => {
    it('should have createdAt column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('createdAt')).toBe(true);
    });

    it('should have updatedAt column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('updatedAt')).toBe(true);
    });

    it('should have lastSignInAt column', () => {
      const columns = Object.keys(userIdentities);
      expect(columns.includes('lastSignInAt')).toBe(true);
    });
  });
});
