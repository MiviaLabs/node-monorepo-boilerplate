import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEMBERS_PAGE,
  DEFAULT_MEMBERS_PAGE_SIZE,
  parseMembersQueryParams,
  toMembersQuerySearchParams
} from './members-query-params';

import { MemberStatus, SortByField, SortOrder, TENANT_ROLES } from '~/types/tenant.types';

describe('members-query-params', () => {
  it('parses valid query params into normalized state', () => {
    const result = parseMembersQueryParams(
      new URLSearchParams({
        page: '2',
        pageSize: '25',
        search: 'alice',
        role: 'tenant_admin',
        status: 'active',
        sortBy: 'email',
        sortOrder: 'asc'
      })
    );

    expect(result).toEqual({
      page: 2,
      pageSize: 25,
      search: 'alice',
      role: TENANT_ROLES.ADMIN,
      status: MemberStatus.ACTIVE,
      sortBy: SortByField.EMAIL,
      sortOrder: SortOrder.ASC
    });
  });

  it('falls back to defaults for invalid query params', () => {
    const result = parseMembersQueryParams(
      new URLSearchParams({
        page: '-1',
        pageSize: '999',
        role: 'super-admin',
        status: 'archived',
        sortBy: 'name',
        sortOrder: 'up'
      })
    );

    expect(result).toEqual({
      page: DEFAULT_MEMBERS_PAGE,
      pageSize: 100,
      search: undefined,
      role: undefined,
      status: undefined,
      sortBy: undefined,
      sortOrder: undefined
    });
  });

  it('serializes non-default query params', () => {
    const params = toMembersQuerySearchParams({
      page: 2,
      pageSize: 25,
      search: 'alice',
      role: TENANT_ROLES.ADMIN,
      status: MemberStatus.ACTIVE,
      sortBy: SortByField.EMAIL,
      sortOrder: SortOrder.ASC
    });

    expect(params.toString()).toBe(
      'page=2&pageSize=25&search=alice&role=tenant_admin&status=active&sortBy=email&sortOrder=asc'
    );
  });

  it('omits default page and page size from the URL', () => {
    const params = toMembersQuerySearchParams({
      page: DEFAULT_MEMBERS_PAGE,
      pageSize: DEFAULT_MEMBERS_PAGE_SIZE,
      search: undefined,
      role: undefined,
      status: undefined,
      sortBy: undefined,
      sortOrder: undefined
    });

    expect(params.toString()).toBe('');
  });
});
