/**
 * Unit Tests for LoginWithOAuthDto
 *
 * Tests validation for OAuth login.
 */

import { IdentityProvider } from '@package/db-core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginWithOAuthDto } from '../login-with-oauth.dto';

import type { ValidationError } from 'class-validator';

describe('LoginWithOAuthDto', () => {
  const validateDto = async (dto: LoginWithOAuthDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(LoginWithOAuthDto, dto);
    return validate(instance);
  };

  describe('provider validation', () => {
    it('should pass with google.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with apple.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.APPLE,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with microsoft.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.MICROSOFT,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with linkedin.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.LINKEDIN,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with github.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GITHUB,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with facebook.com provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.FACEBOOK,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with email_password provider', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.EMAIL_PASSWORD,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid provider', async () => {
      // Arrange
      const dto = {
        provider: 'invalid-provider' as IdentityProvider,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEnum']).toBeDefined();
    });

    it('should fail with missing provider', async () => {
      // Arrange
      const dto = { idToken: 'valid-id-token' } as LoginWithOAuthDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('idToken validation', () => {
    it('should pass with valid idToken', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with empty idToken', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: ''
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert - Empty string is technically a string
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing idToken', async () => {
      // Arrange
      const dto = { provider: IdentityProvider.GOOGLE } as LoginWithOAuthDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-string idToken', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('accessToken validation', () => {
    it('should pass with accessToken provided', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'valid-id-token',
        accessToken: 'ya29.a0AfH6SMBx...'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass without accessToken (optional)', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with non-string accessToken', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'valid-id-token',
        accessToken: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('complete OAuth login', () => {
    it('should pass with all fields valid', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'valid-id-token',
        accessToken: 'access-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with only required fields', async () => {
      // Arrange
      const dto = {
        provider: IdentityProvider.GOOGLE,
        idToken: 'valid-id-token'
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for multiple invalid fields', async () => {
      // Arrange
      const dto = {
        provider: 'invalid' as IdentityProvider,
        idToken: 123 as unknown as string,
        accessToken: 456 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LoginWithOAuthDto);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
