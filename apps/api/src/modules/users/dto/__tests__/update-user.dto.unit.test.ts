/**
 * UpdateUserDto Unit Tests
 *
 * Tests DTO validation using class-validator.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - isActive validation (optional, boolean)
 * - isVerified validation (optional, boolean)
 * - Empty object validation (all fields optional)
 */

import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateUserDto } from '../update-user.dto';

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

describe('UpdateUserDto', () => {
  describe('isActive', () => {
    it('should accept true', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: true
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors).toHaveLength(0);
    });

    it('should accept false', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: false
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors).toHaveLength(0);
    });

    it('should allow missing isActive (optional field)', async () => {
      const errors = await validateDto(UpdateUserDto, {});

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors).toHaveLength(0);
    });

    it('should reject non-boolean value', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: 'true'
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors.length).toBeGreaterThan(0);
    });

    it('should reject numeric value', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: 1
      });

      const isActiveErrors = errors.filter((e) => e.property === 'isActive');
      expect(isActiveErrors.length).toBeGreaterThan(0);
    });
  });

  describe('isVerified', () => {
    it('should accept true', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isVerified: true
      });

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors).toHaveLength(0);
    });

    it('should accept false', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isVerified: false
      });

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors).toHaveLength(0);
    });

    it('should allow missing isVerified (optional field)', async () => {
      const errors = await validateDto(UpdateUserDto, {});

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors).toHaveLength(0);
    });

    it('should reject non-boolean value', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isVerified: 'false'
      });

      const isVerifiedErrors = errors.filter((e) => e.property === 'isVerified');
      expect(isVerifiedErrors.length).toBeGreaterThan(0);
    });
  });

  describe('combined validation', () => {
    it('should accept empty object (all fields optional)', async () => {
      const errors = await validateDto(UpdateUserDto, {});

      expect(errors).toHaveLength(0);
    });

    it('should accept valid complete data', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: true,
        isVerified: false
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept partial update with only isActive', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: false
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept partial update with only isVerified', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isVerified: true
      });

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid data with multiple errors', async () => {
      const errors = await validateDto(UpdateUserDto, {
        isActive: 'invalid',
        isVerified: 'invalid'
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
