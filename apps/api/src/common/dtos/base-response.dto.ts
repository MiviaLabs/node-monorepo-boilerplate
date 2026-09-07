import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ErrorResponseData,
  ErrorResponseMetadata,
  ResponseErrorMetadata
} from '@package/errors';

/**
 * Response metadata interface
 */
export interface ResponseMetadata {
  timestamp?: string;
  version?: string;
  requestId?: string;
  error?: ResponseErrorMetadata;
}

/**
 * Base response DTO for all API responses
 *
 * @template T - The type of data being returned
 *
 * @example
 * ```typescript
 * // Single item response
 * return { data: user };
 *
 * // List response
 * return { data: users };
 *
 * // Response with metadata
 * return {
 *   data: user,
 *   metadata: { timestamp: new Date().toISOString() }
 * };
 * ```
 */
export class BaseResponseDto<T> {
  @ApiProperty({
    description: 'Response payload data',
    example: { id: '123', name: 'John Doe' }
  })
  data: T;

  @ApiPropertyOptional({
    description: 'Optional response metadata (timestamp, version, requestId, etc.)',
    example: { timestamp: '2024-12-31T12:00:00.000Z', version: '1.0.0' }
  })
  metadata?: ResponseMetadata;

  constructor(data: T, metadata?: ResponseMetadata) {
    this.data = data;
    if (metadata !== undefined) {
      this.metadata = metadata;
    }
  }

  /**
   * Create a success response
   */
  static success<T>(data: T, metadata?: ResponseMetadata): BaseResponseDto<T> {
    return new BaseResponseDto(data, metadata);
  }

  /**
   * Create an error response
   *
   * Uses the same BaseResponseDto pattern as success responses for consistency
   *
   * @param errorData - Error data containing code, message, translated message
   * @param errorMetadata - Error metadata with category, severity, httpStatus
   * @returns BaseResponseDto with error data and metadata
   *
   * @example
   * ```typescript
   * const errorData: ErrorResponseData = {
   *   code: 'USER_001',
   *   message: 'User not found',
   *   translated: 'User not found',
   * };
   * const errorMetadata: ErrorResponseMetadata = {
   *   timestamp: new Date().toISOString(),
   *   requestId: 'abc123',
   *   error: {
   *     category: 'USER',
   *     severity: 'LOW',
   *     httpStatus: 404,
   *     debugInfo: { path: '/api/users/123' },
   *   },
   * };
   * return BaseResponseDto.error(errorData, errorMetadata);
   * ```
   */
  static error(
    errorData: ErrorResponseData,
    errorMetadata: ErrorResponseMetadata
  ): BaseResponseDto<ErrorResponseData> {
    const metadata: ResponseMetadata = {
      timestamp: errorMetadata.timestamp,
      error: errorMetadata.error
    };

    if (errorMetadata.requestId !== undefined) {
      metadata.requestId = errorMetadata.requestId;
    }

    return new BaseResponseDto<ErrorResponseData>(errorData, metadata);
  }

  /**
   * @deprecated Use error() instead. errorResponse() is deprecated for consistency.
   */
  static errorResponse(
    errorData: ErrorResponseData,
    errorMetadata: ErrorResponseMetadata
  ): BaseResponseDto<ErrorResponseData> {
    return BaseResponseDto.error(errorData, errorMetadata);
  }

  /**
   * Create a response with timestamp
   */
  static withTimestamp<T>(data: T): BaseResponseDto<T> {
    return new BaseResponseDto(data, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create a response with custom metadata
   */
  static withMetadata<T>(data: T, metadata: ResponseMetadata): BaseResponseDto<T> {
    return new BaseResponseDto(data, metadata);
  }

  /**
   * Check if this response is an error response
   *
   * @returns True if the response has error metadata
   *
   * @example
   * ```typescript
   * const response = new BaseResponseDto(data, metadata);
   * if (response.isError()) {
   *   console.error('Error:', response.data.translated);
   * }
   * ```
   */
  isError(): boolean {
    return this.metadata !== undefined && 'error' in this.metadata;
  }

  /**
   * Check if this response is a success response
   *
   * @returns True if the response has no error metadata
   *
   * @example
   * ```typescript
   * const response = new BaseResponseDto(data, metadata);
   * if (response.isSuccess()) {
   *   console.log('Success:', response.data);
   * }
   * ```
   */
  isSuccess(): boolean {
    return !this.isError();
  }
}
