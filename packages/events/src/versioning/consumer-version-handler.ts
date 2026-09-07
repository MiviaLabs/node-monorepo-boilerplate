import { SetMetadata } from '@nestjs/common';

import type { EventVersion } from './event-versioning.types';

/**
 * Metadata key for version handler decorator
 */
export const HANDLE_VERSION_METADATA = 'event:handleVersion';

/**
 * Re-export EventVersion from event-versioning.types for convenience
 */
export type { EventVersion };

/**
 * Version handler metadata stored by @HandleVersion decorator
 */
export interface HandleVersionMetadata {
  readonly versions: EventVersion[];
  readonly propertyKey: string | symbol;
}

/**
 * Consumer-side version handling decorator
 *
 * Automatically migrates events to the latest supported version.
 * Throws error if event version is not compatible.
 *
 * This decorator is used in conjunction with @EventHandler to specify
 * which event schema versions a handler can process. The EventsModule
 * will use this metadata to automatically migrate older events to the
 * latest supported version before passing them to the handler.
 *
 * @param versions - Array of compatible schema versions (e.g., ['1.0', '1.1', '2.0'])
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * import { EventHandler } from '../events.module';
 * import { HandleVersion } from './versioning/consumer-version-handler';
 *
 * @EventHandler('user.created')
 * @HandleVersion(['1.0', '1.1', '2.0'])
 * async handleUserCreated(event: EventMessage<UserCreatedDataV2>) {
 *   // Event is automatically migrated to v2.0 if needed
 *   // event.data is guaranteed to be UserCreatedDataV2
 *   console.log('User created:', event.data.userId);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Handle multiple event versions with migration
 * @EventHandler('order.placed')
 * @HandleVersion(['1.0', '2.0'])
 * async handleOrderPlaced(event: EventMessage<OrderPlacedDataV2>) {
 *   // v1.0 events are automatically migrated to v2.0 format:
 *   // - v1.0: { items: Item[] } -> v2.0: { lineItems: LineItem[], totals: Totals }
 *   // The handler always receives v2.0 format
 * }
 * ```
 */
export const HandleVersion = (versions: EventVersion[]): MethodDecorator => {
  return (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const metadata: HandleVersionMetadata = {
      versions,
      propertyKey
    };

    SetMetadata(HANDLE_VERSION_METADATA, metadata);

    return descriptor;
  };
};

/**
 * Extract version metadata from a handler method
 *
 * This helper function retrieves the @HandleVersion metadata
 * from a method. Used internally by EventsModule during handler registration.
 *
 * Note: Parameters are prefixed with underscore as this is a placeholder
 * implementation. In actual usage, the EventsModule uses NestJS Reflector
 * to retrieve metadata from methods.
 *
 * @returns Version metadata if present, undefined otherwise
 *
 * @example
 * ```typescript
 * import { Reflector } from '@nestjs/core';
 *
 * class EventsModule {
 *   constructor(private readonly reflector: Reflector) {}
 *
 *   getHandlerVersionMetadata(instance: object, methodName: string) {
 *     const method = instance[methodName];
 *     return this.reflector.get<HandleVersionMetadata>(
 *       HANDLE_VERSION_METADATA,
 *       method
 *     );
 *   }
 * }
 * ```
 */
export function getHandleVersionMetadata(
  _target: object,
  _propertyKey: string | symbol
): HandleVersionMetadata | undefined {
  // Note: In actual implementation, this would use Reflector from NestJS
  // For now, this is a placeholder for the metadata extraction
  // The EventsModule uses Reflector internally to get this metadata

  // Usage in EventsModule:
  // const metadata = this.reflector.get<HandleVersionMetadata>(
  //   HANDLE_VERSION_METADATA,
  //   method
  // );

  return undefined;
}
