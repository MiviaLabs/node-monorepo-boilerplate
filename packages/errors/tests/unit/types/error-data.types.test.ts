import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  isErrorResponseData,
  isErrorResponseMetadata,
  isErrorResponse,
  type ErrorResponseData,
  type ErrorResponseMetadata,
  type BaseResponseDto
} from '../../../src/types/error-data.types';

describe('Error Data Types', () => {
  describe('isErrorResponseData()', () => {
    it('should return true for valid ErrorResponseData', () => {
      const data: ErrorResponseData = {
        code: 'USER_001',
        message: 'User not found',
        translated: 'User not found'
      };

      assert.strictEqual(isErrorResponseData(data), true);
    });

    it('should return true for ErrorResponseData with optional fields', () => {
      const data: ErrorResponseData = {
        code: 'VAL_001',
        message: 'Validation failed',
        translated: 'Validation failed',
        translationKey: 'errors.validation.failed',
        parameters: { field: 'email' },
        field: 'email'
      };

      assert.strictEqual(isErrorResponseData(data), true);
    });

    it('should return false for null', () => {
      assert.strictEqual(isErrorResponseData(null), false);
    });

    it('should return false for undefined', () => {
      assert.strictEqual(isErrorResponseData(undefined), false);
    });

    it('should return false for primitive types', () => {
      assert.strictEqual(isErrorResponseData('string'), false);
      assert.strictEqual(isErrorResponseData(123), false);
      assert.strictEqual(isErrorResponseData(true), false);
    });

    it('should return false for object without required fields', () => {
      assert.strictEqual(isErrorResponseData({}), false);
      assert.strictEqual(isErrorResponseData({ code: 'USER_001' }), false);
      assert.strictEqual(isErrorResponseData({ code: 'USER_001', message: 'test' }), false);
    });

    it('should return false for object with wrong types', () => {
      assert.strictEqual(
        isErrorResponseData({
          code: 123,
          message: 'test',
          translated: 'test'
        }),
        false
      );
    });
  });

  describe('isErrorResponseMetadata()', () => {
    it('should return true for valid ErrorResponseMetadata', () => {
      const metadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123',
        error: {
          category: 'USER',
          severity: 'LOW',
          httpStatus: 404
        }
      };

      assert.strictEqual(isErrorResponseMetadata(metadata), true);
    });

    it('should return true for ErrorResponseMetadata with optional fields', () => {
      const metadata: ErrorResponseMetadata = {
        timestamp: '2024-12-31T12:00:00.000Z',
        error: {
          category: 'VALIDATION',
          severity: 'LOW',
          httpStatus: 400,
          debugInfo: { path: '/api/users' },
          errors: ['Email is required', 'Password is required'],
          stack: 'Error: Validation failed\n    at ...'
        }
      };

      assert.strictEqual(isErrorResponseMetadata(metadata), true);
    });

    it('should return false for null', () => {
      assert.strictEqual(isErrorResponseMetadata(null), false);
    });

    it('should return false for undefined', () => {
      assert.strictEqual(isErrorResponseMetadata(undefined), false);
    });

    it('should return false for object without required fields', () => {
      assert.strictEqual(isErrorResponseMetadata({}), false);
      assert.strictEqual(isErrorResponseMetadata({ timestamp: '2024-12-31T12:00:00.000Z' }), false);
    });

    it('should return false for object with invalid error field', () => {
      assert.strictEqual(
        isErrorResponseMetadata({
          timestamp: '2024-12-31T12:00:00.000Z',
          error: {}
        }),
        false
      );
    });

    it('should return false for object with wrong field types', () => {
      assert.strictEqual(
        isErrorResponseMetadata({
          timestamp: 123,
          error: {
            category: 'USER',
            severity: 'LOW',
            httpStatus: 404
          }
        }),
        false
      );
    });
  });

  describe('isErrorResponse()', () => {
    it('should return true for error response', () => {
      const response: BaseResponseDto<ErrorResponseData> = {
        data: {
          code: 'USER_001',
          message: 'User not found',
          translated: 'User not found'
        },
        metadata: {
          timestamp: '2024-12-31T12:00:00.000Z',
          requestId: 'abc123',
          error: {
            category: 'USER',
            severity: 'LOW',
            httpStatus: 404
          }
        }
      };

      assert.strictEqual(isErrorResponse(response), true);
    });

    it('should return false for success response', () => {
      const response: BaseResponseDto<{ id: string }> = {
        data: { id: '123' },
        metadata: {
          timestamp: '2024-12-31T12:00:00.000Z',
          requestId: 'abc123'
        }
      };

      assert.strictEqual(isErrorResponse(response), false);
    });

    it('should return false for response without metadata', () => {
      const response: BaseResponseDto<{ id: string }> = {
        data: { id: '123' }
      };

      assert.strictEqual(isErrorResponse(response), false);
    });

    it('should return false for response with metadata without error field', () => {
      const response: BaseResponseDto<{ id: string }> = {
        data: { id: '123' },
        metadata: {
          timestamp: '2024-12-31T12:00:00.000Z'
        }
      };

      assert.strictEqual(isErrorResponse(response), false);
    });

    it('should return false for response with invalid error metadata', () => {
      const response: BaseResponseDto<ErrorResponseData> = {
        data: {
          code: 'USER_001',
          message: 'User not found',
          translated: 'User not found'
        },
        metadata: {
          timestamp: '2024-12-31T12:00:00.000Z',
          error: {} as ResponseErrorMetadata
        }
      };

      assert.strictEqual(isErrorResponse(response), false);
    });
  });

  describe('Type guards with TypeScript type narrowing', () => {
    it('should narrow type for ErrorResponseData', () => {
      const value: unknown = {
        code: 'USER_001',
        message: 'User not found',
        translated: 'User not found'
      };

      if (isErrorResponseData(value)) {
        // Type should be narrowed to ErrorResponseData
        const code: string = value.code;
        assert.strictEqual(code, 'USER_001');
      } else {
        assert.fail('Value should be ErrorResponseData');
      }
    });

    it('should narrow type for ErrorResponseMetadata', () => {
      const value: unknown = {
        timestamp: '2024-12-31T12:00:00.000Z',
        requestId: 'abc123',
        error: {
          category: 'USER',
          severity: 'LOW',
          httpStatus: 404
        }
      };

      if (isErrorResponseMetadata(value)) {
        // Type should be narrowed to ErrorResponseMetadata
        const category: string = value.error.category;
        assert.strictEqual(category, 'USER');
      } else {
        assert.fail('Value should be ErrorResponseMetadata');
      }
    });

    it('should narrow type for error response', () => {
      const response: BaseResponseDto<unknown> = {
        data: {
          code: 'USER_001',
          message: 'User not found',
          translated: 'User not found'
        },
        metadata: {
          timestamp: '2024-12-31T12:00:00.000Z',
          error: {
            category: 'USER',
            severity: 'LOW',
            httpStatus: 404
          }
        }
      };

      if (isErrorResponse(response)) {
        // Type should be narrowed to BaseResponseDto<ErrorResponseData>
        const code: string = response.data.code;
        assert.strictEqual(code, 'USER_001');
      } else {
        assert.fail('Response should be error response');
      }
    });
  });
});
