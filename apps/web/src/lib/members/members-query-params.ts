import type { MemberFilters, TenantRole } from '~/types/tenant.types';

import { MemberStatus, SortByField, SortOrder, TENANT_ROLES } from '~/types/tenant.types';

export interface MembersQueryState extends MemberFilters {
  page: number;
  pageSize: number;
}

export const DEFAULT_MEMBERS_PAGE = 1;
export const DEFAULT_MEMBERS_PAGE_SIZE = 50;
const MAX_MEMBERS_PAGE_SIZE = 100;

const VALID_ROLES = new Set<TenantRole>(Object.values(TENANT_ROLES));
const VALID_STATUSES = new Set<MemberStatus>([
  MemberStatus.ACTIVE,
  MemberStatus.INACTIVE,
  MemberStatus.SUSPENDED,
  MemberStatus.PENDING
]);
const VALID_SORT_BY = new Set<SortByField>([
  SortByField.EMAIL,
  SortByField.DISPLAY_NAME,
  SortByField.ROLE,
  SortByField.JOINED_AT,
  SortByField.STATUS
]);
const VALID_SORT_ORDER = new Set<SortOrder>([SortOrder.ASC, SortOrder.DESC]);

type RawSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

function getParam(params: RawSearchParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined;
  }

  const value = params[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return typeof max === 'number' ? Math.min(value, max) : value;
}

/**
 * Parse members table query params from URL-like input into normalized state.
 *
 * @param params - URLSearchParams or Next.js searchParams object.
 * @param defaults - Optional defaults for page and pageSize.
 * @returns Normalized members query state for SSR/CSR usage.
 */
export function parseMembersQueryParams(
  params: RawSearchParams,
  defaults: { page?: number; pageSize?: number } = {}
): MembersQueryState {
  const defaultPage = defaults.page ?? DEFAULT_MEMBERS_PAGE;
  const defaultPageSize = defaults.pageSize ?? DEFAULT_MEMBERS_PAGE_SIZE;

  const page = parsePositiveInt(getParam(params, 'page'), defaultPage);
  const pageSize = parsePositiveInt(
    getParam(params, 'pageSize'),
    defaultPageSize,
    MAX_MEMBERS_PAGE_SIZE
  );

  const searchRaw = getParam(params, 'search')?.trim();
  const search = searchRaw && searchRaw.length > 0 ? searchRaw : undefined;
  const roleRaw = getParam(params, 'role');
  const statusRaw = getParam(params, 'status');
  const sortByRaw = getParam(params, 'sortBy');
  const sortOrderRaw = getParam(params, 'sortOrder');

  const role =
    roleRaw && VALID_ROLES.has(roleRaw as TenantRole) ? (roleRaw as TenantRole) : undefined;
  const status =
    statusRaw && VALID_STATUSES.has(statusRaw as MemberStatus)
      ? (statusRaw as MemberStatus)
      : undefined;
  const sortBy =
    sortByRaw && VALID_SORT_BY.has(sortByRaw as SortByField)
      ? (sortByRaw as SortByField)
      : undefined;
  const sortOrder =
    sortOrderRaw && VALID_SORT_ORDER.has(sortOrderRaw as SortOrder)
      ? (sortOrderRaw as SortOrder)
      : undefined;

  return {
    page,
    pageSize,
    search,
    role,
    status,
    sortBy,
    sortOrder
  };
}

/**
 * Serialize members query state into URLSearchParams.
 *
 * @param query - Members query state to serialize.
 * @param defaults - Optional defaults that should be omitted from URL.
 * @returns URLSearchParams containing non-default query values.
 */
export function toMembersQuerySearchParams(
  query: MembersQueryState,
  defaults: { page?: number; pageSize?: number } = {}
): URLSearchParams {
  const defaultPage = defaults.page ?? DEFAULT_MEMBERS_PAGE;
  const defaultPageSize = defaults.pageSize ?? DEFAULT_MEMBERS_PAGE_SIZE;
  const params = new URLSearchParams();

  if (query.page !== defaultPage) {
    params.set('page', String(query.page));
  }

  if (query.pageSize !== defaultPageSize) {
    params.set('pageSize', String(query.pageSize));
  }

  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);

  return params;
}
