import type { IQuery } from '@package/types';

/**
 * Get user profile query
 *
 * Query to retrieve the current authenticated user's profile
 * from JWT token including userId, tenantId, actorId, email, name, roles, and permissions.
 */
export class GetUserProfileQuery implements IQuery {
  readonly readonly = true;
  readonly userId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
  readonly roles?: string[] | Set<string>;
  readonly permissions?: string[] | Set<string>;

  constructor(props: {
    userId: string;
    tenantId: string;
    actorId: string;
    email?: string;
    name?: string;
    username?: string;
    roles?: string[] | Set<string>;
    permissions?: string[] | Set<string>;
  }) {
    this.userId = props.userId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.email = props.email;
    this.name = props.name;
    this.username = props.username;
    this.roles = props.roles;
    this.permissions = props.permissions;
  }
}
