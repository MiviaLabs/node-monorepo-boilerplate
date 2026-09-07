import type { ICommand } from '@package/types';

/**
 * System settings update payload
 */
export interface SystemSettingsPayload {
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
}

/**
 * Update system settings command
 *
 * Updates system-wide configuration settings.
 * This is a system-wide operation that requires elevated permissions.
 */
export class UpdateSettingsCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number; // System tenant ID
  readonly actorId: string; // User ID performing the action (from JWT)
  readonly settings: SystemSettingsPayload;
  readonly updatedAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: number;
    actorId: string;
    settings: SystemSettingsPayload;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.settings = props.settings;
    this.updatedAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
