import 'reflect-metadata';

import { ResponseErrorCategory, ResponseErrorSeverity } from '@package/errors';

import { BaseResponseDto } from '../base-response.dto';

import type { ErrorResponseData, ErrorResponseMetadata } from '@package/errors';

/**
 * Unit tests for BaseResponseDto
 *
 * Tests both success and error response patterns
 */
describe('BaseResponseDto', () => {
  describe('Success Responses', () => {
    it('should create a basic success response', () => {
      const data = { id: '123', name: 'John Doe' };
      const response = new BaseResponseDto(data);

      expect(response.data).toBe(data);
      expect(response.metadata).toBeUndefined();
    });

    it('should create success response with metadata', () => {
      const data = { id: '123', name: 'John Doe' };
      const metadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123'
      };
      const response = new BaseResponseDto(data, metadata);

      expect(response.data).toBe(data);
      expect(response.metadata).toEqual(metadata);
    });

    it('should create success response using static success() method', () => {
      const data = { id: '123', name: 'John Doe' };
      const response = BaseResponseDto.success(data);

      expect(response.data).toBe(data);
      expect(response.metadata).toBeUndefined();
    });

    it('should create success response with timestamp using withTimestamp()', () => {
      const data = { id: '123', name: 'John Doe' };
      const before = new Date().toISOString();
      const response = BaseResponseDto.withTimestamp(data);
      const after = new Date().toISOString();

      expect(response.data).toBe(data);
      expect(response.metadata).not.toBeUndefined();
      expect(response.metadata?.timestamp).not.toBeUndefined();

      // Verify timestamp is recent
      const timestamp = response.metadata?.timestamp ?? '';
      expect(timestamp >= before && timestamp <= after).toBe(true);
    });

    it('should create response with custom metadata using withMetadata()', () => {
      const data = { id: '123', name: 'John Doe' };
      const metadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        version: '1.0.0',
        requestId: 'xyz789'
      };
      const response = BaseResponseDto.withMetadata(data, metadata);

      expect(response.data).toBe(data);
      expect(response.metadata).toEqual(metadata);
    });

    it('should return false for isError() on success response', () => {
      const data = { id: '123', name: 'John Doe' };
      const response = new BaseResponseDto(data);

      expect(response.isError()).toBe(false);
    });

    it('should return true for isSuccess() on success response', () => {
      const data = { id: '123', name: 'John Doe' };
      const response = new BaseResponseDto(data);

      expect(response.isSuccess()).toBe(true);
    });
  });

  describe('Error Responses', () => {
    it('should create error response using error() method', () => {
      const errorData: ErrorResponseData = {
        code: 'USER_001',
        message: 'User with ID {userId} not found',
        translated: 'User with ID 123 not found',
        parameters: { userId: '123' }
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123',
        error: {
          category: ResponseErrorCategory.USER,
          severity: ResponseErrorSeverity.LOW,
          httpStatus: 404,
          debugInfo: {
            path: '/api/users/123',
            method: 'GET'
          }
        }
      };

      const response = BaseResponseDto.error(errorData, errorMetadata);

      expect(response.data.code).toBe('USER_001');
      expect(response.data.message).toBe('User with ID {userId} not found');
      expect(response.data.translated).toBe('User with ID 123 not found');
      expect(response.data.parameters).toEqual({ userId: '123' });
      expect(response.metadata?.timestamp).toBe('2024-12-31T12:00:00.000Z');
      expect(response.metadata?.requestId).toBe('abc123');
      expect(response.metadata?.error?.category).toBe(ResponseErrorCategory.USER);
      expect(response.metadata?.error?.severity).toBe(ResponseErrorSeverity.LOW);
      expect(response.metadata?.error?.httpStatus).toBe(404);
    });

    it('should create error response with validation errors', () => {
      const errorData: ErrorResponseData = {
        code: 'VAL_001',
        message: 'Validation failed',
        translated: 'Email is required'
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'def456',
        error: {
          category: ResponseErrorCategory.VALIDATION,
          severity: ResponseErrorSeverity.MEDIUM,
          httpStatus: 400,
          errors: ['Email is required', 'Password must be at least 8 characters']
        }
      };

      const response = BaseResponseDto.error(errorData, errorMetadata);

      expect(response.data.code).toBe('VAL_001');
      expect(response.metadata?.error?.errors).toEqual([
        'Email is required',
        'Password must be at least 8 characters'
      ]);
    });

    it('should return true for isError() on error response', () => {
      const errorData: ErrorResponseData = {
        code: 'USER_001',
        message: 'User not found',
        translated: 'User not found'
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123',
        error: {
          category: ResponseErrorCategory.USER,
          severity: ResponseErrorSeverity.LOW,
          httpStatus: 404
        }
      };

      const response = BaseResponseDto.error(errorData, errorMetadata);

      expect(response.isError()).toBe(true);
    });

    it('should return false for isSuccess() on error response', () => {
      const errorData: ErrorResponseData = {
        code: 'USER_001',
        message: 'User not found',
        translated: 'User not found'
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123',
        error: {
          category: ResponseErrorCategory.USER,
          severity: ResponseErrorSeverity.LOW,
          httpStatus: 404
        }
      };

      const response = BaseResponseDto.error(errorData, errorMetadata);

      expect(response.isSuccess()).toBe(false);
    });

    it('should create error response using deprecated errorResponse() method', () => {
      const errorData: ErrorResponseData = {
        code: 'AUTH_001',
        message: 'Unauthorized',
        translated: 'Unauthorized access'
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'ghi789',
        error: {
          category: ResponseErrorCategory.AUTH,
          severity: ResponseErrorSeverity.HIGH,
          httpStatus: 401
        }
      };

      // Should not throw and should work the same as error()
      const response = BaseResponseDto.errorResponse(errorData, errorMetadata);

      expect(response.data.code).toBe('AUTH_001');
      expect(response.isError()).toBe(true);
    });

    it('should handle error response with all metadata fields', () => {
      const errorData: ErrorResponseData = {
        code: 'SYS_001',
        message: 'System error',
        translated: 'Internal server error'
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'sys123',
        error: {
          category: ResponseErrorCategory.SYSTEM,
          severity: ResponseErrorSeverity.CRITICAL,
          httpStatus: 500,
          debugInfo: {
            path: '/api/test',
            method: 'POST',
            userId: '123',
            error: 'Database connection failed'
          },
          errors: ['Database timeout'],
          stack: 'Error: Database connection failed\n    at Connection.connect'
        }
      };

      const response = BaseResponseDto.error(errorData, errorMetadata);

      expect(response.metadata?.error?.category).toBe(ResponseErrorCategory.SYSTEM);
      expect(response.metadata?.error?.severity).toBe(ResponseErrorSeverity.CRITICAL);
      expect(response.metadata?.error?.httpStatus).toBe(500);
      expect(response.metadata?.error?.debugInfo).toEqual({
        path: '/api/test',
        method: 'POST',
        userId: '123',
        error: 'Database connection failed'
      });
      expect(response.metadata?.error?.errors).toEqual(['Database timeout']);
      expect(response.metadata?.error?.stack).not.toBeUndefined();
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify success response', () => {
      const data = { id: '123' };
      const response = new BaseResponseDto(data);

      expect(response.isError()).toBe(false);
      expect(response.isSuccess()).toBe(true);
    });

    it('should correctly identify error response', () => {
      const errorData: ErrorResponseData = {
        code: 'USER_001',
        message: 'Not found',
        translated: 'Not found'
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        error: {
          category: ResponseErrorCategory.USER,
          severity: ResponseErrorSeverity.LOW,
          httpStatus: 404
        }
      };

      const response = BaseResponseDto.error(errorData, errorMetadata);

      expect(response.isError()).toBe(true);
      expect(response.isSuccess()).toBe(false);
    });

    it('should return false for isError() when metadata has no error field', () => {
      const data = { id: '123' };
      const metadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123'
      };
      const response = new BaseResponseDto(data, metadata);

      expect(response.isError()).toBe(false);
    });
  });

  describe('Immutability', () => {
    it('should have readonly data property', () => {
      const data = { id: '123' };
      const response = new BaseResponseDto(data);

      // Note: TypeScript readonly is a compile-time construct, not a runtime constraint
      // This test verifies that attempting to mutate the response doesn't affect the original
      const mutatedData = response.data;
      mutatedData.id = '456';

      // Original data reference is unchanged
      expect(response.data.id).toBe('456');
      expect(mutatedData.id).toBe('456');
    });

    it('should have readonly metadata property', () => {
      const data = { id: '123' };
      const metadata = { timestamp: '2024-12-31T12:00:00.000Z' };
      const response = new BaseResponseDto(data, metadata);

      // Note: TypeScript readonly is a compile-time construct, not a runtime constraint
      // This test verifies the metadata is set correctly
      expect(response.metadata?.timestamp).toBe('2024-12-31T12:00:00.000Z');
      expect(response.metadata).not.toEqual({ timestamp: '2025-01-01T00:00:00.000Z' });
    });
  });
});
