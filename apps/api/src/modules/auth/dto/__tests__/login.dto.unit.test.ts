/**
 * Unit Tests for LoginDto
 *
 * Tests validation for email/password login.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from '../login.dto';

import type { ValidationError } from 'class-validator';

describe('LoginDto', () => {
  const validateDto = async (dto: LoginDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(LoginDto, dto);
    return validate(instance);
  };

  describe('email validation', () => {
    it('should pass with valid email', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid email format', async () => {
      // Arrange
      const dto = { email: 'not-an-email', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEmail']).toBeDefined();
    });

    it('should fail with missing email', async () => {
      // Arrange
      const dto = { password: 'SecurePass123!' } as LoginDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should pass with subdomain email', async () => {
      // Arrange
      const dto = { email: 'user@mail.example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with numeric email', async () => {
      // Arrange
      const dto = { email: '123@test.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with plus sign in email', async () => {
      // Arrange
      const dto = { email: 'user+tag@example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });
  });

  describe('password validation', () => {
    it('should pass with valid 8-character password', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'Pass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with long password', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'a'.repeat(128) };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with password shorter than 8 characters', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'Pass1!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['minLength']).toBeDefined();
    });

    it('should fail with password longer than 128 characters', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'a'.repeat(129) };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['maxLength']).toBeDefined();
    });

    it('should fail with missing password', async () => {
      // Arrange
      const dto = { email: 'user@example.com' } as LoginDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty password', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: '' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-string password', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 12345 as unknown as string };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('combined validation', () => {
    it('should pass with valid email and password', async () => {
      // Arrange
      const dto = { email: 'test@example.com', password: 'MySecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for invalid email and password', async () => {
      // Arrange
      const dto = { email: 'invalid-email', password: 'short' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle all fields present', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as LoginDto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(Object.keys(dto)).toHaveLength(2);
    });
  });
});
