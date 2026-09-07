import type { QueryAdminDeletionsOverviewDto } from '../dto';
import type { IQuery } from '@package/types';

type GetAdminDeletionsOverviewQueryProps = QueryAdminDeletionsOverviewDto & {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminDeletionsOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly entityType: NonNullable<QueryAdminDeletionsOverviewDto['entityType']>;
  readonly purgeState: NonNullable<QueryAdminDeletionsOverviewDto['purgeState']>;
  readonly providerState: NonNullable<QueryAdminDeletionsOverviewDto['providerState']>;
  readonly sortBy: NonNullable<QueryAdminDeletionsOverviewDto['sortBy']>;
  readonly sortOrder: NonNullable<QueryAdminDeletionsOverviewDto['sortOrder']>;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminDeletionsOverviewQueryProps = {}) {
    const search = props.search?.trim();

    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.search = search && search.length > 0 ? search : undefined;
    this.entityType = props.entityType ?? 'all';
    this.purgeState = props.purgeState ?? 'all';
    this.providerState = props.providerState ?? 'all';
    this.sortBy = props.sortBy ?? 'scheduledPurgeAt';
    this.sortOrder = props.sortOrder ?? 'asc';
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
