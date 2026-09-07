import type { TenantMember, TenantRole } from '~/types/tenant.types';

import { MemberStatus } from '~/types/tenant.types';

export interface MemberOptimisticSnapshot {
  index: number;
  member: TenantMember;
}

export interface MembersOptimisticState {
  members: TenantMember[];
  total: number;
}

export type MembersOptimisticAction =
  | { type: 'updateRole'; memberId: string; role: TenantRole }
  | { type: 'updateStatus'; memberId: string; status: MemberStatus }
  | { type: 'removeMember'; memberId: string }
  | { type: 'restoreMember'; snapshot: MemberOptimisticSnapshot };

export function createMembersOptimisticState(
  members: TenantMember[],
  total: number
): MembersOptimisticState {
  return {
    members,
    total
  };
}

export function snapshotMember(
  state: MembersOptimisticState,
  memberId: string
): MemberOptimisticSnapshot | undefined {
  const index = state.members.findIndex((member) => member.id === memberId);

  if (index < 0) {
    return undefined;
  }

  return {
    index,
    member: state.members[index]!
  };
}

export function applyMembersOptimisticAction(
  state: MembersOptimisticState,
  action: MembersOptimisticAction
): MembersOptimisticState {
  switch (action.type) {
    case 'updateRole':
      return {
        ...state,
        members: state.members.map((member) =>
          member.id === action.memberId ? { ...member, role: action.role } : member
        )
      };
    case 'updateStatus':
      return {
        ...state,
        members: state.members.map((member) =>
          member.id === action.memberId ? { ...member, status: action.status } : member
        )
      };
    case 'removeMember': {
      const nextMembers = state.members.filter((member) => member.id !== action.memberId);
      const didRemoveMember = nextMembers.length !== state.members.length;

      return {
        members: nextMembers,
        total: didRemoveMember ? Math.max(0, state.total - 1) : state.total
      };
    }
    case 'restoreMember': {
      const existingIndex = state.members.findIndex(
        (member) => member.id === action.snapshot.member.id
      );

      if (existingIndex >= 0) {
        return {
          ...state,
          members: state.members.map((member, index) =>
            index === existingIndex ? action.snapshot.member : member
          )
        };
      }

      const insertionIndex = Math.max(0, Math.min(action.snapshot.index, state.members.length));
      const nextMembers = [...state.members];
      nextMembers.splice(insertionIndex, 0, action.snapshot.member);

      return {
        members: nextMembers,
        total: state.total + 1
      };
    }
    default:
      return state;
  }
}
