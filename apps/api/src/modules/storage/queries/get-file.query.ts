import type { IQuery } from '@package/types';

export class GetFileQuery implements IQuery {
  readonly readonly = true;

  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly fileId: string
  ) {}
}
