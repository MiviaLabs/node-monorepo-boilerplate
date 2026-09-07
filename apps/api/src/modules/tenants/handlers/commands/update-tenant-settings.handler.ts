import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq, organizations, tenants, type NodePgDatabase } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { TenantResolutionService } from '../../../../common/services/tenant-resolution.service';
import { TenantRepository } from '../../../system/repositories/tenant.repository';
import { UpdateTenantSettingsCommand } from '../../commands/update-tenant-settings.command';
import { buildTenantAuditEvent } from '../../events/tenant-audit-event';

/**
 * Update tenant settings command handler
 *
 * Handles updating tenant settings and publishes the corresponding event
 */
@CommandHandler(UpdateTenantSettingsCommand)
export class UpdateTenantSettingsHandler implements ICommandHandler<UpdateTenantSettingsCommand> {
  private readonly logger = new Logger(UpdateTenantSettingsHandler.name);

  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly tenantResolutionService: TenantResolutionService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateTenantSettingsCommand): Promise<Record<string, unknown>> {
    this.logger.debug(
      `Updating tenant settings for tenant: ${command.tenantId} by actor: ${command.actorId}`
    );

    // Validate tenantId is a valid number
    const tenantId = Number(command.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }

    // Step 1: Validation (before transaction)
    const tenant = await this.tenantRepo.findByIdOrThrow(tenantId, tenantId);

    // Step 2: Single transaction for all writes
    const result = await this.db.transaction(async (tx) => {
      const changes: Record<string, unknown> = {};

      // Update editable organization display name if provided
      if (command.settings.displayName) {
        await tx
          .update(organizations)
          .set({ displayName: command.settings.displayName, updatedAt: new Date() })
          .where(eq(organizations.tenantId, tenantId));
        changes['displayName'] = command.settings.displayName;
      }

      // Update organization isActive if provided
      if (command.settings.isActive !== undefined) {
        await tx
          .update(organizations)
          .set({ isActive: command.settings.isActive, updatedAt: new Date() })
          .where(eq(organizations.tenantId, tenantId));
        changes['isActive'] = command.settings.isActive;
      }

      // Merge settings with existing tenant settings
      if (command.settings.settings) {
        const mergedSettings = {
          ...(tenant.settings as Record<string, unknown>),
          ...command.settings.settings
        };

        await tx
          .update(tenants)
          .set({ settings: mergedSettings, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));
        changes['settings'] = mergedSettings;
      }

      // Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.settings.updated',
        aggregateId: String(tenantId),
        aggregateVersion: '1',
        payload: {
          tenantId: String(tenantId),
          changes,
          updatedBy: command.actorId,
          updatedAt: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(tenantId),
        schemaVersion: '1.0'
      });

      await this.outboxRepo.insert(
        tx,
        buildTenantAuditEvent({
          eventType: 'tenant.settings.updated.audit',
          tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          action: 'UPDATE_TENANT_SETTINGS',
          details: {
            changedFields: Object.keys(changes).sort()
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return { tenant, changes };
    });

    await this.tenantResolutionService.invalidateTenantCache(tenantId);

    this.logger.log(`Tenant settings updated successfully for tenant ${tenantId}`);

    return result.changes;
  }
}
