import type { QueryAdminEmailsOverviewDto } from '../dto';
import type { IQuery } from '@package/types';

type GetAdminEmailsOverviewQueryProps = QueryAdminEmailsOverviewDto & {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminEmailsOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly organizationId?: number;
  readonly messageStatus: NonNullable<QueryAdminEmailsOverviewDto['messageStatus']>;
  readonly provider?: string;
  readonly providerStatus?: string;
  readonly normalizedProviderStatus?: string;
  readonly referenceType?: string;
  readonly referenceId?: string;
  readonly webhookAttentionState: NonNullable<
    QueryAdminEmailsOverviewDto['webhookAttentionState']
  >;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly sortBy: NonNullable<QueryAdminEmailsOverviewDto['sortBy']>;
  readonly sortOrder: NonNullable<QueryAdminEmailsOverviewDto['sortOrder']>;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminEmailsOverviewQueryProps = {}) {
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.search = props.search?.trim() ?? undefined;
    this.organizationId = props.organizationId;
    this.messageStatus = props.messageStatus ?? 'all';
    this.provider = props.provider?.trim() ?? undefined;
    this.providerStatus = props.providerStatus?.trim() ?? undefined;
    this.normalizedProviderStatus = props.normalizedProviderStatus?.trim() ?? undefined;
    this.referenceType = props.referenceType?.trim() ?? undefined;
    this.referenceId = props.referenceId?.trim() ?? undefined;
    this.webhookAttentionState = props.webhookAttentionState ?? 'all';
    this.dateFrom = props.dateFrom;
    this.dateTo = props.dateTo;
    this.sortBy = props.sortBy ?? 'createdAt';
    this.sortOrder = props.sortOrder ?? 'desc';
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
