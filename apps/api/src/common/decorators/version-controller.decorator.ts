import { Controller } from '@nestjs/common';

import { VERSION_METADATA_KEY } from '../versioning/version-routing.constants';

/**
 * Combined decorator that applies version metadata and @Controller.
 * Creates a controller with versioned routes in a single decorator.
 *
 * @example
 * ```typescript
 * @VersionedController('v1', 'users')
 * export class UsersControllerV1 {
 *   @Get()
 *   findAll() { return []; }
 * }
 * // Routes to: /api/v1/users
 * ```
 *
 * @example
 * ```typescript
 * // With no path, uses controller class name
 * @VersionedController('v2')
 * export class UsersControllerV2 {
 *   @Get()
 *   findAll() { return []; }
 * }
 * // Routes to: /api/v1/users
 * ```
 *
 * @param version - Version prefix (e.g., 'v1', 'v2')
 * @param path - Optional controller path (defaults to controller name)
 * @returns A class decorator that applies versioned routing to the controller
 */
export const VersionedController = (version: string, path?: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any) => {
    // Store version metadata on the controller
    Reflect.defineMetadata(VERSION_METADATA_KEY, version, target as object);

    // Apply the Controller decorator with version prefix
    // e.g., @VersionedController('v1', 'health') -> @Controller('v1/health')
    // e.g., @VersionedController('v2') -> @Controller('v2')
    const controllerPath = path ? `${version}/${path}` : version;
    Controller(controllerPath)(target);
  };
};

/**
 * Type guard to check if a controller is versioned.
 *
 * @param target - The controller class or instance to check
 * @returns True if the controller has version metadata attached
 *
 * @example
 * ```typescript
 * if (isVersionedController(controller)) {
 *   const version = getControllerVersion(controller);
 * }
 * ```
 */
export const isVersionedController = (target: object): boolean => {
  return target != null && Reflect.hasMetadata(VERSION_METADATA_KEY, target);
};

/**
 * Get the version from a controller class.
 *
 * @param target - The controller class to get version from
 * @returns The version string if present, undefined otherwise
 *
 * @example
 * ```typescript
 * const version = getControllerVersion(UsersControllerV1);
 * // Returns: 'v1'
 * ```
 */
export const getControllerVersion = (target: object): string | undefined => {
  if (target == null) {
    return undefined;
  }
  return Reflect.getMetadata(VERSION_METADATA_KEY, target) as string | undefined;
};
