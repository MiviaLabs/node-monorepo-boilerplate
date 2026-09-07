import type { IEvent } from '@package/types';

/**
 * User data exported event
 *
 * Published when a user exports their data for GDPR compliance (Article 15 - Right of Access).
 * Used for audit logging and compliance tracking.
 *
 * @example
 * ```typescript
 * const event = new UserDataExportedEvent(
 *   'org-123',
 *   'user-456',
 *   new Date(),
 *   'user-456' // Self-export
 * );
 * await this.eventBus.publish(event);
 * ```
 */
export class UserDataExportedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly exportedAt: Date;
  readonly exportedBy: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(tenantId: string, userId: string, exportedAt: Date, exportedBy: string) {
    this.aggregateId = userId;
    this.tenantId = tenantId;
    this.userId = userId;
    this.exportedAt = exportedAt;
    this.exportedBy = exportedBy;
    this.occurredAt = new Date();
    this.version = 1;
  }
}
