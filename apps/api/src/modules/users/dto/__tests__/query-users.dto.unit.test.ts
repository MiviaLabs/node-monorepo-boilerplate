/**
 * QueryUsersDto Unit Tests
 *
 * Tests DTO validation using class-validator.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - page validation (optional, number, min 1)
 * - pageSize validation (optional, number, min 1)
 * - Type transformation via class-transformer
 */

import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { QueryUsersDto } from '../query-users.dto';

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

describe('QueryUsersDto', () => {
  describe('page', () => {
    it('should accept valid page number', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: 1
      });

      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors).toHaveLength(0);
    });

    it('should accept page greater than 1', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: 10
      });

      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors).toHaveLength(0);
    });

    it('should allow missing page (optional field)', async () => {
      const errors = await validateDto(QueryUsersDto, {});

      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors).toHaveLength(0);
    });

    it('should reject page less than 1', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: 0
      });

      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative page', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: -1
      });

      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors.length).toBeGreaterThan(0);
    });

    it('should transform string to number', async () => {
      const instance = plainToInstance(QueryUsersDto, { page: '5' });
      const errors = await validate(instance);

      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors).toHaveLength(0);
      expect(instance.page).toBe(5);
    });
  });

  describe('pageSize', () => {
    it('should accept valid pageSize', async () => {
      const errors = await validateDto(QueryUsersDto, {
        pageSize: 20
      });

      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors).toHaveLength(0);
    });

    it('should accept minimum pageSize of 1', async () => {
      const errors = await validateDto(QueryUsersDto, {
        pageSize: 1
      });

      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors).toHaveLength(0);
    });

    it('should allow missing pageSize (optional field)', async () => {
      const errors = await validateDto(QueryUsersDto, {});

      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors).toHaveLength(0);
    });

    it('should reject pageSize less than 1', async () => {
      const errors = await validateDto(QueryUsersDto, {
        pageSize: 0
      });

      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors.length).toBeGreaterThan(0);
    });

    it('should reject negative pageSize', async () => {
      const errors = await validateDto(QueryUsersDto, {
        pageSize: -10
      });

      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors.length).toBeGreaterThan(0);
    });

    it('should transform string to number', async () => {
      const instance = plainToInstance(QueryUsersDto, { pageSize: '50' });
      const errors = await validate(instance);

      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors).toHaveLength(0);
      expect(instance.pageSize).toBe(50);
    });
  });

  describe('combined validation', () => {
    it('should accept empty object (all fields optional)', async () => {
      const errors = await validateDto(QueryUsersDto, {});

      expect(errors).toHaveLength(0);
    });

    it('should accept valid complete data', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: 2,
        pageSize: 25
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept only page', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: 3
      });

      expect(errors).toHaveLength(0);
    });

    it('should accept only pageSize', async () => {
      const errors = await validateDto(QueryUsersDto, {
        pageSize: 50
      });

      expect(errors).toHaveLength(0);
    });

    it('should transform both string values to numbers', async () => {
      const instance = plainToInstance(QueryUsersDto, {
        page: '3',
        pageSize: '25'
      });
      const errors = await validate(instance);

      expect(errors).toHaveLength(0);
      expect(instance.page).toBe(3);
      expect(instance.pageSize).toBe(25);
    });

    it('should reject invalid data with multiple errors', async () => {
      const errors = await validateDto(QueryUsersDto, {
        page: 0,
        pageSize: -5
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
