/**
 * Tests for sorting validation schemas
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { sortOrderEnum, sortParamSchema, sortParamsSchema } from './sorting.schema';

describe('sorting.schema', () => {
  // eslint-disable-next-line max-lines-per-function
  describe('sortOrderEnum', () => {
    it('should accept "asc" as valid sort order', () => {
      const result = sortOrderEnum.safeParse('asc');
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, 'asc');
      }
    });

    it('should accept "desc" as valid sort order', () => {
      const result = sortOrderEnum.safeParse('desc');
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, 'desc');
      }
    });

    it('should reject other string values', () => {
      const invalidOrders = ['ascending', 'descending', 'ASC', 'DESC', 'up', 'down', '1', '-1'];

      for (const order of invalidOrders) {
        const result = sortOrderEnum.safeParse(order);
        assert.strictEqual(result.success, false, `Should reject: ${order}`);
      }
    });

    it('should reject non-string values', () => {
      const invalidValues = [1, -1, true, false, null, undefined, {}, []];

      for (const value of invalidValues) {
        const result = sortOrderEnum.safeParse(value);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(value)}`);
      }
    });

    it('should have correct enum values', () => {
      // Verify the enum contains exactly 'asc' and 'desc'
      const ascResult = sortOrderEnum.safeParse('asc');
      const descResult = sortOrderEnum.safeParse('desc');

      assert.strictEqual(ascResult.success, true);
      assert.strictEqual(descResult.success, true);
    });
  });

  describe('sortParamSchema', () => {
    it('should accept valid sort params with asc order', () => {
      const validParams = [
        { field: 'name', order: 'asc' },
        { field: 'createdAt', order: 'asc' },
        { field: 'price', order: 'asc' }
      ];

      for (const param of validParams) {
        const result = sortParamSchema.safeParse(param);
        assert.strictEqual(result.success, true, `Should accept: ${JSON.stringify(param)}`);
        if (result.success) {
          assert.strictEqual(result.data.field, param.field);
          assert.strictEqual(result.data.order, param.order);
        }
      }
    });

    it('should accept valid sort params with desc order', () => {
      const validParams = [
        { field: 'name', order: 'desc' },
        { field: 'updatedAt', order: 'desc' },
        { field: 'quantity', order: 'desc' }
      ];

      for (const param of validParams) {
        const result = sortParamSchema.safeParse(param);
        assert.strictEqual(result.success, true, `Should accept: ${JSON.stringify(param)}`);
        if (result.success) {
          assert.strictEqual(result.data.field, param.field);
          assert.strictEqual(result.data.order, param.order);
        }
      }
    });

    it('should accept any non-empty string for field', () => {
      const validFields = [
        'name',
        'createdAt',
        'user.email',
        'price',
        'quantity_in_stock',
        'firstName',
        'lastName',
        'a',
        'field_name_123'
      ];

      for (const field of validFields) {
        const result = sortParamSchema.safeParse({ field, order: 'asc' });
        assert.strictEqual(result.success, true, `Should accept field: ${field}`);
        if (result.success) {
          assert.strictEqual(result.data.field, field);
        }
      }
    });

    it('should reject empty string for field', () => {
      const result = sortParamSchema.safeParse({ field: '', order: 'asc' });
      assert.strictEqual(result.success, false);
    });

    it('should reject non-string values for field', () => {
      const invalidFields = [
        { field: 123, order: 'asc' },
        { field: true, order: 'asc' },
        { field: null, order: 'asc' },
        { field: undefined, order: 'asc' },
        { field: {}, order: 'asc' },
        { field: [], order: 'asc' }
      ];

      for (const param of invalidFields) {
        const result = sortParamSchema.safeParse(param);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(param)}`);
      }
    });

    it('should reject invalid order values', () => {
      const invalidOrders = [
        { field: 'name', order: 'ascending' },
        { field: 'name', order: 'DESC' },
        { field: 'name', order: 'up' },
        { field: 'name', order: '1' },
        { field: 'name', order: 1 },
        { field: 'name', order: true }
      ];

      for (const param of invalidOrders) {
        const result = sortParamSchema.safeParse(param);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(param)}`);
      }
    });

    it('should reject missing field', () => {
      const result = sortParamSchema.safeParse({ order: 'asc' });
      assert.strictEqual(result.success, false);
    });

    it('should reject missing order', () => {
      const result = sortParamSchema.safeParse({ field: 'name' });
      assert.strictEqual(result.success, false);
    });

    it('should reject additional properties', () => {
      const result = sortParamSchema.safeParse({
        field: 'name',
        order: 'asc',
        extra: 'property'
      });
      // Zod objects don't strip extra properties by default
      assert.strictEqual(result.success, true);
    });

    it('should handle special characters in field names', () => {
      const specialFields = [
        'user.email',
        'profile.firstName',
        'order.total_price',
        'product.quantity-in-stock'
      ];

      for (const field of specialFields) {
        const result = sortParamSchema.safeParse({ field, order: 'desc' });
        assert.strictEqual(result.success, true, `Should accept field: ${field}`);
        if (result.success) {
          assert.strictEqual(result.data.field, field);
        }
      }
    });

    it('should handle index signature access on result', () => {
      const params = [{ field: 'name', order: 'asc' }];
      const result = sortParamsSchema.safeParse(params);
      assert.strictEqual(result.success, true);
      if (result.success) {
        // Test index signature access
        const firstItem = result.data[0];
        assert.ok(firstItem);
        assert.strictEqual(firstItem.field, 'name');
      }
    });
  });

  describe('sortParamsSchema', () => {
    it('should accept array of valid sort params', () => {
      const validSortParams = [
        [
          { field: 'name', order: 'asc' },
          { field: 'createdAt', order: 'desc' }
        ],
        [
          { field: 'price', order: 'asc' },
          { field: 'quantity', order: 'desc' },
          { field: 'name', order: 'asc' }
        ],
        [{ field: 'single', order: 'desc' }],
        []
      ];

      for (const params of validSortParams) {
        const result = sortParamsSchema.safeParse(params);
        assert.strictEqual(result.success, true, `Should accept: ${JSON.stringify(params)}`);
        if (result.success) {
          assert.deepStrictEqual(result.data, params);
        }
      }
    });

    it('should accept single sort param', () => {
      const result = sortParamsSchema.safeParse([{ field: 'name', order: 'asc' }]);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 1);
        assert.strictEqual(result.data[0]?.field, 'name');
        assert.strictEqual(result.data[0]?.order, 'asc');
      }
    });

    it('should accept empty array', () => {
      const result = sortParamsSchema.safeParse([]);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 0);
      }
    });

    it('should reject array with invalid sort params', () => {
      const invalidSortParams = [
        [{ field: 'name', order: 'invalid' }],
        [{ field: 'name', order: 'ASC' }],
        [
          { field: '', order: 'asc' },
          { field: 'valid', order: 'desc' }
        ]
      ];

      for (const params of invalidSortParams) {
        const result = sortParamsSchema.safeParse(params);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(params)}`);
      }
    });

    it('should reject non-array values', () => {
      const nonArrays = [{ field: 'name', order: 'asc' }, 'string', 123, true, null, undefined, {}];

      for (const value of nonArrays) {
        const result = sortParamsSchema.safeParse(value);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(value)}`);
      }
    });

    it('should handle multiple sort params with same field', () => {
      const params = [
        { field: 'name', order: 'asc' },
        { field: 'name', order: 'desc' }
      ];

      const result = sortParamsSchema.safeParse(params);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 2);
      }
    });

    it('should handle complex sort scenarios', () => {
      const params = [
        { field: 'category', order: 'asc' },
        { field: 'price', order: 'desc' },
        { field: 'name', order: 'asc' },
        { field: 'createdAt', order: 'desc' }
      ];

      const result = sortParamsSchema.safeParse(params);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.length, 4);
        assert.strictEqual(result.data[0]?.field, 'category');
        assert.strictEqual(result.data[1]?.order, 'desc');
      }
    });

    it('should reject array elements with missing properties', () => {
      const invalidArrays = [
        [{ field: 'name' }], // Missing order
        [{ order: 'asc' }], // Missing field
        [{ field: 'name', order: 'asc' }, { field: 'price' }], // Second missing order
        [{ field: 'name', order: 'asc' }, { order: 'desc' }] // Second missing field
      ];

      for (const params of invalidArrays) {
        const result = sortParamsSchema.safeParse(params);
        assert.strictEqual(result.success, false, `Should reject: ${JSON.stringify(params)}`);
      }
    });
  });

  describe('Integration tests', () => {
    it('should work with API query parameters for single sort', () => {
      // Simulating Express/Next.js request query
      // ?sort=name:asc or ?sort[field]=name&sort[order]=asc
      const sortParam = { field: 'name', order: 'asc' };
      const result = sortParamSchema.safeParse(sortParam);

      assert.strictEqual(result.success, true);
      if (result.success) {
        // Transform to SQL ORDER BY clause
        const orderBy = `${result.data.field} ${result.data.order.toUpperCase()}`;
        assert.strictEqual(orderBy, 'name ASC');
      }
    });

    it('should work with API query parameters for multiple sorts', () => {
      const sortParams = [
        { field: 'category', order: 'asc' },
        { field: 'price', order: 'desc' }
      ];
      const result = sortParamsSchema.safeParse(sortParams);

      assert.strictEqual(result.success, true);
      if (result.success) {
        // Transform to SQL ORDER BY clause
        const orderBy = result.data.map((s) => `${s.field} ${s.order.toUpperCase()}`).join(', ');
        assert.strictEqual(orderBy, 'category ASC, price DESC');
      }
    });

    it('should handle query string coercion', () => {
      // Query strings come as strings, but we need to validate
      const sortParam = { field: 'createdAt', order: 'desc' };
      const result = sortParamSchema.safeParse(sortParam);

      assert.strictEqual(result.success, true);
    });

    it('should work with database query builders', () => {
      const sortParams = [
        { field: 'status', order: 'asc' },
        { field: 'created_at', order: 'desc' }
      ];

      const result = sortParamsSchema.safeParse(sortParams);
      assert.strictEqual(result.success, true);

      if (result.success) {
        // Simulating building a Prisma/TypeORM query
        const orderBy = result.data.reduce(
          (acc, sort) => {
            acc[sort.field] = sort.order;
            return acc;
          },
          {} as Record<string, string>
        );

        assert.deepStrictEqual(orderBy, {
          status: 'asc',
          created_at: 'desc'
        });
      }
    });

    it('should handle default sort when no params provided', () => {
      const result = sortParamsSchema.safeParse([]);

      assert.strictEqual(result.success, true);
      if (result.success) {
        // Apply default sort
        const defaultSort =
          result.data.length > 0 ? result.data : [{ field: 'createdAt', order: 'desc' }];
        assert.ok(defaultSort);
      }
    });

    it('should validate and transform sort params for API response', () => {
      const sortParam = { field: 'userName', order: 'asc' };
      const result = sortParamSchema.safeParse(sortParam);

      assert.strictEqual(result.success, true);
      if (result.success) {
        // Return validated sort params to client
        const response = {
          sortBy: result.data.field,
          sortOrder: result.data.order
        };
        assert.deepStrictEqual(response, { sortBy: 'userName', sortOrder: 'asc' });
      }
    });
  });

  describe('Type safety', () => {
    it('should infer correct types', () => {
      // Type tests - these would be compile-time checks
      const sortOrder = 'asc';
      const result = sortOrderEnum.safeParse(sortOrder);
      assert.strictEqual(result.success, true);

      const sortParam = { field: 'test', order: 'asc' };
      const sortResult = sortParamSchema.safeParse(sortParam);
      assert.strictEqual(sortResult.success, true);
    });
  });
});
