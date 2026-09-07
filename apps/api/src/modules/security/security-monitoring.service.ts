import { Injectable, Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { CacheService } from '@package/redis';

import { SecurityEventType, type SecurityEventTypes } from './events';

/**
 * Security event severity levels
 */
export const enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security threshold action types
 */
export const enum SecurityAction {
  LOCKOUT = 'lockout',
  ALERT = 'alert',
  BLOCK = 'block'
}

/**
 * Security threshold configuration
 */
export interface SecurityThreshold {
  readonly count: number;
  readonly windowMs: number;
  readonly action: SecurityAction | string;
}

/**
 * Security event interface (for backward compatibility with monitoring)
 *
 * @deprecated Use specific event classes (AuthLoginFailedEvent, etc.) instead
 */
export interface SecurityEvent {
  readonly type: SecurityEventTypes | string;
  readonly severity: SecuritySeverity | string;
  readonly tenantId: string;
  readonly userId?: string;
  readonly resource?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly timestamp: Date;
}

/**
 * Security Monitoring Service
 *
 * Tracks security events and enforces thresholds for suspicious activity.
 * Uses centralized SecurityEventType constants for type safety.
 *
 * Integrates with:
 * - OpenTelemetry for distributed tracing of security events
 * - Redis for distributed lockout state
 * - Alert mechanism (mocked email + logging)
 *
 * @example
 * ```typescript
 * // Record auth failure using centralized event type
 * securityMonitoring.recordAuthFailure(tenantId, userId);
 *
 * // Set lockout for user
 * await securityMonitoring.setLockout(tenantId, userId, 900);
 * ```
 */
@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private readonly eventCounts = new Map<string, number[]>();
  private readonly tracer = trace.getTracer('security-monitoring');

  constructor(private readonly cache: CacheService) {}

  /**
   * Security event thresholds
   *
   * Maps event types to their threshold configurations.
   * Uses legacy event type names as keys for backward compatibility.
   */
  private readonly eventThresholds: Record<string, SecurityThreshold> = {
    // Legacy auth_failure maps to AUTH_LOGIN_FAILED
    auth_failure: { count: 5, windowMs: 60000, action: SecurityAction.LOCKOUT },
    [SecurityEventType.AUTH_LOGIN_FAILED]: {
      count: 5,
      windowMs: 60000,
      action: SecurityAction.LOCKOUT
    },

    // Legacy authorization_denied maps to AUTH_AUTHORIZATION_DENIED
    authorization_denied: { count: 10, windowMs: 300000, action: SecurityAction.ALERT },
    [SecurityEventType.AUTH_AUTHORIZATION_DENIED]: {
      count: 10,
      windowMs: 300000,
      action: SecurityAction.ALERT
    },

    // Brute force detection
    [SecurityEventType.THREAT_BRUTE_FORCE_ATTEMPT_DETECTED]: {
      count: 3,
      windowMs: 300000,
      action: SecurityAction.BLOCK
    }
  };

  /**
   * Record a security event (for monitoring)
   *
   * Emits OpenTelemetry span for distributed tracing.
   *
   * @param event - Security event to record
   */
  recordEvent(event: SecurityEvent): void {
    // Use structured logging without PII (see P0 rule: security-no-pii-exposure)
    this.logger.debug(`Security event: ${event.type} for tenant: ${event.tenantId}`);

    // Emit OpenTelemetry span for distributed tracing
    this.emitSecurityEvent(event);

    // Check thresholds
    const response = this.checkThresholds(event);

    // Take action if threshold exceeded
    if (response.triggered && response.action) {
      this.takeAction(response.action, event);
    }
  }

  /**
   * Emit security event to OpenTelemetry for distributed tracing
   *
   * Creates a span with security event attributes (no PII).
   *
   * @param event - Security event to emit
   */
  private emitSecurityEvent(event: SecurityEvent): void {
    const span = this.tracer.startSpan('security.event', {
      attributes: {
        'security.event.type': event.type,
        'security.event.severity': event.severity,
        'tenant.id': event.tenantId,
        'resource.type': event.resource ?? 'unknown',
        'event.timestamp': event.timestamp.toISOString()
      }
    });

    span.end();
  }

  /**
   * Check if event thresholds are exceeded
   *
   * @param event - Security event to check
   * @returns Threshold check result
   */
  checkThresholds(event: SecurityEvent): {
    triggered: boolean;
    action?: string;
    message: string;
  } {
    const key = `${event.type}:${event.tenantId}:${event.userId ?? 'anonymous'}`;
    const threshold = this.eventThresholds[event.type];

    if (!threshold) {
      return { triggered: false, message: 'No threshold configured' };
    }

    const now = Date.now();
    const events = this.eventCounts.get(key) ?? [];

    // Clean old events outside window
    const validEvents = events.filter((time) => now - time < threshold.windowMs);

    // Add current event
    validEvents.push(now);
    this.eventCounts.set(key, validEvents);

    // Check if threshold exceeded
    if (validEvents.length >= threshold.count) {
      return {
        triggered: true,
        action: threshold.action,
        message: `Threshold exceeded: ${validEvents.length} ${event.type} events`
      };
    }

    return { triggered: false, message: 'Threshold not exceeded' };
  }

  /**
   * Take action based on threshold trigger
   *
   * @param action - Action to take
   * @param event - Security event context
   */
  takeAction(action: string, event: SecurityEvent): void {
    const normalizedAction = action as SecurityAction;
    switch (normalizedAction) {
      case SecurityAction.LOCKOUT:
        this.logger.warn(`User locked out due to suspicious activity - tenant: ${event.tenantId}`);
        // Set lockout in Redis for 15 minutes
        if (event.userId) {
          void this.setLockout(event.tenantId, event.userId, 900);
        }
        break;
      case SecurityAction.ALERT:
        this.logger.error(
          `Security alert: ${event.type} threshold exceeded for tenant ${event.tenantId}`
        );
        // Send alert to security team (mocked email + logging)
        this.sendAlert(event);
        break;
      case SecurityAction.BLOCK:
        this.logger.warn(`Blocking request due to suspicious activity - tenant: ${event.tenantId}`);
        // TODO: Implement blocking logic (e.g., add IP to blocklist)
        break;
    }
  }

  /**
   * Set user lockout in Redis with TTL
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param ttlSeconds - Time to live in seconds (default: 900 = 15 minutes)
   */
  async setLockout(tenantId: string, userId: string, ttlSeconds: number = 900): Promise<void> {
    const lockoutKey = `tenant:${tenantId}:security:lockout:${userId}`;
    await this.cache.set(lockoutKey, '1', { ttl: ttlSeconds });
    this.logger.warn(`User lockout applied for tenant ${tenantId} for ${ttlSeconds}s`);
  }

  /**
   * Send security alert (mocked email + logging)
   *
   * In production, this would send real emails via the notification service.
   *
   * @param event - Security event context
   */
  private sendAlert(event: SecurityEvent): void {
    const alertDetails = {
      eventType: event.type,
      severity: event.severity,
      tenantId: event.tenantId,
      resource: event.resource,
      timestamp: event.timestamp.toISOString()
    };

    // Log alert details (no PII)
    this.logger.error(`Security Alert: ${JSON.stringify(alertDetails)}`);

    // TODO: Send real email via notification service
    // For now, mock email sending by logging
    this.logger.log(`[MOCK] Sending security alert email to security-team@example.com`);
    this.logger.log(`[MOCK] Email subject: Security Alert - ${event.type}`);
    this.logger.log(`[MOCK] Email body: ${JSON.stringify(alertDetails, null, 2)}`);
  }

  // Helper methods for common security events using centralized event types

  /**
   * Record authentication failure event
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID (use 'anonymous' for failed login before auth)
   */
  recordAuthFailure(tenantId: string, userId: string): void {
    this.recordEvent({
      type: SecurityEventType.AUTH_LOGIN_FAILED,
      severity: SecuritySeverity.MEDIUM,
      tenantId,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * Record authentication success event
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   */
  recordAuthSuccess(tenantId: string, userId: string): void {
    this.recordEvent({
      type: SecurityEventType.AUTH_LOGIN_SUCCEEDED,
      severity: SecuritySeverity.LOW,
      tenantId,
      userId,
      timestamp: new Date()
    });
  }

  /**
   * Record authorization denied event
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param resource - Resource that was accessed
   */
  recordAuthorizationDenied(tenantId: string, userId: string, resource: string): void {
    this.recordEvent({
      type: SecurityEventType.AUTH_AUTHORIZATION_DENIED,
      severity: SecuritySeverity.HIGH,
      tenantId,
      userId,
      resource,
      timestamp: new Date()
    });
  }

  /**
   * Record data access denied event
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param resource - Resource that was accessed
   */
  recordDataAccessDenied(tenantId: string, userId: string, resource: string): void {
    this.recordEvent({
      type: SecurityEventType.ACCESS_DATA_ACCESS_DENIED,
      severity: SecuritySeverity.HIGH,
      tenantId,
      userId,
      resource,
      timestamp: new Date()
    });
  }

  /**
   * Record suspicious activity detected event
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param details - Additional details about the suspicious activity
   */
  recordSuspiciousActivity(
    tenantId: string,
    userId: string,
    details?: Readonly<Record<string, unknown>>
  ): void {
    this.recordEvent({
      type: SecurityEventType.THREAT_SUSPICIOUS_ACTIVITY_DETECTED,
      severity: SecuritySeverity.HIGH,
      tenantId,
      userId,
      details,
      timestamp: new Date()
    });
  }

  /**
   * Record brute force attempt detected event
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID (may be 'anonymous' for login attempts)
   * @param details - Additional details about the attack
   */
  recordBruteForceAttempt(
    tenantId: string,
    userId: string,
    details?: Readonly<Record<string, unknown>>
  ): void {
    this.recordEvent({
      type: SecurityEventType.THREAT_BRUTE_FORCE_ATTEMPT_DETECTED,
      severity: SecuritySeverity.CRITICAL,
      tenantId,
      userId,
      details,
      timestamp: new Date()
    });
  }
}

// Re-export event classes for convenience
export {
  AuthLoginFailedEvent,
  AuthLoginSucceededEvent,
  AuthLogoutEvent,
  AuthAuthorizationDeniedEvent,
  AccessDataAccessDeniedEvent,
  ThreatSuspiciousActivityDetectedEvent,
  ThreatBruteForceAttemptDetectedEvent
} from './events';
