import type { ProvisionGcpTenantCommandProps } from '../tenants.types';
import type { ICommand } from '@package/types';

/**
 * Provision GCP Tenant Command
 *
 * Creates a new GCP Identity Platform tenant for an organization.
 * Uses transactional safety to ensure both GCP tenant and org update succeed.
 */
export class ProvisionGcpTenantCommand implements ICommand {
  readonly tenantId: string;
  readonly actorId: string;
  readonly organizationId: number;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly readonly = true;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: ProvisionGcpTenantCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.organizationId = props.organizationId;
    this.displayName = props.displayName;
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
