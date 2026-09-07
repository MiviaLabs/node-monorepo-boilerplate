/**
 * Tests for pagination validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { paginationParamsSchema, cursorPaginationSchema } from './pagination.schema';

describe('pagination.schema', () => {
  // eslint-disable-next-line max-lines-per-function
  describe('paginationParamsSchema', () => {
    it('should accept valid pagination params', () => {
      const validParams = [
        { page: 1, limit: 10 },
        { page: 2, limit: 20 },
        { page: 100, limit: 50 },
        { page: 1, limit: 100 }
      ];

      for (const params of validParams) {
        const result = paginationParamsSchema.safeParse(params);
        assert.strictEqual(result.success, true, `Should accept: ${JSON.stringify(params)}`);
        if (result.success) {
          assert.strictEqual(result.data.page, params.page);
          assert.strictEqual(result.data.limit, params.limit);
        }
      }
    });

    it('should coerce string numbers to integers', () => {
      const testCases = [
        { input: { page: '1', limit: '10' }, expected: { page: 1, limit: 10 } },
        { input: { page: '5', limit: '25' }, expected: { page: 5, limit: 25 } }
      ];

      for (const { input, expected } of testCases) {
        const result = paginationParamsSchema.safeParse(input);
        assert.strictEqual(result.success, true);
        if (result.success) {
          assert.strictEqual(result.data.page, expected.page);
          assert.strictEqual(result.data.limit, expected.limit);
          assert.strictEqual(typeof result.data.page, 'number');
          assert.strictEqual(typeof result.data.limit, 'number');
        }
      }
    });

    it('should use default values when params are missing', () => {
      const result = paginationParamsSchema.safeParse({});
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.page, 1);
        assert.strictEqual(result.data.limit, 20);
      }
    });

    it('should use default value for page when missing', () => {
      const result = paginationParamsSchema.safeParse({ limit: 50 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.page, 1);
        assert.strictEqual(result.data.limit, 50);
      }
    });

    it('should use default value for limit when missing', () => {
      const result = paginationParamsSchema.safeParse({ page: 5 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.page, 5);
        assert.strictEqual(result.data.limit, 20);
      }
    });

    it('should reject page value of 0', () => {
      const result = paginationParamsSchema.safeParse({ page: 0, limit: 10 });
      assert.strictEqual(result.success, false);
    });

    it('should reject page value of "0" (string-coerced to 0)', () => {
      const result = paginationParamsSchema.safeParse({ page: '0', limit: 10 });
      assert.strictEqual(result.success, false);
    });

    it('should reject negative page values', () => {
      const result = paginationParamsSchema.safeParse({ page: -1, limit: 10 });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit value of 0', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: 0 });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit value of "0" (string-coerced to 0)', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: '0' });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit value of "200" (string-coerced past 100)', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: '200' });
      assert.strictEqual(result.success, false);
    });

    it('should reject negative limit values', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: -10 });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit values greater than 100', () => {
      const invalidLimits = [101, 150, 1000, 999999];

      for (const limit of invalidLimits) {
        const result = paginationParamsSchema.safeParse({ page: 1, limit });
        assert.strictEqual(result.success, false, `Should reject limit: ${limit}`);
      }
    });

    it('should accept limit value of exactly 100', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: 100 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.limit, 100);
      }
    });

    it('should accept limit value of exactly 1', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: 1 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.limit, 1);
      }
    });

    it('should reject decimal page values', () => {
      const result = paginationParamsSchema.safeParse({ page: 1.5, limit: 10 });
      assert.strictEqual(result.success, false);
    });

    it('should reject decimal limit values', () => {
      const result = paginationParamsSchema.safeParse({ page: 1, limit: 10.5 });
      assert.strictEqual(result.success, false);
    });

    it('should reject non-numeric values', () => {
      const invalidParams = [
        { page: 'abc', limit: 10 },
        { page: 1, limit: 'xyz' },
        { page: null, limit: 10 },
        { page: true, limit: 10 },
        { page: 1, limit: false }
      ];

      for (const params of invalidParams) {
        const result = paginationParamsSchema.safeParse(params);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(params)}`);
      }
    });

    it('should work with query string parameters', () => {
      // Simulating query string params which are strings
      const queryParams = { page: '3', limit: '15' };
      const result = paginationParamsSchema.safeParse(queryParams);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.page, 3);
        assert.strictEqual(result.data.limit, 15);
      }
    });

    it('should handle empty query string with defaults', () => {
      const queryParams = {};
      const result = paginationParamsSchema.safeParse(queryParams);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.page, 1);
        assert.strictEqual(result.data.limit, 20);
      }
    });
  });

  describe('cursorPaginationSchema', () => {
    it('should accept valid cursor pagination params', () => {
      const validParams = [
        { cursor: 'abc123', limit: 10 },
        { cursor: 'xyz789', limit: 50 },
        { cursor: null, limit: 20 }
      ];

      for (const params of validParams) {
        const result = cursorPaginationSchema.safeParse(params);
        assert.strictEqual(result.success, true, `Should accept: ${JSON.stringify(params)}`);
        if (result.success) {
          assert.strictEqual(result.data.cursor, params.cursor);
          assert.strictEqual(result.data.limit, params.limit);
        }
      }
    });

    it('should accept string cursor values', () => {
      const validCursors = [
        'abc123',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        '550e8400-e29b-41d4-a716-446655440000',
        '1',
        'page_token_abc'
      ];

      for (const cursor of validCursors) {
        const result = cursorPaginationSchema.safeParse({ cursor, limit: 10 });
        assert.strictEqual(result.success, true, `Should accept cursor: ${cursor}`);
        if (result.success) {
          assert.strictEqual(result.data.cursor, cursor);
        }
      }
    });

    it('should accept null cursor values', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: null, limit: 10 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.cursor, null);
      }
    });

    it('should coerce string numbers to integers for limit', () => {
      const testCases = [
        { input: { cursor: 'abc123', limit: '10' }, expected: { cursor: 'abc123', limit: 10 } },
        { input: { cursor: null, limit: '25' }, expected: { cursor: null, limit: 25 } }
      ];

      for (const { input, expected } of testCases) {
        const result = cursorPaginationSchema.safeParse(input);
        assert.strictEqual(result.success, true);
        if (result.success) {
          assert.strictEqual(result.data.cursor, expected.cursor);
          assert.strictEqual(result.data.limit, expected.limit);
          assert.strictEqual(typeof result.data.limit, 'number');
        }
      }
    });

    it('should use default value for limit when missing', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123' });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.limit, 20);
      }
    });

    it('should use default value for limit when cursor is missing', () => {
      const result = cursorPaginationSchema.safeParse({});
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.cursor, null);
        assert.strictEqual(result.data.limit, 20);
      }
    });

    it('should reject limit value of 0', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: 0 });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit value of "0" (string-coerced to 0)', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: '0' });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit value of "200" (string-coerced past 100)', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: '200' });
      assert.strictEqual(result.success, false);
    });

    it('should reject negative limit values', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: -10 });
      assert.strictEqual(result.success, false);
    });

    it('should reject limit values greater than 100', () => {
      const invalidLimits = [101, 150, 1000];

      for (const limit of invalidLimits) {
        const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit });
        assert.strictEqual(result.success, false, `Should reject limit: ${limit}`);
      }
    });

    it('should accept limit value of exactly 100', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: 100 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.limit, 100);
      }
    });

    it('should accept limit value of exactly 1', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: 1 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.limit, 1);
      }
    });

    it('should reject decimal limit values', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: 'abc123', limit: 10.5 });
      assert.strictEqual(result.success, false);
    });

    it('should reject non-string cursor values (except null)', () => {
      const invalidCursors = [
        { cursor: 123, limit: 10 },
        { cursor: true, limit: 10 },
        { cursor: {}, limit: 10 },
        { cursor: [], limit: 10 }
      ];

      for (const params of invalidCursors) {
        const result = cursorPaginationSchema.safeParse(params);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(params)}`);
      }
    });

    it('should reject non-numeric limit values', () => {
      const invalidParams = [
        { cursor: 'abc123', limit: 'xyz' },
        { cursor: null, limit: true }
      ];

      for (const params of invalidParams) {
        const result = cursorPaginationSchema.safeParse(params);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(params)}`);
      }
    });

    it('should handle empty string cursor', () => {
      const result = cursorPaginationSchema.safeParse({ cursor: '', limit: 10 });
      // Empty string is still a string, so it should be accepted
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.cursor, '');
      }
    });

    it('should work with query string parameters', () => {
      const queryParams = { cursor: 'abc123', limit: '15' };
      const result = cursorPaginationSchema.safeParse(queryParams);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.cursor, 'abc123');
        assert.strictEqual(result.data.limit, 15);
      }
    });

    it('should handle query string without cursor', () => {
      const queryParams = { limit: '25' };
      const result = cursorPaginationSchema.safeParse(queryParams);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.cursor, null);
        assert.strictEqual(result.data.limit, 25);
      }
    });
  });

  describe('Integration tests', () => {
    it('should work with API route handlers (paginationParamsSchema)', () => {
      // Simulating Express/Next.js request query
      const reqQuery = { page: '2', limit: '50' };
      const result = paginationParamsSchema.safeParse(reqQuery);

      assert.strictEqual(result.success, true);
      if (result.success) {
        const { page, limit } = result.data;
        assert.strictEqual(page, 2);
        assert.strictEqual(limit, 50);

        // Calculate offset for database query
        const offset = (page - 1) * limit;
        assert.strictEqual(offset, 50);
      }
    });

    it('should work with API route handlers (cursorPaginationSchema)', () => {
      const reqQuery = { cursor: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', limit: '20' };
      const result = cursorPaginationSchema.safeParse(reqQuery);

      assert.strictEqual(result.success, true);
      if (result.success) {
        const { cursor, limit } = result.data;
        assert.strictEqual(typeof cursor, 'string');
        assert.strictEqual(limit, 20);
      }
    });

    it('should handle first page with defaults', () => {
      const result = paginationParamsSchema.safeParse({});

      assert.strictEqual(result.success, true);
      if (result.success) {
        const { page, limit } = result.data;
        assert.strictEqual(page, 1);
        assert.strictEqual(limit, 20);
      }
    });

    it('should handle first page with cursor pagination', () => {
      const result = cursorPaginationSchema.safeParse({});

      assert.strictEqual(result.success, true);
      if (result.success) {
        const { cursor, limit } = result.data;
        assert.strictEqual(cursor, null);
        assert.strictEqual(limit, 20);
      }
    });
  });
});
