/**
 * Unit Tests for LoginWithPhoneDto
 *
 * Tests validation for phone number authentication.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginWithPhoneDto } from '../login-with-phone.dto';

import type { ValidationError } from 'class-validator';

describe('LoginWithPhoneDto', () => {
  const validateDto = async (dto: LoginWithPhoneDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(LoginWithPhoneDto, dto);
    return validate(instance);
  };

  describe('phoneNumber validation', () => {
    it('should pass with valid phone number', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: '123456'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with phone number in E.164 format', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+442071234567',
        verificationCode: '654321'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing phoneNumber', async () => {
      // Arrange
      const dto = { verificationCode: '123456' } as LoginWithPhoneDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-string phoneNumber', async () => {
      // Arrange
      const dto = {
        phoneNumber: 1234567890 as unknown as string,
        verificationCode: '123456'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('verificationCode validation', () => {
    it('should pass with valid verification code', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: '123456'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with numeric verification code', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: '999999'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with short verification code', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: '1234'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with alphanumeric verification code', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: 'ABC123'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing verificationCode', async () => {
      // Arrange
      const dto = { phoneNumber: '+1234567890' } as LoginWithPhoneDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-string verificationCode', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: 123456 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('complete phone login', () => {
    it('should pass with both fields valid', async () => {
      // Arrange
      const dto = {
        phoneNumber: '+14155552671',
        verificationCode: '123456'
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for multiple invalid fields', async () => {
      // Arrange
      const dto = {
        phoneNumber: 123 as unknown as string,
        verificationCode: 456 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as LoginWithPhoneDto);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
