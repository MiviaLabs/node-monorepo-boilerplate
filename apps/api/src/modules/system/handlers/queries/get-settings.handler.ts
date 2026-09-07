import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { eq, organizations, tenants, type NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { SystemSettingsDto } from '../../dto';
import { buildSystemAuditEvent } from '../../events';
import { GetSettingsQuery } from '../../queries/get-settings.query';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for getting system settings
 *
 * This handler:
 * 1. Reads persisted tenant settings for the current system/settings scope
 * 2. Layers stable defaults onto missing keys
 * 3. Returns the current effective settings contract
 */
@QueryHandler(GetSettingsQuery)
export class GetSettingsHandler implements IQueryHandler<GetSettingsQuery, SystemSettingsDto> {
  private readonly logger = new Logger(GetSettingsHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(query: GetSettingsQuery): Promise<SystemSettingsDto> {
    this.logger.debug('Fetching system settings');

    const persistedSettings = await this.loadPersistedSettings(query.tenantId);
    const settings = this.withDefaults(persistedSettings);

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.settings.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: query.tenantId,
        action: 'VIEW_SYSTEM_SETTINGS',
        target: {
          entityType: 'system_settings',
          entityId: String(query.tenantId)
        },
        details: {
          settingKeys: Object.keys(settings).sort()
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return settings;
  }

  private withDefaults(rawSettings?: Record<string, unknown>): SystemSettingsDto {
    const passwordPolicy = (rawSettings?.['passwordPolicy'] as
      | Partial<SystemSettingsDto['passwordPolicy']>
      | undefined) ?? {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false
    };

    return {
      ...(rawSettings ?? {}),
      allowRegistration: (rawSettings?.['allowRegistration'] as boolean | undefined) ?? true,
      requireEmailVerification:
        (rawSettings?.['requireEmailVerification'] as boolean | undefined) ?? true,
      defaultUserRole: (rawSettings?.['defaultUserRole'] as string | undefined) ?? 'tenant_user',
      maxTenantsPerUser: (rawSettings?.['maxTenantsPerUser'] as number | undefined) ?? 1,
      sessionTimeout: (rawSettings?.['sessionTimeout'] as number | undefined) ?? 3600,
      passwordPolicy
    } satisfies SystemSettingsDto;
  }

  private async loadPersistedSettings(
    tenantId: number
  ): Promise<Record<string, unknown> | undefined> {
    const [directTenant] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (directTenant?.settings && this.isRecord(directTenant.settings)) {
      return directTenant.settings;
    }

    const [organizationTenant] = await this.db
      .select({ settings: tenants.settings })
      .from(organizations)
      .innerJoin(tenants, eq(tenants.id, organizations.tenantId))
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (organizationTenant?.settings && this.isRecord(organizationTenant.settings)) {
      return organizationTenant.settings;
    }

    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
