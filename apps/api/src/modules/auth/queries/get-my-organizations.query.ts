import type { IQuery } from '@package/types';

/**
 * Get organizations for current authenticated user.
 */
export class GetMyOrganizationsQuery implements IQuery {
  readonly readonly = true;
  readonly userId: string;

  constructor(props: { userId: string }) {
    this.userId = props.userId;
  }
}
