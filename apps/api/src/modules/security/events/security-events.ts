import type { IEvent } from '@package/types';

/**
 * Base Security Event
 *
 * Base class for all security events implementing IEvent interface.
 * All security events extend this class for consistency and outbox pattern support.
 *
 * @example
 * ```typescript
 * export class AuthLoginFailedEvent extends BaseSecurityEvent {
 *   readonly reason?: string;
 *   readonly provider?: string;
 *
 *   constructor(tenantId: string, userId: string, options: {
 *     reason?: string;
 *     provider?: string;
 *   }) {
 *     super(userId, tenantId, 'auth_login_failed');
 *     this.reason = options.reason;
 *     this.provider = options.provider;
 *   }
 * }
 * ```
 */
export abstract class BaseSecurityEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly version: number;
  readonly eventType: string;

  // Outbox pattern support fields
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  // Common security event fields
  readonly userId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly sessionId?: string;

  constructor(
    aggregateId: string,
    tenantId: string,
    eventType: string,
    options: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      correlationId?: string;
      causationId?: string;
      version?: number;
    } = {}
  ) {
    this.aggregateId = aggregateId;
    this.tenantId = tenantId;
    this.eventType = eventType;
    this.occurredAt = new Date();
    this.version = options.version ?? 1;

    // Optional fields
    if (options.userId !== undefined) {
      this.userId = options.userId;
    }
    if (options.ipAddress !== undefined) {
      this.ipAddress = options.ipAddress;
    }
    if (options.userAgent !== undefined) {
      this.userAgent = options.userAgent;
    }
    if (options.sessionId !== undefined) {
      this.sessionId = options.sessionId;
    }
    if (options.correlationId !== undefined) {
      this.correlationId = options.correlationId;
    }
    if (options.causationId !== undefined) {
      this.causationId = options.causationId;
    }
  }
}

/**
 * Authentication Security Events
 */

/**
 * Auth Login Failed Event
 *
 * Published when authentication fails (wrong password, account locked, etc.)
 */
export class AuthLoginFailedEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.auth.login_failed';
  readonly reason?: string;
  readonly provider?: string;
  readonly attemptCount?: number;

  constructor(
    tenantId: string,
    userId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      reason?: string;
      provider?: string;
      attemptCount?: number;
      correlationId?: string;
    } = {}
  ) {
    super(userId, tenantId, 'security.auth.login_failed', {
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      sessionId: options.sessionId,
      correlationId: options.correlationId
    });
    this.reason = options.reason;
    this.provider = options.provider;
    this.attemptCount = options.attemptCount;
  }
}

/**
 * Auth Login Succeeded Event
 *
 * Published when a user successfully authenticates
 */
export class AuthLoginSucceededEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.auth.login_succeeded';
  readonly provider: string;
  readonly isNewDevice?: boolean;

  constructor(
    tenantId: string,
    userId: string,
    provider: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      isNewDevice?: boolean;
      correlationId?: string;
    } = {}
  ) {
    super(userId, tenantId, 'security.auth.login_succeeded', {
      userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      sessionId: options.sessionId,
      correlationId: options.correlationId
    });
    this.provider = provider;
    this.isNewDevice = options.isNewDevice;
  }
}

/**
 * Auth Logout Event
 *
 * Published when a user logs out
 */
export class AuthLogoutEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.auth.logout';

  constructor(
    tenantId: string,
    userId: string,
    sessionId: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ) {
    super(userId, tenantId, 'security.auth.logout', {
      userId,
      sessionId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      correlationId: options.correlationId
    });
  }
}

/**
 * Authorization Security Events
 */

/**
 * Auth Authorization Denied Event
 *
 * Published when a user is denied access to a resource
 */
export class AuthAuthorizationDeniedEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.auth.authorization_denied';
  readonly resource: string;
  readonly action: string;
  readonly requiredPermission?: string;

  constructor(
    tenantId: string,
    userId: string,
    resource: string,
    action: string,
    options: {
      ipAddress?: string;
      userAgent?: string;
      requiredPermission?: string;
      correlationId?: string;
    } = {}
  ) {
    super(userId, tenantId, 'security.auth.authorization_denied', {
      userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      correlationId: options.correlationId
    });
    this.resource = resource;
    this.action = action;
    this.requiredPermission = options.requiredPermission;
  }
}

/**
 * Access Control Security Events
 */

/**
 * Access Data Access Denied Event
 *
 * Published when access to data is denied
 */
export class AccessDataAccessDeniedEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.access.data_access_denied';
  readonly resource: string;
  readonly resourceType?: string;

  constructor(
    tenantId: string,
    userId: string,
    resource: string,
    options: {
      resourceType?: string;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ) {
    super(userId, tenantId, 'security.access.data_access_denied', {
      userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      correlationId: options.correlationId
    });
    this.resource = resource;
    this.resourceType = options.resourceType;
  }
}

/**
 * Threat Detection Security Events
 */

/**
 * Threat Suspicious Activity Detected Event
 *
 * Published when suspicious activity is detected
 */
export class ThreatSuspiciousActivityDetectedEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.threat.suspicious_activity_detected';
  readonly activityType: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    tenantId: string,
    userId: string,
    activityType: string,
    options: {
      details?: Readonly<Record<string, unknown>>;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ) {
    super(userId, tenantId, 'security.threat.suspicious_activity_detected', {
      userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      correlationId: options.correlationId
    });
    this.activityType = activityType;
    this.details = options.details;
  }
}

/**
 * Threat Brute Force Attempt Detected Event
 *
 * Published when a brute force attack is detected
 */
export class ThreatBruteForceAttemptDetectedEvent extends BaseSecurityEvent {
  override readonly eventType = 'security.threat.brute_force_attempt_detected';
  readonly sourceIp: string;
  readonly targetUserId?: string;
  readonly attemptCount: number;
  readonly timeWindow: number; // in seconds

  constructor(
    tenantId: string,
    sourceIp: string,
    attemptCount: number,
    timeWindow: number,
    options: {
      targetUserId?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ) {
    super(
      options.targetUserId ?? 'anonymous',
      tenantId,
      'security.threat.brute_force_attempt_detected',
      {
        userId: options.targetUserId ?? 'anonymous',
        ipAddress: sourceIp,
        userAgent: options.userAgent,
        correlationId: options.correlationId
      }
    );
    this.sourceIp = sourceIp;
    this.targetUserId = options.targetUserId;
    this.attemptCount = attemptCount;
    this.timeWindow = timeWindow;
  }
}
