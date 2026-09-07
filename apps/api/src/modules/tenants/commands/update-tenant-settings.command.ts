import type { UpdateTenantSettingsDto } from '../dto';
import type { ICommand } from '@package/types';

/**
 * Update tenant settings command
 *
 * Updates the current tenant's settings within the tenant scope
 */
export class UpdateTenantSettingsCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly settings: UpdateTenantSettingsDto;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    settings: UpdateTenantSettingsDto;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.settings = props.settings;
    this.createdAt = new Date();
    if (props.requestId !== undefined) {
      this.requestId = props.requestId;
    }
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
