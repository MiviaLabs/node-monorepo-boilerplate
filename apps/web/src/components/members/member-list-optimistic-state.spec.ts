import { describe, expect, it } from 'vitest';

import {
  applyMembersOptimisticAction,
  createMembersOptimisticState,
  snapshotMember
} from './member-list-optimistic-state';

import { MemberStatus, TENANT_ROLES, type TenantMember } from '~/types/tenant.types';

const alpha: TenantMember = {
  id: 'member-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  email: 'alpha@example.com',
  displayName: 'Alpha',
  role: TENANT_ROLES.USER,
  status: MemberStatus.ACTIVE,
  isActive: true,
  isDefault: false,
  joinedAt: '2024-01-01T00:00:00Z'
};

const beta: TenantMember = {
  id: 'member-2',
  userId: 'user-2',
  tenantId: 'tenant-1',
  email: 'beta@example.com',
  displayName: 'Beta',
  role: TENANT_ROLES.ADMIN,
  status: MemberStatus.SUSPENDED,
  isActive: false,
  isDefault: false,
  joinedAt: '2024-01-02T00:00:00Z'
};

describe('member-list optimistic state', () => {
  it('captures a member snapshot for rollback', () => {
    const state = createMembersOptimisticState([alpha, beta], 7);

    expect(snapshotMember(state, alpha.id)).toEqual({
      index: 0,
      member: alpha
    });
  });

  it('updates role optimistically without changing total count', () => {
    const state = createMembersOptimisticState([alpha, beta], 7);

    const nextState = applyMembersOptimisticAction(state, {
      type: 'updateRole',
      memberId: alpha.id,
      role: TENANT_ROLES.ADMIN
    });

    expect(nextState.members[0]?.role).toBe(TENANT_ROLES.ADMIN);
    expect(nextState.total).toBe(7);
  });

  it('updates status optimistically without changing total count', () => {
    const state = createMembersOptimisticState([alpha, beta], 7);

    const nextState = applyMembersOptimisticAction(state, {
      type: 'updateStatus',
      memberId: beta.id,
      status: MemberStatus.ACTIVE
    });

    expect(nextState.members[1]?.status).toBe(MemberStatus.ACTIVE);
    expect(nextState.total).toBe(7);
  });

  it('removes a member optimistically and decrements the total once', () => {
    const state = createMembersOptimisticState([alpha, beta], 7);

    const nextState = applyMembersOptimisticAction(state, {
      type: 'removeMember',
      memberId: alpha.id
    });

    expect(nextState.members).toEqual([beta]);
    expect(nextState.total).toBe(6);
  });

  it('restores a removed member at the original index and increments total', () => {
    const initialState = createMembersOptimisticState([alpha, beta], 7);
    const snapshot = snapshotMember(initialState, alpha.id);
    const removedState = applyMembersOptimisticAction(initialState, {
      type: 'removeMember',
      memberId: alpha.id
    });

    const restoredState = applyMembersOptimisticAction(removedState, {
      type: 'restoreMember',
      snapshot: snapshot!
    });

    expect(restoredState.members).toEqual([alpha, beta]);
    expect(restoredState.total).toBe(7);
  });

  it('restores an updated member in place without incrementing total', () => {
    const initialState = createMembersOptimisticState([alpha, beta], 7);
    const snapshot = snapshotMember(initialState, alpha.id);
    const updatedState = applyMembersOptimisticAction(initialState, {
      type: 'updateRole',
      memberId: alpha.id,
      role: TENANT_ROLES.ADMIN
    });

    const restoredState = applyMembersOptimisticAction(updatedState, {
      type: 'restoreMember',
      snapshot: snapshot!
    });

    expect(restoredState.members[0]).toEqual(alpha);
    expect(restoredState.total).toBe(7);
  });
});
