/**
 * Unit Tests for PaginatedResponseDto
 *
 * Tests the paginated response DTO.
 */

import { PaginatedResponseDto } from '../paginated-response.dto';

import type { PaginatedResponseMetadata, PaginationMetadata } from '../paginated-response.dto';

describe('PaginatedResponseDto', () => {
  describe('constructor', () => {
    it('should create paginated response with data and pagination metadata', () => {
      // Arrange
      const data = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ];
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 100,
        totalPages: 10,
        hasNext: true,
        hasPrevious: false
      };

      // Act
      const response = new PaginatedResponseDto(data, pagination);

      // Assert
      expect(response.data).toEqual(data);
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual(
        pagination
      );
    });

    it('should include base metadata when provided', () => {
      // Arrange
      const data = [{ id: 1 }];
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };
      const baseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123'
      };

      // Act
      const response = new PaginatedResponseDto(data, pagination, baseMetadata);

      // Assert
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual(
        pagination
      );
      expect(response.metadata?.timestamp).toBe(baseMetadata.timestamp);
      expect(response.metadata?.requestId).toBe(baseMetadata.requestId);
    });

    it('should handle empty data array', () => {
      // Arrange
      const data: readonly { id: number }[] = [];
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      };

      // Act
      const response = new PaginatedResponseDto(data, pagination);

      // Assert
      expect(response.data).toEqual([]);
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual(
        pagination
      );
    });

    it('should handle readonly array', () => {
      // Arrange
      const data = Object.freeze([{ id: 1 }, { id: 2 }]) as readonly { id: number }[];
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };

      // Act
      const response = new PaginatedResponseDto(data, pagination);

      // Assert
      expect(response.data).toEqual(data);
    });
  });

  describe('static create', () => {
    it('should create paginated response using static method', () => {
      // Arrange
      const data = [{ id: 1 }];
      const pagination: PaginationMetadata = {
        page: 2,
        pageSize: 20,
        total: 50,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true
      };

      // Act
      const response = PaginatedResponseDto.create(data, pagination);

      // Assert
      expect(response.data).toEqual(data);
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual(
        pagination
      );
    });

    it('should accept base metadata in static method', () => {
      // Arrange
      const data = [{ id: 1 }];
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };
      const baseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z'
      };

      // Act
      const response = PaginatedResponseDto.create(data, pagination, baseMetadata);

      // Assert
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual(
        pagination
      );
      expect(response.metadata?.timestamp).toBe(baseMetadata.timestamp);
    });
  });

  describe('static fromPaginatedResult', () => {
    it('should create paginated response from PaginatedResult', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }, { id: 2 }],
        meta: {
          total: 50,
          page: 2,
          limit: 20,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(response.data).toEqual(result.data);
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual({
        page: 2,
        pageSize: 20,
        total: 50,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true
      });
    });

    it('should calculate hasNext correctly', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 30,
          page: 1,
          limit: 10,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasNext
      ).toBe(true);
    });

    it('should calculate hasPrevious correctly', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 30,
          page: 2,
          limit: 10,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasPrevious
      ).toBe(true);
    });

    it('should calculate totalPages correctly', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 25,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.totalPages
      ).toBe(3);
    });

    it('should throw RangeError for invalid page number', () => {
      // Arrange
      const result = {
        data: [],
        meta: {
          total: 10,
          page: 0,
          limit: 10,
          totalPages: 1
        }
      };

      // Act & Assert
      expect(() => PaginatedResponseDto.fromPaginatedResult(result)).toThrow(RangeError);
      expect(() => PaginatedResponseDto.fromPaginatedResult(result)).toThrow(
        'Page number must be >= 1'
      );
    });

    it('should throw RangeError for invalid page size', () => {
      // Arrange
      const result = {
        data: [],
        meta: {
          total: 10,
          page: 1,
          limit: 0,
          totalPages: 1
        }
      };

      // Act & Assert
      expect(() => PaginatedResponseDto.fromPaginatedResult(result)).toThrow(RangeError);
      expect(() => PaginatedResponseDto.fromPaginatedResult(result)).toThrow(
        'Page size (limit) must be >= 1'
      );
    });

    it('should throw RangeError for negative total', () => {
      // Arrange
      const result = {
        data: [],
        meta: {
          total: -1,
          page: 1,
          limit: 10,
          totalPages: 1
        }
      };

      // Act & Assert
      expect(() => PaginatedResponseDto.fromPaginatedResult(result)).toThrow(RangeError);
      expect(() => PaginatedResponseDto.fromPaginatedResult(result)).toThrow(
        'Total count must be >= 0'
      );
    });

    it('should accept base metadata in fromPaginatedResult', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 10,
          page: 1,
          limit: 10,
          totalPages: 1
        }
      };
      const baseMetadata = {
        requestId: 'test-123'
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result, baseMetadata);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination
      ).toBeDefined();
      expect(response.metadata?.requestId).toBe('test-123');
    });
  });

  describe('static empty', () => {
    it('should create empty paginated response', () => {
      // Arrange
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      };

      // Act
      const response = PaginatedResponseDto.empty<{ id: number }>(pagination);

      // Assert
      expect(response.data).toEqual([]);
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination).toEqual(
        pagination
      );
    });

    it('should preserve generic type', () => {
      // Arrange
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      };

      // Act
      const response = PaginatedResponseDto.empty<{ id: number; name: string }>(pagination);

      // Assert
      expect(response.data).toEqual([]);
      // Type should be preserved (checked at compile time)
    });
  });

  describe('pagination metadata calculation', () => {
    it('should correctly set hasNext when more pages exist', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 30,
          page: 1,
          limit: 10,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasNext
      ).toBe(true);
    });

    it('should correctly set hasNext to false on last page', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 25,
          page: 3,
          limit: 10,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasNext
      ).toBe(false);
    });

    it('should correctly set hasPrevious when not on first page', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 30,
          page: 2,
          limit: 10,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasPrevious
      ).toBe(true);
    });

    it('should correctly set hasPrevious to false on first page', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 30,
          page: 1,
          limit: 10,
          totalPages: 3
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasPrevious
      ).toBe(false);
    });

    it('should handle single page result', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 5,
          page: 1,
          limit: 10,
          totalPages: 1
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasNext
      ).toBe(false);
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasPrevious
      ).toBe(false);
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.totalPages
      ).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle large total counts', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 1000000,
          page: 1,
          limit: 100,
          totalPages: 10000
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.total).toBe(
        1000000
      );
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.totalPages
      ).toBe(10000);
    });

    it('should handle exact division for totalPages', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 100,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.totalPages
      ).toBe(10);
    });

    it('should handle rounding up for totalPages', () => {
      // Arrange
      const result = {
        data: [{ id: 1 }],
        meta: {
          total: 101,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.totalPages
      ).toBe(11);
    });

    it('should handle zero total count', () => {
      // Arrange
      const result = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };

      // Act
      const response = PaginatedResponseDto.fromPaginatedResult(result);

      // Assert
      expect((response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.total).toBe(
        0
      );
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.totalPages
      ).toBe(0);
      expect(
        (response.metadata as PaginatedResponseMetadata | undefined)?.pagination?.hasNext
      ).toBe(false);
    });
  });

  describe('inheritance', () => {
    it('should inherit from BaseResponseDto', () => {
      // Arrange
      const data = [{ id: 1 }];
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };

      // Act
      const response = new PaginatedResponseDto(data, pagination);

      // Assert - Should have BaseResponseDto methods
      expect(response.isError).toBeInstanceOf(Function);
      expect(response.isSuccess).toBeInstanceOf(Function);
      expect(response.isSuccess()).toBe(true);
      expect(response.isError()).toBe(false);
    });
  });

  describe('readonly data', () => {
    it('should accept readonly array as data', () => {
      // Arrange
      const data: readonly { id: number }[] = Object.freeze([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const pagination: PaginationMetadata = {
        page: 1,
        pageSize: 10,
        total: 3,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      };

      // Act
      const response = new PaginatedResponseDto(data, pagination);

      // Assert
      expect(response.data).toEqual(data);
      expect(response.data.length).toBe(3);
    });
  });
});
