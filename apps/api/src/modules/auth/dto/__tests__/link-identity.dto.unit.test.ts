/**
 * Unit Tests for LinkIdentityDto
 *
 * Tests validation for linking identity provider.
 */

import { IdentityProvider } from '@package/db-core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LinkIdentityDto } from '../link-identity.dto';

import type { ValidationError } from 'class-validator';

describe('LinkIdentityDto', () => {
  const validateDto = async (dto: LinkIdentityDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(LinkIdentityDto, dto);
    return validate(instance);
  };

  describe('provider validation', () => {
    it('should pass with google.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with apple.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.APPLE,
        providerUid: 'apple-uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid provider', async () => {
      // Arrange
      const dto = {
        provider: 'invalid-provider' as IdentityProvider,
        providerUid: 'uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEnum']).toBeDefined();
    });

    it('should fail with missing provider', async () => {
      // Arrange
      const dto = { providerUid: 'uid-123' } as LinkIdentityDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('providerUid validation', () => {
    it('should pass with valid providerUid', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: '123456789'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with alphanumeric providerUid', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-abc-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing providerUid', async () => {
      // Arrange
      const dto = { provider: IdentityProvider.GOOGLE } as LinkIdentityDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-string providerUid', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('idToken validation', () => {
    it('should pass with idToken provided', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass without idToken (optional)', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-string idToken', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        idToken: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('accessToken validation', () => {
    it('should pass with accessToken provided', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        accessToken: 'access-token'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass without accessToken (optional)', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-string accessToken', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        accessToken: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('displayName validation', () => {
    it('should pass with displayName provided', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        displayName: 'John Doe'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass without displayName (optional)', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-string displayName', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        displayName: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('photoUrl validation', () => {
    it('should pass with photoUrl provided', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        photoUrl: 'https://example.com/photo.jpg'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass without photoUrl (optional)', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-string photoUrl', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123',
        photoUrl: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('complete link identity', () => {
    it('should pass with all fields valid', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123',
        idToken: 'valid-id-token',
        accessToken: 'access-token',
        displayName: 'John Doe',
        photoUrl: 'https://example.com/photo.jpg'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with only required fields', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'uid-123'
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for multiple invalid fields', async () => {
      // Arrange
      const dto = {
        provider: 'invalid' as IdentityProvider,
        providerUid: 123 as unknown as string,
        idToken: 456 as unknown as string,
        accessToken: 789 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
