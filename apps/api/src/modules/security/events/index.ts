/**
 * Security Events Index
 *
 * Centralized exports for all security event types and related constants.
 */

// Event type constants
export {
  SecurityEventType,
  LegacySecurityEventType,
  SecurityEventTopics,
  SecurityEventSchemaVersion,
  type SecurityEventTypes
} from './security-event-types.constants';

// Event classes
export {
  BaseSecurityEvent,
  AuthLoginFailedEvent,
  AuthLoginSucceededEvent,
  AuthLogoutEvent,
  AuthAuthorizationDeniedEvent,
  AccessDataAccessDeniedEvent,
  ThreatSuspiciousActivityDetectedEvent,
  ThreatBruteForceAttemptDetectedEvent
} from './security-events';
