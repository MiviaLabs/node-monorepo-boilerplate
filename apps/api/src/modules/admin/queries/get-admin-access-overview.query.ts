import type { QueryAdminAccessOverviewDto } from '../dto';
import type { IQuery } from '@package/types';

type GetAdminAccessOverviewQueryProps = QueryAdminAccessOverviewDto & {
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
};

export class GetAdminAccessOverviewQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly memberPage: number;
  readonly memberPageSize: number;
  readonly memberSearch?: string;
  readonly memberOrganizationId?: number;
  readonly memberTenantId?: number;
  readonly memberRecordState: NonNullable<QueryAdminAccessOverviewDto['memberRecordState']>;
  readonly memberStatus?: QueryAdminAccessOverviewDto['memberStatus'];
  readonly memberPrivilege: NonNullable<QueryAdminAccessOverviewDto['memberPrivilege']>;
  readonly memberRole?: QueryAdminAccessOverviewDto['memberRole'];
  readonly memberSortBy: NonNullable<QueryAdminAccessOverviewDto['memberSortBy']>;
  readonly memberSortOrder: NonNullable<QueryAdminAccessOverviewDto['memberSortOrder']>;
  readonly invitationPage: number;
  readonly invitationPageSize: number;
  readonly invitationSearch?: string;
  readonly invitationStatus?: QueryAdminAccessOverviewDto['invitationStatus'];
  readonly invitationPrivilege: NonNullable<
    QueryAdminAccessOverviewDto['invitationPrivilege']
  >;
  readonly invitationRole?: QueryAdminAccessOverviewDto['invitationRole'];
  readonly invitationSortBy: NonNullable<QueryAdminAccessOverviewDto['invitationSortBy']>;
  readonly invitationSortOrder: NonNullable<
    QueryAdminAccessOverviewDto['invitationSortOrder']
  >;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: GetAdminAccessOverviewQueryProps = {}) {
    const memberSearch = props.memberSearch?.trim();
    const invitationSearch = props.invitationSearch?.trim();

    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.memberPage = props.memberPage ?? 1;
    this.memberPageSize = props.memberPageSize ?? 20;
    this.memberSearch = memberSearch && memberSearch.length > 0 ? memberSearch : undefined;
    this.memberOrganizationId = props.memberOrganizationId;
    this.memberTenantId = props.memberTenantId;
    this.memberRecordState = props.memberRecordState ?? 'active';
    this.memberStatus = props.memberStatus;
    this.memberPrivilege = props.memberPrivilege ?? 'all';
    this.memberRole = props.memberRole;
    this.memberSortBy = props.memberSortBy ?? 'displayName';
    this.memberSortOrder = props.memberSortOrder ?? 'asc';
    this.invitationPage = props.invitationPage ?? 1;
    this.invitationPageSize = props.invitationPageSize ?? 10;
    this.invitationSearch =
      invitationSearch && invitationSearch.length > 0 ? invitationSearch : undefined;
    this.invitationStatus = props.invitationStatus;
    this.invitationPrivilege = props.invitationPrivilege ?? 'all';
    this.invitationRole = props.invitationRole;
    this.invitationSortBy = props.invitationSortBy ?? 'createdAt';
    this.invitationSortOrder = props.invitationSortOrder ?? 'desc';
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
