import type { ICommand } from '@package/types';

/**
 * Register command
 *
 * Registers a new user with email/password
 * Public registration allows undefined tenantId for personal accounts
 */
export class RegisterCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string | undefined;
  readonly actorId?: string;
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
  readonly organizationName?: string;
  readonly organizationSlug?: string;
  readonly invitationToken?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly isVerified: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId?: string;
    actorId?: string;
    email: string;
    password: string;
    displayName?: string;
    organizationName?: string;
    organizationSlug?: string;
    invitationToken?: string;
    ipAddress?: string;
    userAgent?: string;
    isVerified?: boolean;
    isActive?: boolean;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    // Convert empty string to undefined for tenantId (treat as falsy)
    this.tenantId = props.tenantId ?? undefined;
    if (props.actorId !== undefined) {
      this.actorId = props.actorId;
    }
    this.email = props.email;
    this.password = props.password;
    if (props.displayName !== undefined) {
      this.displayName = props.displayName;
    }
    if (props.organizationName !== undefined) {
      this.organizationName = props.organizationName;
    }
    if (props.organizationSlug !== undefined) {
      this.organizationSlug = props.organizationSlug;
    }
    if (props.invitationToken !== undefined) {
      this.invitationToken = props.invitationToken;
    }
    if (props.ipAddress !== undefined) {
      this.ipAddress = props.ipAddress;
    }
    if (props.userAgent !== undefined) {
      this.userAgent = props.userAgent;
    }
    this.isVerified = props.isVerified ?? true;
    this.isActive = props.isActive ?? true;
    this.createdAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
