/**
 * Security Module Types
 *
 * Centralized type definitions for the security module.
 * Re-exports common types from security-monitoring.service.ts for convenience.
 */

// Re-export event types from centralized registry
export {
  SecurityEventType,
  LegacySecurityEventType,
  SecurityEventTopics,
  SecurityEventSchemaVersion,
  type SecurityEventTypes
} from './events';

// Re-export enums and interfaces from SecurityMonitoringService
export {
  SecuritySeverity,
  SecurityAction,
  type SecurityThreshold,
  type SecurityEvent
} from './security-monitoring.service';
