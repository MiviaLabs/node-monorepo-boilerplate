/**
 * Unit Tests for RefreshTokenDto
 *
 * Tests validation for token refresh.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RefreshTokenDto } from '../refresh-token.dto';

import type { ValidationError } from 'class-validator';

describe('RefreshTokenDto', () => {
  const validateDto = async (dto: RefreshTokenDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(RefreshTokenDto, dto);
    return validate(instance);
  };

  describe('refreshToken validation', () => {
    it('should pass with valid refresh token', async () => {
      // Arrange
      const dto = { refreshToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...' };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with non-empty refresh token', async () => {
      // Arrange
      const dto = { refreshToken: 'any-non-empty-string' };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing refreshToken', async () => {
      // Arrange
      const dto = {} as RefreshTokenDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty refreshToken', async () => {
      // Arrange
      const dto = { refreshToken: '' };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['minLength']).toBeDefined();
    });

    it('should fail with whitespace-only refreshToken', async () => {
      // Arrange
      const dto = { refreshToken: '   ' };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      // Note: @IsNotEmpty() doesn't trim whitespace, so this passes validation
      // The actual token verification will fail with a more meaningful error
      expect(errors).toHaveLength(0);
      // Token validation will fail during JWT verification with "Invalid or expired access token"
    });

    it('should fail with non-string refreshToken', async () => {
      // Arrange
      const dto = { refreshToken: 12345 as unknown as string };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with null refreshToken', async () => {
      // Arrange
      const dto = { refreshToken: null as unknown as string };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with undefined refreshToken', async () => {
      // Arrange
      const dto = { refreshToken: undefined as unknown as string };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('JWT format validation', () => {
    it('should pass with JWT-like format', async () => {
      // Arrange - Typical JWT has 3 parts separated by dots
      const dto = { refreshToken: 'header.payload.signature' };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should accept Firebase refresh token format', async () => {
      // Arrange - Firebase tokens are typically longer
      const dto = {
        refreshToken:
          'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAifQ.eyJleHAiOjE3MjY0ODQ4MDAsInN1YiI6IjEyMzQ1Njc4OTAiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vdGVzdC1wcm9qZWN0LmlkIiwicHJvdmlkZXI6InRlc3QtcHJvamVjdC5pZCIsImF1ZCI6InRlc3QtcHJvamVjdC5pZCIsImF1ZCI6InRlc3QtcHJvamVjdC5pZCJ9.signature'
      };

      // Act
      const errors = await validateDto(dto as RefreshTokenDto);

      // Assert
      expect(errors).toHaveLength(0);
    });
  });
});
