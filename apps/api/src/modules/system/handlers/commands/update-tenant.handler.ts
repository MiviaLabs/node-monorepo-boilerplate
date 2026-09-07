import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { and, eq, ne, organizations, tenants, type NodePgDatabase } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { TenantResolutionService } from '../../../../common/services/tenant-resolution.service';
import { UpdateTenantCommand } from '../../commands/update-tenant.command';
import { TenantResponseDto } from '../../dto';
import { buildSystemAuditEvent } from '../../events';
import { TenantRepository } from '../../repositories/tenant.repository';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

// eslint-disable-next-line local-rules/prefer-const-enum
type TenantStatus = 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

/**
 * Handler for updating an existing tenant
 *
 * This handler:
 * 1. Validates tenant exists
 * 2. Validates tenant data (slug uniqueness if changed)
 * 3. Updates tenant/organization in database
 * 4. Publishes TenantUpdatedEvent via transactional outbox
 */
@CommandHandler(UpdateTenantCommand)
export class UpdateTenantHandler implements ICommandHandler<UpdateTenantCommand> {
  private readonly logger = new Logger(UpdateTenantHandler.name);

  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly tenantResolutionService: TenantResolutionService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateTenantCommand): Promise<TenantResponseDto> {
    this.logger.debug(`Updating tenant ${command.targetTenantId} by actor ${command.actorId}`);

    // Validate targetTenantId is a valid number
    const targetTenantId = Number(command.targetTenantId);
    if (!Number.isInteger(targetTenantId) || targetTenantId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'targetTenantId',
        expectedType: 'positive integer'
      });
    }

    // Step 1: Validation (before transaction)
    // System operations are not tenant-scoped to a caller tenant.
    // Validate existence by target tenant id directly.
    await this.tenantRepo.findByIdOrThrow(targetTenantId, targetTenantId);

    const [existingOrganization] = await this.db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.tenantId, targetTenantId))
      .limit(1);

    // If updating slug, check uniqueness
    if (command.slug) {
      const existingOrg = await this.db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(eq(organizations.slug, command.slug), ne(organizations.tenantId, targetTenantId))
        )
        .limit(1);

      if (existingOrg.length > 0) {
        throw Errors.validationinvalidValueFor002({
          field: 'slug',
          expectedType: 'unique slug'
        });
      }
    }

    // Step 2: Single transaction for all writes
    await this.db.transaction(async (tx) => {
      const changes: Record<string, unknown> = {};

      // Update tenant status if provided
      if (command.status) {
        const [updatedTenant] = await tx
          .update(tenants)
          .set({ status: command.status, updatedAt: new Date() })
          .where(eq(tenants.id, targetTenantId))
          .returning();

        if (!updatedTenant) {
          throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
        }
        changes['status'] = command.status;
      }

      // Update organization name/slug if provided
      if (command.name || command.slug) {
        const orgUpdate: Record<string, unknown> = { updatedAt: new Date() };
        if (command.name) orgUpdate['name'] = command.name;
        if (command.slug) orgUpdate['slug'] = command.slug;

        const [updatedOrg] = await tx
          .update(organizations)
          .set(orgUpdate)
          .where(eq(organizations.tenantId, targetTenantId))
          .returning();

        if (!updatedOrg) {
          throw Errors.databaserecordNotFound004({ entity: 'Organization' });
        }
        if (command.name) changes['name'] = command.name;
        if (command.slug) changes['slug'] = command.slug;
      }

      // Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.updated',
        aggregateId: String(targetTenantId),
        aggregateVersion: '1',
        payload: {
          tenantId: String(targetTenantId),
          changes,
          updatedBy: command.actorId,
          updatedAt: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(targetTenantId),
        schemaVersion: '1.0'
      });

      await this.auditOutbox.insert(
        tx,
        buildSystemAuditEvent({
          eventType: 'system.tenant.updated.audit',
          tenantId: targetTenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: targetTenantId,
          action: 'UPDATE_SYSTEM_TENANT',
          target: {
            entityType: 'tenant',
            entityId: String(targetTenantId)
          },
          details: {
            updatedFields: Object.keys(changes).sort(),
            ...(command.status ? { status: command.status } : {})
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });

    await this.tenantResolutionService.invalidateTenantCache(targetTenantId, {
      previousSlug: existingOrganization?.slug ?? null
    });

    this.logger.log(`Tenant ${targetTenantId} updated successfully`);

    const [currentRecord] = await this.db
      .select({
        id: tenants.id,
        status: tenants.status,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
        name: organizations.name,
        slug: organizations.slug
      })
      .from(tenants)
      .innerJoin(organizations, eq(organizations.tenantId, tenants.id))
      .where(eq(tenants.id, targetTenantId))
      .limit(1);

    if (!currentRecord) {
      throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
    }

    return TenantResponseDto.fromEntity({
      id: currentRecord.id,
      name: currentRecord.name,
      slug: currentRecord.slug,
      status: currentRecord.status as TenantStatus,
      createdAt: currentRecord.createdAt,
      updatedAt: currentRecord.updatedAt
    });
  }
}
