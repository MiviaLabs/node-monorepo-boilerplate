import { SetMetadata } from '@nestjs/common';

import { API_VERSION_KEY } from '../guards/version.guard';
import { normalizeSemanticVersion } from '../utils/version.util';
import { DEPRECATION_METADATA_KEY } from '../versioning/version-routing.constants';

/**
 * Decorator to specify which API versions are allowed for a controller or endpoint
 *
 * @example
 * ```typescript
 * // Apply to entire controller
 * @ApiVersion('1.0')
 * @Controller('users')
 * export class PeopleController {
 *   // All endpoints require API version 1.0
 * }
 *
 * // Apply to specific endpoint
 * @Controller('users')
 * export class PeopleController {
 *   @Get()
 *   @ApiVersion('1.0')
 *   findAll() {
 *     return 'This endpoint requires API version 1.0';
 *   }
 *
 *   @Get('v2')
 *   @ApiVersion('2.0')
 *   findAllV2() {
 *     return 'This endpoint requires API version 2.0';
 *   }
 * }
 *
 * // Support multiple versions
 * @Get()
 * @ApiVersion('1.0', '2.0')
 * findAll() {
 *   return 'This endpoint supports both API versions 1.0 and 2.0';
 * }
 * ```
 *
 * @param versions - One or more version strings (e.g., '1.0', '2.0')
 */
export const ApiVersion = (...versions: string[]): ReturnType<typeof SetMetadata> => {
  // Normalize versions to semantic version format
  const normalizedVersions = versions.map(normalizeSemanticVersion);

  return SetMetadata(API_VERSION_KEY, normalizedVersions);
};

/**
 * Options for ApiDeprecated decorator
 */
export interface ApiDeprecatedOptions {
  /** Reason for deprecation (e.g., 'Use /new-endpoint instead') */
  reason?: string;
  /** Sunset date when the deprecated endpoint will be removed (ISO format) */
  sunsetDate?: string;
  /** URL to migration guide documentation */
  migrationGuide?: string;
}

/**
 * Decorator to mark an endpoint as deprecated.
 * Adds OpenAPI deprecated flag and deprecation headers to responses.
 *
 * @param optionsOrReason - Either a deprecation reason string or full options object
 * @returns A method decorator that marks the endpoint as deprecated
 *
 * @example
 * ```typescript
 * // Simple deprecation with reason string
 * @Get('old-endpoint')
 * @ApiDeprecated('Use /new-endpoint instead')
 * oldEndpoint() {
 *   return 'This endpoint is deprecated';
 * }
 *
 * // Full deprecation with options
 * @Get('old-endpoint')
 * @ApiDeprecated({
 *   reason: 'Use /new-endpoint instead',
 *   sunsetDate: '2026-06-30',
 *   migrationGuide: 'https://docs.example.com/migration'
 * })
 * oldEndpoint() {
 *   return 'This endpoint is deprecated';
 * }
 * ```
 */
export const ApiDeprecated = (optionsOrReason?: string | ApiDeprecatedOptions) => {
  return <T>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _target: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> | void => {
    // Handle both string and object argument formats
    const metadata: ApiDeprecatedOptions & { deprecated: boolean } =
      typeof optionsOrReason === 'string'
        ? { deprecated: true, reason: optionsOrReason }
        : { deprecated: true, ...optionsOrReason };

    // Store deprecation metadata for interceptor use
    if (descriptor.value) {
      Reflect.defineMetadata(DEPRECATION_METADATA_KEY, metadata, descriptor.value);
    }
    return descriptor;
  };
};
