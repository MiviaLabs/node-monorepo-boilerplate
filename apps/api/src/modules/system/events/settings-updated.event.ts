import type { IEvent } from '@package/types';

/**
 * System settings updated event
 *
 * Published when system-wide settings are updated.
 */
export type SystemSettingsChanges = {
  allowRegistration?: boolean;
  requireEmailVerification?: boolean;
  defaultUserRole?: string;
  maxTenantsPerUser?: number;
  sessionTimeout?: number;
  passwordPolicy?: {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
  };
};

export class SettingsUpdatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: number; // System tenant ID
  readonly updatedBy: string; // User ID who performed the update (from JWT)
  readonly changes: SystemSettingsChanges;
  readonly updatedAt: Date;
  readonly occurredAt: Date;
  readonly version = 1;

  constructor(props: { tenantId: number; updatedBy: string; changes: SystemSettingsChanges }) {
    this.aggregateId = 'system';
    this.tenantId = props.tenantId;
    this.updatedBy = props.updatedBy;
    this.changes = props.changes;
    this.updatedAt = new Date();
    this.occurredAt = new Date();
  }
}
