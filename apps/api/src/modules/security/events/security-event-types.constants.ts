/**
 * Security Event Types
 *
 * Centralized event type constants for security-related events.
 * Uses const object pattern for type safety and prevents magic strings.
 *
 * Event Naming Convention: `{category}.{action}`
 * - Lowercase category (auth, access, threat, audit)
 * - Past tense action (failed, succeeded, denied)
 *
 * @example
 * ```typescript
 * import { SecurityEventType } from './events/security-event-types.constants';
 *
 * // Publish event
 * await this.eventBus.publish(SecurityEventType.AUTH_LOGIN_FAILED, eventData);
 * ```
 */

/**
 * Security event type constants
 *
 * All security-related domain events.
 * Event types map to Kafka topics via dot-to-dash conversion.
 *
 * Topic Mapping:
 * - security.auth.login_failed -> security-auth-login-failed
 * - security.auth.login_succeeded -> security-auth-login-succeeded
 * - security.auth.authorization_denied -> security-auth-authorization-denied
 */
export const SecurityEventType = {
  // Authentication events
  /**
   * Login failed event
   *
   * Fired when authentication fails (wrong password, account locked, etc.).
   * Used for security monitoring and brute-force detection.
   *
   * Topic: security-auth-login-failed
   * Schema Version: 1.0
   */
  AUTH_LOGIN_FAILED: 'security.auth.login_failed',

  /**
   * Login succeeded event
   *
   * Fired when a user successfully authenticates.
   * Used for audit logging and session tracking.
   *
   * Topic: security-auth-login-succeeded
   * Schema Version: 1.0
   */
  AUTH_LOGIN_SUCCEEDED: 'security.auth.login_succeeded',

  /**
   * Logout event
   *
   * Fired when a user logs out.
   * Used for session tracking and analytics.
   *
   * Topic: security-auth-logout
   * Schema Version: 1.0
   */
  AUTH_LOGOUT: 'security.auth.logout',

  /**
   * Token refreshed event
   *
   * Fired when an access token is refreshed.
   * Used for security monitoring.
   *
   * Topic: security-auth-token-refreshed
   * Schema Version: 1.0
   */
  AUTH_TOKEN_REFRESHED: 'security.auth.token_refreshed',

  /**
   * Account locked event
   *
   * Fired when an account is locked due to suspicious activity.
   * Used for security monitoring and alerting.
   *
   * Topic: security-auth-account-locked
   * Schema Version: 1.0
   */
  AUTH_ACCOUNT_LOCKED: 'security.auth.account_locked',

  /**
   * Account unlocked event
   *
   * Fired when an account is unlocked by admin or automatically.
   * Used for audit logging.
   *
   * Topic: security-auth-account-unlocked
   * Schema Version: 1.0
   */
  AUTH_ACCOUNT_UNLOCKED: 'security.auth.account_unlocked',

  // Authorization events
  /**
   * Authorization denied event
   *
   * Fired when a user is denied access to a resource.
   * Used for security monitoring and permission tracking.
   *
   * Topic: security-auth-authorization-denied
   * Schema Version: 1.0
   */
  AUTH_AUTHORIZATION_DENIED: 'security.auth.authorization_denied',

  /**
   * Role assigned event
   *
   * Fired when a role is assigned to a user.
   * Used for audit logging.
   *
   * Topic: security-auth-role-assigned
   * Schema Version: 1.0
   */
  AUTH_ROLE_ASSIGNED: 'security.auth.role_assigned',

  /**
   * Role revoked event
   *
   * Fired when a role is revoked from a user.
   * Used for audit logging.
   *
   * Topic: security-auth-role-revoked
   * Schema Version: 1.0
   */
  AUTH_ROLE_REVOKED: 'security.auth.role.revoked',

  // Access control events
  /**
   * Data access attempted event
   *
   * Fired when a user attempts to access data.
   * Used for PII access tracking and audit logging.
   *
   * Topic: security-access-data-access-attempted
   * Schema Version: 1.0
   */
  ACCESS_DATA_ACCESS_ATTEMPTED: 'security.access.data_access_attempted',

  /**
   * Data access granted event
   *
   * Fired when access to data is granted.
   * Used for audit logging.
   *
   * Topic: security-access-data-access-granted
   * Schema Version: 1.0
   */
  ACCESS_DATA_ACCESS_GRANTED: 'security.access.data_access_granted',

  /**
   * Data access denied event
   *
   * Fired when access to data is denied.
   * Used for security monitoring and audit logging.
   *
   * Topic: security-access-data-access-denied
   * Schema Version: 1.0
   */
  ACCESS_DATA_ACCESS_DENIED: 'security.access.data_access_denied',

  // Security configuration events
  /**
   * Security policy updated event
   *
   * Fired when security policies are updated.
   * Used for audit logging and change tracking.
   *
   * Topic: security-config-policy-updated
   * Schema Version: 1.0
   */
  CONFIG_SECURITY_POLICY_UPDATED: 'security.config.security_policy_updated',

  /**
   * Permissions updated event
   *
   * Fired when permissions are updated.
   * Used for audit logging.
   *
   * Topic: security-config-permissions-updated
   * Schema Version: 1.0
   */
  CONFIG_PERMISSIONS_UPDATED: 'security.config.permissions_updated',

  // Audit events
  /**
   * Audit log accessed event
   *
   * Fired when audit logs are accessed.
   * Used for compliance tracking.
   *
   * Topic: security-audit-log-accessed
   * Schema Version: 1.0
   */
  AUDIT_LOG_ACCESSED: 'security.audit.log_accessed',

  /**
   * Security scan triggered event
   *
   * Fired when a security scan is triggered.
   * Used for compliance and security monitoring.
   *
   * Topic: security-audit-scan-triggered
   * Schema Version: 1.0
   */
  AUDIT_SCAN_TRIGGERED: 'security.audit.scan_triggered',

  // Threat detection events
  /**
   * Suspicious activity detected event
   *
   * Fired when suspicious activity is detected.
   * Used for security monitoring and alerting.
   *
   * Topic: security-threat-suspicious-activity-detected
   * Schema Version: 1.0
   */
  THREAT_SUSPICIOUS_ACTIVITY_DETECTED: 'security.threat.suspicious_activity_detected',

  /**
   * Malicious IP blocked event
   *
   * Fired when a malicious IP is blocked.
   * Used for security monitoring.
   *
   * Topic: security-threat-malicious-ip-blocked
   * Schema Version: 1.0
   */
  THREAT_MALICIOUS_IP_BLOCKED: 'security.threat.malicious_ip_blocked',

  /**
   * Brute force attempt detected event
   *
   * Fired when a brute force attack is detected.
   * Used for security monitoring and alerting.
   *
   * Topic: security-threat-brute-force-attempt-detected
   * Schema Version: 1.0
   */
  THREAT_BRUTE_FORCE_ATTEMPT_DETECTED: 'security.threat.brute_force_attempt_detected'
} as const;

/**
 * Security event type union
 *
 * Type-safe union of all security event types.
 *
 * @example
 * ```typescript
 * function handleSecurityEvent(eventType: SecurityEventTypes) {
 *   switch (eventType) {
 *     case SecurityEventType.AUTH_LOGIN_FAILED:
 *       // Handle login failed
 *       break;
 *     case SecurityEventType.AUTH_LOGIN_SUCCEEDED:
 *       // Handle login succeeded
 *       break;
 *   }
 * }
 * ```
 */
export type SecurityEventTypes = (typeof SecurityEventType)[keyof typeof SecurityEventType];

/**
 * Legacy security event type mapping
 *
 * Maps legacy event names to new standardized event names.
 * Maintained for backward compatibility.
 */
export const LegacySecurityEventType = {
  AUTH_FAILURE: SecurityEventType.AUTH_LOGIN_FAILED,
  AUTH_SUCCESS: SecurityEventType.AUTH_LOGIN_SUCCEEDED,
  AUTHORIZATION_DENIED: SecurityEventType.AUTH_AUTHORIZATION_DENIED,
  DATA_ACCESS: SecurityEventType.ACCESS_DATA_ACCESS_ATTEMPTED,
  CONFIG_CHANGE: SecurityEventType.CONFIG_SECURITY_POLICY_UPDATED
} as const;

/**
 * Event schema version constants
 *
 * All events include a schemaVersion field for backward compatibility.
 * Format: MAJOR.MINOR (e.g., '1.0')
 *
 * Versioning Rules:
 * - MAJOR: Breaking changes to event structure
 * - MINOR: Non-breaking additions (backward compatible)
 *
 * @example
 * ```typescript
 * const event = {
 *   eventType: SecurityEventType.AUTH_LOGIN_FAILED,
 *   schemaVersion: SecurityEventSchemaVersion.V1_0,
 *   data: { tenantId: '123', userId: '456' }
 * };
 * ```
 */
export const SecurityEventSchemaVersion = {
  /**
   * Version 1.0 - Initial event schema
   *
   * All security events use this version unless specified otherwise.
   */
  V1_0: '1.0'
} as const;

/**
 * Schema version type
 */
export type SecurityEventSchemaVersion =
  (typeof SecurityEventSchemaVersion)[keyof typeof SecurityEventSchemaVersion];

/**
 * Event topic mapping
 *
 * Maps event types to Kafka topics.
 * Pattern: Replace dots with dashes.
 *
 * @example
 * ```typescript
 * const topic = SecurityEventTopics[SecurityEventType.AUTH_LOGIN_FAILED];
 * // 'security-auth-login-failed'
 * ```
 */
export const SecurityEventTopics: Record<SecurityEventTypes, string> = {
  [SecurityEventType.AUTH_LOGIN_FAILED]: 'security-auth-login-failed',
  [SecurityEventType.AUTH_LOGIN_SUCCEEDED]: 'security-auth-login-succeeded',
  [SecurityEventType.AUTH_LOGOUT]: 'security-auth-logout',
  [SecurityEventType.AUTH_TOKEN_REFRESHED]: 'security-auth-token-refreshed',
  [SecurityEventType.AUTH_ACCOUNT_LOCKED]: 'security-auth-account-locked',
  [SecurityEventType.AUTH_ACCOUNT_UNLOCKED]: 'security-auth-account-unlocked',
  [SecurityEventType.AUTH_AUTHORIZATION_DENIED]: 'security-auth-authorization-denied',
  [SecurityEventType.AUTH_ROLE_ASSIGNED]: 'security-auth-role-assigned',
  [SecurityEventType.AUTH_ROLE_REVOKED]: 'security-auth-role-revoked',
  [SecurityEventType.ACCESS_DATA_ACCESS_ATTEMPTED]: 'security-access-data-access-attempted',
  [SecurityEventType.ACCESS_DATA_ACCESS_GRANTED]: 'security-access-data-access-granted',
  [SecurityEventType.ACCESS_DATA_ACCESS_DENIED]: 'security-access-data-access-denied',
  [SecurityEventType.CONFIG_SECURITY_POLICY_UPDATED]: 'security-config-security-policy-updated',
  [SecurityEventType.CONFIG_PERMISSIONS_UPDATED]: 'security-config-permissions-updated',
  [SecurityEventType.AUDIT_LOG_ACCESSED]: 'security-audit-log-accessed',
  [SecurityEventType.AUDIT_SCAN_TRIGGERED]: 'security-audit-scan-triggered',
  [SecurityEventType.THREAT_SUSPICIOUS_ACTIVITY_DETECTED]:
    'security-threat-suspicious-activity-detected',
  [SecurityEventType.THREAT_MALICIOUS_IP_BLOCKED]: 'security-threat-malicious-ip-blocked',
  [SecurityEventType.THREAT_BRUTE_FORCE_ATTEMPT_DETECTED]:
    'security-threat-brute-force-attempt-detected'
} as const;
