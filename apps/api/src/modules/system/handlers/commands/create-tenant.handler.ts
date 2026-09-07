import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { organizations, tenants, type NodePgDatabase, userTenants } from '@package/db-core';
import { eq } from '@package/db-core';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { CreateTenantCommand } from '../../commands/create-tenant.command';
import { TenantResponseDto } from '../../dto';
import { buildSystemAuditEvent } from '../../events';
import { TenantRepository } from '../../repositories/tenant.repository';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for creating a new tenant
 *
 * This handler:
 * 1. Validates tenant data (slug uniqueness via organizations table)
 * 2. Creates tenant in database
 * 3. Creates organization record with subdomain routing
 * 4. Creates owner membership
 * 5. Publishes TenantCreatedEvent via transactional outbox
 */
@CommandHandler(CreateTenantCommand)
export class CreateTenantHandler implements ICommandHandler<CreateTenantCommand> {
  private readonly logger = new Logger(CreateTenantHandler.name);

  constructor(
    // Note: tenantRepo is injected but may not be directly used in all methods
    readonly tenantRepo: TenantRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: CreateTenantCommand): Promise<TenantResponseDto> {
    this.logger.debug(
      `Creating tenant: ${command.name} (slug: ${command.slug}) by actor ${command.actorId}`
    );

    // Validate actorId is a valid number
    const ownerId = Number(command.actorId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'actorId',
        expectedType: 'positive integer'
      });
    }

    // BUG-009: Use transaction for entire operation including slug uniqueness check
    // Previous implementation checked uniqueness outside transaction, creating race condition
    const result = await this.db.transaction(async (tx) => {
      // Step 1: Check slug uniqueness inside transaction (prevents race condition)
      const existingOrg = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.slug, command.slug))
        .limit(1);

      if (existingOrg.length > 0) {
        throw Errors.validationinvalidValueFor002({
          field: 'slug',
          expectedType: 'unique slug'
        });
      }

      // Step 2: Create tenant record
      const [tenant] = await tx
        .insert(tenants)
        .values({
          type: 'organization',
          status: 'active',
          settings: {}
        })
        .returning();

      // Step 3: Create organization record with subdomain routing
      if (!tenant?.id) {
        throw new Error('Tenant creation failed: missing tenant ID');
      }

      const [organization] = await tx
        .insert(organizations)
        .values({
          tenantId: tenant.id,
          ownerId,
          name: command.name,
          slug: command.slug,
          isActive: true
        })
        .returning();

      if (!tenant || !organization) {
        throw new Error('Tenant creation failed: missing tenant or organization data');
      }

      // Step 4: Create owner membership
      await tx.insert(userTenants).values({
        userId: ownerId,
        tenantId: tenant.id,
        role: 'tenant_owner',
        isDefault: false,
        isActive: true
      });

      // Step 5: Insert outbox event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'tenant.created',
        aggregateId: String(tenant.id),
        aggregateVersion: '1',
        payload: {
          tenantId: String(tenant.id),
          tenantName: command.name,
          tenantSlug: command.slug,
          organizationId: organization.id,
          ownerId: String(ownerId),
          createdAt: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(tenant.id),
        schemaVersion: '1.0'
      });

      await this.auditOutbox.insert(
        tx,
        buildSystemAuditEvent({
          eventType: 'system.tenant.created.audit',
          tenantId: tenant.id,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: tenant.id,
          action: 'CREATE_SYSTEM_TENANT',
          target: {
            entityType: 'tenant',
            entityId: String(tenant.id)
          },
          details: {
            organizationId: String(organization.id),
            ownerId: String(ownerId),
            lifecycleState: tenant.status
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      return { tenant, organization };
    });

    if (!result.tenant || !result.organization) {
      throw new Error('Tenant creation failed: missing tenant or organization data');
    }

    this.logger.log(`Tenant ${result.tenant.id} created successfully`);

    return TenantResponseDto.fromEntity({
      id: result.tenant.id,
      name: result.organization.name,
      slug: result.organization.slug,
      status: result.tenant.status,
      createdAt: result.tenant.createdAt,
      updatedAt: result.tenant.updatedAt
    });
  }
}
