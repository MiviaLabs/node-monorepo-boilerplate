/**
 * Unit Tests for UnlinkIdentityDto
 *
 * Tests validation for unlinking identity provider.
 */

import { IdentityProvider } from '@package/db-core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UnlinkIdentityDto } from '../unlink-identity.dto';

import type { ValidationError } from 'class-validator';

describe('UnlinkIdentityDto', () => {
  const validateDto = async (dto: UnlinkIdentityDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(UnlinkIdentityDto, dto);
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
      const errors = await validateDto(dto as UnlinkIdentityDto);

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
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with email_password provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: '123'
      };

      // Act
      const errors = await validateDto(dto as UnlinkIdentityDto);

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
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEnum']).toBeDefined();
    });

    it('should fail with missing provider', async () => {
      // Arrange
      const dto = { providerUid: 'uid-123' } as UnlinkIdentityDto;

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
      const errors = await validateDto(dto as UnlinkIdentityDto);

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
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with numeric providerUid', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.EMAIL_PASSWORD,
        providerUid: '456'
      };

      // Act
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing providerUid', async () => {
      // Arrange
      const dto = { provider: IdentityProvider.GOOGLE } as UnlinkIdentityDto;

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
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('complete unlink identity', () => {
    it('should pass with both required fields', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        providerUid: 'google-uid-123'
      };

      // Act
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for multiple invalid fields', async () => {
      // Arrange
      const dto = {
        provider: 'invalid' as IdentityProvider,
        providerUid: 123 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as UnlinkIdentityDto);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
