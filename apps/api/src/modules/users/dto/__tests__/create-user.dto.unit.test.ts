/**
 * CreateUserDto Unit Tests
 *
 * Tests DTO validation using class-validator.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - isActive validation (optional, boolean)
 * - isVerified validation (optional, boolean)
 */

import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateUserDto } from '../create-user.dto';

import type { ValidationError } from 'class-validator';

/**
 * Helper function to validate DTO and return errors
 */
async function validateDto<T extends object>(
  DtoClass: new () => T,
  data: Record<string, unknown>
): Promise<ValidationError[]> {
  const instance = plainToInstance(DtoClass, data);
  return validate(instance);
}

describe('CreateUserDto', () => {
  describe('isActive', () => {
    it('should accept true', async () => {
      const errors = await validateDto(CreateUserDto, {
        isActive: true
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors).toHaveLength(0);
    });

    it('should accept false', async () => {
      const errors = await validateDto(CreateUserDto, {
        isActive: false
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors).toHaveLength(0);
    });

    it('should allow missing isActive (optional field)', async () => {
      const errors = await validateDto(CreateUserDto, {});

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors).toHaveLength(0);
    });

    it('should reject non-boolean value', async () => {
      const errors = await validateDto(CreateUserDto, {
        isActive: 'true'
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors.length).toBeGreaterThan(0);
    });

    it('should reject numeric value', async () => {
      const errors = await validateDto(CreateUserDto, {
        isActive: 1
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors.length).toBeGreaterThan(0);
    });
  });

  describe('isVerified', () => {
    it('should accept true', async () => {
      const errors = await validateDto(CreateUserDto, {
        isVerified: true
      });

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors).toHaveLength(0);
    });

    it('should accept false', async () => {
      const errors = await validateDto(CreateUserDto, {
        isVerified: false
      });

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors).toHaveLength(0);
    });

    it('should allow missing isVerified (optional field)', async () => {
      const errors = await validateDto(CreateUserDto, {});

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors).toHaveLength(0);
    });

    it('should reject non-boolean value', async () => {
      const errors = await validateDto(CreateUserDto, {
        isVerified: 'false'
      });

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors.length).toBeGreaterThan(0);
    });
  });

  describe('combined validation', () => {
    it('should accept valid complete data', async () => {
      const errors = await validateDto(CreateUserDto, {
        isActive: true,
        isVerified: false
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept minimal valid data (all fields omitted)', async () => {
      const errors = await validateDto(CreateUserDto, {});

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid data with multiple errors', async () => {
      const errors = await validateDto(CreateUserDto, {
        isActive: 'invalid',
        isVerified: 'invalid'
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
