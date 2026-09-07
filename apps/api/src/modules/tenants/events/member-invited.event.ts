import type { IEvent } from '@package/types';

// eslint-disable-next-line local-rules/prefer-const-enum
export type TenantMemberRole = 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

export interface MemberInvitedEventPayloadBase {
  tenantId: string;
  role: TenantMemberRole;
  invitedBy: string;
  invitedAt: string;
  emailHash: string;
  expiresAt?: string;
}

export interface ExistingUserMemberInvitedEventPayload extends MemberInvitedEventPayloadBase {
  userId: string;
  invitationId?: never;
}

export interface NewUserMemberInvitedEventPayload extends MemberInvitedEventPayloadBase {
  invitationId: string;
  userId?: never;
  // emailEncrypted is intentionally not persisted in outbox payload.
  // Consumer decrypts invitee email from invitation storage.
}

export type MemberInvitedEventPayload =
  | ExistingUserMemberInvitedEventPayload
  | NewUserMemberInvitedEventPayload;

export const MEMBER_INVITED_EVENT_VERSION = 3;

/**
 * Member invited event
 *
 * Published when a member is invited to the tenant
 */
export class MemberInvitedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly invitation: MemberInvitedEventPayload;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    invitation: MemberInvitedEventPayload;
    version: number;
    eventId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.aggregateId = props.tenantId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.invitation = props.invitation;
    this.occurredAt = new Date();
    this.version = props.version;
    if (props.eventId !== undefined) {
      this.eventId = props.eventId;
    }
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
