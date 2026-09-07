import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { OutboxRepository } from '@package/events';

import { ProvisionGcpTenantCommand } from '../../commands/provision-gcp-tenant.command';
import { buildTenantAuditEvent } from '../../events/tenant-audit-event';
import { TenantManagementService } from '../../services/tenant-management.service';

import type { NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';

/**
 * Provision GCP Tenant Handler
 *
 * Handles provisioning of GCP Identity Platform tenants for organizations.
 * Uses transactional safety to ensure both GCP tenant and org update succeed.
 */
@CommandHandler(ProvisionGcpTenantCommand)
export class ProvisionGcpTenantHandler implements ICommandHandler<ProvisionGcpTenantCommand> {
  private readonly logger = new Logger(ProvisionGcpTenantHandler.name);

  constructor(
    private readonly tenantManagementService: TenantManagementService,
    private readonly outboxRepo: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase,
    // Note: eventBus is injected but may not be directly used in all methods
    readonly eventBus: EventBus
  ) {}

  async execute(command: ProvisionGcpTenantCommand): Promise<{
    organizationId: number;
    gcpTenantId: string;
    displayName: string;
  }> {
    this.logger.log(
      `Provisioning GCP tenant for organization ${command.organizationId} by actor ${command.actorId}`
    );

    // Provision GCP tenant and link to organization atomically
    const gcpTenant = await this.tenantManagementService.provisionGcpTenantForOrganization(
      command.organizationId,
      {
        displayName: command.displayName,
        emailSignInEnabled: true
      }
    );

    this.logger.log(
      `Successfully provisioned GCP tenant ${gcpTenant.tenantId} for organization ${command.organizationId}`
    );

    await this.db.transaction(async (tx) => {
      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.gcp.provisioned.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: command.organizationId,
          action: 'PROVISION_GCP_TENANT',
          details: {
            organizationId: String(command.organizationId),
            gcpTenantId: gcpTenant.tenantId
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    return {
      organizationId: command.organizationId,
      gcpTenantId: gcpTenant.tenantId,
      displayName: gcpTenant.displayName
    };
  }
}
