/**
 * Unit Tests for RegisterDto
 *
 * Tests validation for user registration.
 */

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegisterDto } from '../register.dto';

import type { ValidationError } from 'class-validator';

describe('RegisterDto', () => {
  const validateDto = async (dto: RegisterDto): Promise<ValidationError[]> => {
    const instance = plainToInstance(RegisterDto, dto);
    return validate(instance);
  };

  describe('email validation', () => {
    it('should pass with valid email', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!'
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid email', async () => {
      // Arrange
      const dto = { email: 'not-an-email', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.constraints?.['isEmail']).toBeDefined();
    });

    it('should fail with missing email', async () => {
      // Arrange
      const dto = { password: 'SecurePass123!' } as RegisterDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('password validation', () => {
    it('should pass with valid strong password', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with password less than 8 characters', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'Pass1!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.constraints?.['minLength'])).toBe(true);
    });

    it('should fail with password more than 128 characters', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'a'.repeat(129) };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.constraints?.['maxLength'])).toBe(true);
    });

    it('should fail with password missing uppercase', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'lowercase123!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.constraints?.['matches'])).toBe(true);
    });

    it('should fail with password missing lowercase', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'UPPERCASE123!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.constraints?.['matches'])).toBe(true);
    });

    it('should fail with password missing number', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'NoNumbers!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.constraints?.['matches'])).toBe(true);
    });

    it('should fail with password missing special character', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'NoSpecial123' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.constraints?.['matches'])).toBe(true);
    });

    it('should fail with missing password', async () => {
      // Arrange
      const dto = { email: 'user@example.com' } as RegisterDto;

      // Act
      const errors = await validateDto(dto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('displayName validation', () => {
    it('should pass with valid displayName', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'John Doe'
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass without displayName (optional)', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should fail with displayName less than 2 characters', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'J'
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with displayName more than 50 characters', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'A'.repeat(51)
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-string displayName', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 12345 as unknown as string
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('organizationName validation', () => {
    it('should pass with valid organizationName', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationName: 'Acme Inc'
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should trim organizationName', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationName: '  Acme Inc  '
      };

      // Act
      const instance = plainToInstance(RegisterDto, dto);
      const errors = await validate(instance);

      // Assert
      expect(errors).toHaveLength(0);
      expect(instance.organizationName).toBe('Acme Inc');
    });

    it('should fail with organizationName less than 2 characters', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationName: 'A'
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with organizationName more than 100 characters', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationName: 'a'.repeat(101)
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('organizationSlug validation', () => {
    it('should pass with valid organizationSlug', async () => {
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationSlug: 'acme-inc'
      };

      const errors = await validateDto(dto as RegisterDto);
      expect(errors).toHaveLength(0);
    });

    it('should normalize organizationSlug to lowercase and hyphenated format', async () => {
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationSlug: 'ACME INC'
      };

      const instance = plainToInstance(RegisterDto, dto);
      const errors = await validate(instance);
      expect(errors).toHaveLength(0);
      expect(instance.organizationSlug).toBe('acme-inc');
    });

    it('should fail with organizationSlug less than 4 characters', async () => {
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        organizationSlug: 'abc'
      };

      const errors = await validateDto(dto as RegisterDto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('isVerified validation', () => {
    it('should pass with isVerified true', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        isVerified: true
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with isVerified false', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        isVerified: false
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should default to true when not provided', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const instance = plainToInstance(RegisterDto, dto);

      // Assert
      expect(instance.isVerified).toBe(true);
    });

    it('should fail with non-boolean isVerified', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        isVerified: 'true' as unknown as boolean
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('isActive validation', () => {
    it('should pass with isActive true', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        isActive: true
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with isActive false', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        isActive: false
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should default to true when not provided', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const instance = plainToInstance(RegisterDto, dto);

      // Assert
      expect(instance.isActive).toBe(true);
    });

    it('should fail with non-boolean isActive', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        isActive: 'true' as unknown as boolean
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('complete registration', () => {
    it('should pass with all fields valid', async () => {
      // Arrange
      const dto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        displayName: 'John Doe',
        organizationName: 'Acme Inc',
        isVerified: true,
        isActive: true
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should pass with only required fields', async () => {
      // Arrange
      const dto = { email: 'user@example.com', password: 'SecurePass123!' };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors).toHaveLength(0);
      expect(dto.email).toBe('user@example.com');
      expect(dto.password).toBe('SecurePass123!');
    });

    it('should return multiple errors for multiple invalid fields', async () => {
      // Arrange
      const dto = {
        email: 'invalid',
        password: 'short',
        displayName: 'J',
        organizationName: 'A'
      };

      // Act
      const errors = await validateDto(dto as RegisterDto);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('cross-field validation', () => {
    describe('password strength with isVerified', () => {
      it('should require strong password when isVerified is false', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          isVerified: false
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors).toHaveLength(0);
      });

      it('should require strong password when isVerified is true', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          isVerified: true
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors).toHaveLength(0);
      });

      it('should reject weak password when isVerified is false', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'weak',
          isVerified: false
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'password')).toBe(true);
      });

      it('should reject weak password when isVerified is true', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'weak',
          isVerified: true
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'password')).toBe(true);
      });
    });

    describe('relationship between isActive and isVerified', () => {
      it('should allow isActive true and isVerified true', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          isActive: true,
          isVerified: true
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors).toHaveLength(0);
      });

      it('should allow isActive false and isVerified true', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          isActive: false,
          isVerified: true
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors).toHaveLength(0);
      });

      it('should allow isActive true and isVerified false', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          isActive: true,
          isVerified: false
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors).toHaveLength(0);
      });

      it('should allow isActive false and isVerified false', async () => {
        // Arrange
        const dto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          isActive: false,
          isVerified: false
        };

        // Act
        const errors = await validateDto(dto as RegisterDto);

        // Assert
        expect(errors).toHaveLength(0);
      });
    });
  });
});
