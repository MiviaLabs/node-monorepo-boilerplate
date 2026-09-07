/**
 * Unit Tests for UserIdentityDto
 *
 * Tests user identity DTO structure and factory methods.
 */

import { IdentityProvider } from '@package/db-core';

import { UserIdentityDto } from '../user-identity.dto';

describe('UserIdentityDto', () => {
  describe('DTO structure', () => {
    it('should have all required fields', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: true
      };

      // Assert
      expect(dto.id).toBe(1);
      expect(dto.userId).toBe(123);
      expect(dto.provider).toBe(IdentityProvider.GOOGLE);
      expect(dto.providerUid).toBe('google-uid-123');
      expect(dto.emailVerified).toBe(true);
      expect(dto.phoneVerified).toBe(false);
      expect(dto.isPrimary).toBe(true);
    });

    it('should allow optional displayName', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        displayName: 'John Doe',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.displayName).toBe('John Doe');
    });

    it('should allow optional photoUrl', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        photoUrl: 'https://example.com/photo.jpg',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.photoUrl).toBe('https://example.com/photo.jpg');
    });

    it('should allow optional lastSignInAt', () => {
      // Arrange
      const lastSignIn = new Date('2024-01-15T10:30:00.000Z');
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false,
        lastSignInAt: lastSignIn
      };

      // Assert
      expect(dto.lastSignInAt).toEqual(lastSignIn);
    });

    it('should allow both optional fields', () => {
      // Arrange
      const lastSignIn = new Date('2024-01-15T10:30:00.000Z');
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        displayName: 'Jane Doe',
        photoUrl: 'https://example.com/jane.jpg',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false,
        lastSignInAt: lastSignIn
      };

      // Assert
      expect(dto.displayName).toBe('Jane Doe');
      expect(dto.photoUrl).toBe('https://example.com/jane.jpg');
      expect(dto.lastSignInAt).toEqual(lastSignIn);
    });
  });

  describe('provider values', () => {
    const providerTestCases = [
      { provider: IdentityProvider.GOOGLE, id: 1, uid: 'google-uid-123' },
      { provider: IdentityProvider.APPLE, id: 2, uid: 'apple-uid-456' },
      { provider: IdentityProvider.MICROSOFT, id: 3, uid: 'microsoft-uid-789' },
      { provider: IdentityProvider.FACEBOOK, id: 4, uid: 'facebook-uid-123' },
      { provider: IdentityProvider.GITHUB, id: 5, uid: 'github-uid-456' },
      { provider: IdentityProvider.LINKEDIN, id: 6, uid: 'linkedin-uid-789' },
      { provider: IdentityProvider.EMAIL_PASSWORD, id: 7, uid: 'email-uid-999' }
    ];

    providerTestCases.forEach(({ provider, id, uid }) => {
      it(`should support ${provider} provider`, () => {
        // Arrange
        const dto: UserIdentityDto = {
          id,
          userId: 123,
          provider,
          providerUid: uid,
          emailVerified: true,
          phoneVerified: false,
          isPrimary: id === 1
        };

        // Assert
        expect(dto.provider).toBe(provider);
      });
    });
  });

  describe('verification flags', () => {
    it('should support emailVerified true', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.emailVerified).toBe(true);
      expect(typeof dto.emailVerified).toBe('boolean');
    });

    it('should support emailVerified false', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: 'email-uid-123',
        emailVerified: false,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.emailVerified).toBe(false);
    });

    it('should support phoneVerified true', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: 'phone-uid-123',
        emailVerified: false,
        phoneVerified: true,
        isPrimary: false
      };

      // Assert
      expect(dto.phoneVerified).toBe(true);
      expect(typeof dto.phoneVerified).toBe('boolean');
    });

    it('should support phoneVerified false', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.phoneVerified).toBe(false);
    });

    it('should support both verified true', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: 'uid-123',
        emailVerified: true,
        phoneVerified: true,
        isPrimary: true
      };

      // Assert
      expect(dto.emailVerified).toBe(true);
      expect(dto.phoneVerified).toBe(true);
    });
  });

  describe('primary flag', () => {
    it('should support primary identity', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: true
      };

      // Assert
      expect(dto.isPrimary).toBe(true);
    });

    it('should support secondary identity', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 2,
        userId: 123,
        provider: IdentityProvider.APPLE,
        providerUid: 'apple-uid-456',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.isPrimary).toBe(false);
    });
  });

  describe('fromEntity factory method', () => {
    it('should create DTO from UserIdentity entity', () => {
      // Arrange
      const entity = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE as string,
        providerUid: 'google-uid-123',
        displayName: 'John Doe',
        phoneNumberEncrypted: '',
        photoUrl: 'https://example.com/photo.jpg',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        lastSignInAt: new Date('2024-01-15T10:30:00.000Z'),
        providerEmailHash: 'hash',
        providerEmailEncrypted: 'encrypted',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: true,
        encryptionKeyVersion: 'primary-encryption-key/cryptoKeyVersions/1'
      };

      // Act
      const dto = UserIdentityDto.fromEntity(entity);

      // Assert
      expect(dto.id).toBe(entity.id);
      expect(dto.userId).toBe(entity.userId);
      expect(dto.provider).toBe(entity.provider);
      expect(dto.providerUid).toBe(entity.providerUid);
      expect(dto.displayName).toBe(entity.displayName);
      expect(dto.photoUrl).toBe(entity.photoUrl);
      expect(dto.emailVerified).toBe(entity.emailVerified);
      expect(dto.phoneVerified).toBe(entity.phoneVerified);
      expect(dto.isPrimary).toBe(entity.isPrimary);
      expect(dto.lastSignInAt).toEqual(entity.lastSignInAt);
    });

    it('should handle entity without optional fields', () => {
      // Arrange
      const entity = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.EMAIL_PASSWORD as string,
        providerUid: 'email-uid-123',
        displayName: null,
        phoneNumberEncrypted: null,
        photoUrl: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        lastSignInAt: null,
        providerEmailHash: null,
        providerEmailEncrypted: null,
        emailVerified: false,
        phoneVerified: false,
        isPrimary: false,
        encryptionKeyVersion: 'primary-encryption-key/cryptoKeyVersions/1'
      };

      // Act
      const dto = UserIdentityDto.fromEntity(entity);

      // Assert
      expect(dto.displayName).toBe('');
      expect(dto.photoUrl).toBe('');
      expect(dto.lastSignInAt).toBeInstanceOf(Date);
    });

    it('should copy all provider UIDs', () => {
      // Arrange
      const entity = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.APPLE as string,
        providerUid: 'apple-uid-with-special-chars-123',
        displayName: null,
        phoneNumberEncrypted: null,
        photoUrl: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        lastSignInAt: null,
        providerEmailHash: null,
        providerEmailEncrypted: null,
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false,
        encryptionKeyVersion: 'primary-encryption-key/cryptoKeyVersions/1'
      };

      // Act
      const dto = UserIdentityDto.fromEntity(entity);

      // Assert
      expect(dto.providerUid).toBe('apple-uid-with-special-chars-123');
    });

    it('should handle lastSignInAt as Date', () => {
      // Arrange
      const lastSignIn = new Date('2024-12-31T23:59:59.999Z');
      const entity = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE as string,
        providerUid: 'google-uid-123',
        displayName: null,
        phoneNumberEncrypted: null,
        photoUrl: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        lastSignInAt: lastSignIn,
        providerEmailHash: null,
        providerEmailEncrypted: null,
        emailVerified: true,
        phoneVerified: false,
        isPrimary: true,
        encryptionKeyVersion: 'primary-encryption-key/cryptoKeyVersions/1'
      };

      // Act
      const dto = UserIdentityDto.fromEntity(entity);

      // Assert
      expect(dto.lastSignInAt).toEqual(lastSignIn);
      expect(dto.lastSignInAt).toBeInstanceOf(Date);
    });
  });

  describe('field types', () => {
    it('should have numeric id', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 999,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(typeof dto.id).toBe('number');
    });

    it('should have numeric userId', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 456,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(typeof dto.userId).toBe('number');
    });

    it('should have string providerUid', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-string-123',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(typeof dto.providerUid).toBe('string');
    });

    it('should have string displayName when present', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        displayName: 'Display Name String',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(typeof dto.displayName).toBe('string');
    });

    it('should have string photoUrl when present', () => {
      // Arrange
      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        photoUrl: 'https://example.com/url-string.jpg',
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(typeof dto.photoUrl).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('should handle very long providerUid', () => {
      // Arrange
      const longUid = 'uid-'.repeat(50);

      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: longUid,
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.providerUid.length).toBeGreaterThan(100);
    });

    it('should handle very long displayName', () => {
      // Arrange
      const longName = 'Name '.repeat(50);

      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        displayName: longName,
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.displayName?.length).toBeGreaterThan(100);
    });

    it('should handle very long photoUrl', () => {
      // Arrange
      const longUrl = 'https://example.com/' + 'a'.repeat(200) + '.jpg';

      const dto: UserIdentityDto = {
        id: 1,
        userId: 123,
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        photoUrl: longUrl,
        emailVerified: true,
        phoneVerified: false,
        isPrimary: false
      };

      // Assert
      expect(dto.photoUrl?.length).toBeGreaterThan(200);
    });
  });
});
