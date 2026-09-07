import type { IQuery } from '@package/types';

export class GetCurrentUserSettingsQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: string;
  readonly userId: string;

  constructor(props: { tenantId: string; userId: string }) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
  }
}
