import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { eq, tenants, type NodePgDatabase } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import {
  UpdateSettingsCommand,
  SystemSettingsPayload
} from '../../commands/update-settings.command';
import { SystemSettingsDto } from '../../dto';
import { buildSystemAuditEvent } from '../../events';
import { TenantRepository } from '../../repositories/tenant.repository';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for updating system settings
 *
 * This handler:
 * 1. Validates settings data
 * 2. Updates tenant settings in database
 * 3. Publishes SettingsUpdatedEvent via transactional outbox
 */
@CommandHandler(UpdateSettingsCommand)
export class UpdateSettingsHandler implements ICommandHandler<UpdateSettingsCommand> {
  private readonly logger = new Logger(UpdateSettingsHandler.name);

  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateSettingsCommand): Promise<SystemSettingsDto> {
    this.logger.debug(`Updating system settings by actor ${command.actorId}`);

    // Step 1: Validation (before transaction) - validate settings JSONB
    if (!command.settings || typeof command.settings !== 'object') {
      throw Errors.validationvalidationFailedField001({
        field: 'settings'
      });
    }

    // Get the tenant to update (system tenant)
    const tenant = await this.tenantRepo.findByIdOrThrow(command.tenantId, command.tenantId);

    // Step 2: Single transaction for all writes
    const result = await this.db.transaction(async (tx) => {
      // Merge with existing settings
      const mergedSettings = {
        ...(tenant.settings ?? {}),
        ...command.settings
      };

      // Update tenant settings
      const [updatedTenant] = await tx
        .update(tenants)
        .set({
          settings: mergedSettings as typeof tenants.$inferInsert.settings,
          updatedAt: new Date()
        })
        .where(eq(tenants.id, command.tenantId))
        .returning();

      if (!updatedTenant) {
        throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
      }

      // Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.settings.updated',
        aggregateId: String(command.tenantId),
        aggregateVersion: '1',
        payload: {
          tenantId: String(command.tenantId),
          changes: command.settings,
          updatedBy: command.actorId,
          updatedAt: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(command.tenantId),
        schemaVersion: '1.0'
      });

      await this.auditOutbox.insert(
        tx,
        buildSystemAuditEvent({
          eventType: 'system.settings.updated.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: command.tenantId,
          action: 'UPDATE_SYSTEM_SETTINGS',
          target: {
            entityType: 'system_settings',
            entityId: String(command.tenantId)
          },
          details: {
            updatedSettingKeys: Object.keys(command.settings).sort()
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return { tenant: updatedTenant, mergedSettings };
    });

    this.logger.log(`System settings updated successfully for tenant ${command.tenantId}`);

    // Return merged settings as response - cast to SystemSettingsDto type
    return {
      ...(result.mergedSettings as Record<string, unknown>),
      allowRegistration:
        ((result.mergedSettings as Record<string, unknown>)['allowRegistration'] as
          | boolean
          | undefined) ?? true,
      requireEmailVerification:
        ((result.mergedSettings as Record<string, unknown>)['requireEmailVerification'] as
          | boolean
          | undefined) ?? true,
      defaultUserRole:
        ((result.mergedSettings as Record<string, unknown>)['defaultUserRole'] as
          | string
          | undefined) ?? 'tenant_user',
      maxTenantsPerUser:
        ((result.mergedSettings as Record<string, unknown>)['maxTenantsPerUser'] as
          | number
          | undefined) ?? 1,
      sessionTimeout:
        ((result.mergedSettings as Record<string, unknown>)['sessionTimeout'] as
          | number
          | undefined) ?? 3600,
      passwordPolicy: ((result.mergedSettings as Record<string, unknown>)['passwordPolicy'] as
        | SystemSettingsPayload['passwordPolicy']
        | undefined) ?? {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false
      }
    } as SystemSettingsDto;
  }
}
