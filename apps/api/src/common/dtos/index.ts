/**
 * Common DTOs for API responses
 *
 * This module provides base response DTOs for consistent API responses across the application.
 *
 * @example
 * ```typescript
 * import { BaseResponseDto, PaginatedResponseDto } from '../common/dtos';
 *
 * // Single item response
 * return new BaseResponseDto(user);
 *
 * // Paginated response
 * return new PaginatedResponseDto(users, paginationMetadata);
 * ```
 */

// Base response types
export { BaseResponseDto, type ResponseMetadata } from './base-response.dto';

// Paginated response types
export {
  PaginatedResponseDto,
  type PaginationMetadata,
  type PaginatedResponseMetadata
} from './paginated-response.dto';
