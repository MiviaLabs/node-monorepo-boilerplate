import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { organizations, sql, tenants, type NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { TenantResponseDto } from '../../dto';
import { buildSystemAuditEvent } from '../../events';
import { ListTenantsQuery, TenantListStatus } from '../../queries/list-tenants.query';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for listing all tenants
 *
 * This handler:
 * 1. Queries real tenant + organization records
 * 2. Optionally filters by status
 * 3. Returns the current system tenant inventory
 */
@QueryHandler(ListTenantsQuery)
export class ListTenantsHandler implements IQueryHandler<ListTenantsQuery, TenantResponseDto[]> {
  private readonly logger = new Logger(ListTenantsHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(query: ListTenantsQuery): Promise<TenantResponseDto[]> {
    this.logger.debug(`Listing all tenants${query.status ? ` with status: ${query.status}` : ''}`);

    const statusFilter =
      query.status !== undefined && query.status !== TenantListStatus.All
        ? sql`where ${tenants.status} = ${query.status}`
        : sql``;

    const result = await this.db.execute(sql`
      select
        ${tenants.id} as tenant_id,
        coalesce(${organizations.displayName}, ${organizations.name}) as tenant_name,
        ${organizations.slug} as tenant_slug,
        ${tenants.status} as tenant_status,
        ${tenants.createdAt} as tenant_created_at,
        ${tenants.updatedAt} as tenant_updated_at
      from ${tenants}
      inner join ${organizations}
        on ${organizations.tenantId} = ${tenants.id}
      ${statusFilter}
      order by ${tenants.createdAt} desc, ${tenants.id} desc
    `);

    const listedTenants = result.rows.map((row) =>
      TenantResponseDto.fromEntity({
        id: this.toInt(row['tenant_id']),
        name: this.toText(row['tenant_name']),
        slug: this.toText(row['tenant_slug']),
        status: this.toText(row['tenant_status']),
        createdAt: this.toDate(row['tenant_created_at']),
        updatedAt: this.toOptionalDate(row['tenant_updated_at'])
      })
    );

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.tenants.listed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'system',
        action: 'LIST_SYSTEM_TENANTS',
        target: {
          entityType: 'system'
        },
        details: {
          resultCount: listedTenants.length,
          statusFilter: query.status ?? 'all'
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return listedTenants;
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private toText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return `${value}`;
    }

    return '';
  }

  private toDate(value: unknown): Date {
    return value instanceof Date ? value : new Date(String(value));
  }

  private toOptionalDate(value: unknown): Date | undefined {
    return value === null || value === undefined ? undefined : this.toDate(value);
  }
}
