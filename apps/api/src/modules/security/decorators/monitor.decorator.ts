import { SetMetadata } from '@nestjs/common';

import type { SecurityEventTypes } from '../events';

export const MONITOR_SECURITY_KEY = 'monitor_security';

/**
 * Event types that can be monitored with the @MonitorSecurity decorator
 *
 * Uses centralized SecurityEventType for type safety.
 */
export type MonitorEventType = SecurityEventTypes | readonly SecurityEventTypes[] | '*';

/**
 * Metadata structure for security monitoring configuration
 */
export interface MonitorSecurityMetadata {
  readonly eventTypes: readonly SecurityEventTypes[];
  readonly monitorAll: boolean;
}

/**
 * Decorator to enable security monitoring on a route
 *
 * Uses centralized SecurityEventType constants for type-safe event monitoring.
 *
 * Supports three usage patterns:
 *
 * 1. Single event type (using centralized constant):
 * ```typescript
 * import { SecurityEventType } from '../security/events';
 *
 * @MonitorSecurity(SecurityEventType.AUTH_LOGIN_FAILED)
 * @Post('login')
 * login() { ... }
 * ```
 *
 * 2. Multiple event types:
 * ```typescript
 * @MonitorSecurity([
 *   SecurityEventType.AUTH_LOGIN_FAILED,
 *   SecurityEventType.AUTH_AUTHORIZATION_DENIED
 * ])
 * @Post('admin')
 * adminAction() { ... }
 * ```
 *
 * 3. All event types (wildcard):
 * ```typescript
 * @MonitorSecurity('*')
 * @MonitorSecurity() // equivalent to '*'
 * @Get('sensitive')
 * getSensitiveData() { ... }
 * ```
 *
 * @param eventTypes - Single event type, array of event types, or '*' for all events
 * @returns SetMetadata decorator with monitor configuration
 */
export function MonitorSecurity(eventTypes?: MonitorEventType): ReturnType<typeof SetMetadata> {
  // Handle no arguments (default to all events)
  if (eventTypes === undefined) {
    return SetMetadata(MONITOR_SECURITY_KEY, {
      eventTypes: [],
      monitorAll: true
    });
  }

  // Handle wildcard
  if (eventTypes === '*') {
    return SetMetadata(MONITOR_SECURITY_KEY, {
      eventTypes: [],
      monitorAll: true
    });
  }

  // Handle array of event types
  if (Array.isArray(eventTypes)) {
    return SetMetadata(MONITOR_SECURITY_KEY, {
      eventTypes: eventTypes as readonly SecurityEventTypes[],
      monitorAll: false
    });
  }

  // Handle single event type (SecurityEventTypes)
  return SetMetadata(MONITOR_SECURITY_KEY, {
    eventTypes: [eventTypes],
    monitorAll: false
  });
}
