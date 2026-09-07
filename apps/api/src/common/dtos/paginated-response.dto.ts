import { BaseResponseDto } from './base-response.dto';

import type { ResponseMetadata } from './base-response.dto';

/**
 * Pagination metadata interface
 */
export interface PaginationMetadata {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Extended metadata with pagination info
 */
export interface PaginatedResponseMetadata extends ResponseMetadata {
  pagination?: PaginationMetadata;
}

/**
 * Paginated response DTO for list endpoints
 *
 * @template T - The type of items in the data array
 *
 * @example
 * ```typescript
 * // In a query handler
 * return new PaginatedResponseDto(
 *   users,
 *   {
 *     page: 1,
 *     pageSize: 10,
 *     total: 100,
 *     totalPages: 10,
 *     hasNext: true,
 *     hasPrevious: false,
 *   }
 * );
 * ```
 */
export class PaginatedResponseDto<T> extends BaseResponseDto<readonly T[]> {
  // Note: We don't redeclare 'data' or 'metadata' properties here to avoid shadowing
  // the parent class properties. When a child class redeclares a property with the
  // same name as the parent, TypeScript/JavaScript initializes it to 'undefined'
  // after the super() call, which overwrites any value set by the parent constructor.
  //
  // The 'data' property is inherited from BaseResponseDto<readonly T[]>
  // The 'metadata' property is inherited from BaseResponseDto
  //
  // At runtime, metadata will be PaginatedResponseMetadata with pagination property,
  // but TypeScript types it as ResponseMetadata. Use type assertions in tests.
  //
  // See: https://github.com/microsoft/TypeScript/issues/39409

  constructor(data: readonly T[], pagination: PaginationMetadata, baseMetadata?: ResponseMetadata) {
    super(data, {
      ...baseMetadata,
      pagination
    } as PaginatedResponseMetadata);
  }

  /**
   * Create a paginated response
   */
  static create<T>(
    data: readonly T[],
    pagination: PaginationMetadata,
    baseMetadata?: ResponseMetadata
  ): PaginatedResponseDto<T> {
    return new PaginatedResponseDto(data, pagination, baseMetadata);
  }

  /**
   * Create a paginated response from PaginatedResult
   */
  static fromPaginatedResult<T>(
    result: {
      data: readonly T[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    },
    baseMetadata?: ResponseMetadata
  ): PaginatedResponseDto<T> {
    const { data, meta } = result;

    // Validate pagination bounds
    if (meta.page < 1) {
      throw new RangeError('Page number must be >= 1');
    }
    if (meta.limit < 1) {
      throw new RangeError('Page size (limit) must be >= 1');
    }
    if (meta.total < 0) {
      throw new RangeError('Total count must be >= 0');
    }

    const totalPages = Math.ceil(meta.total / meta.limit);

    return new PaginatedResponseDto(
      data,
      {
        page: meta.page,
        pageSize: meta.limit,
        total: meta.total,
        totalPages,
        hasNext: meta.page < totalPages,
        hasPrevious: meta.page > 1
      },
      baseMetadata
    );
  }

  /**
   * Create an empty paginated response
   */
  static empty<T>(pagination: PaginationMetadata): PaginatedResponseDto<T> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return new PaginatedResponseDto([], pagination);
  }
}
