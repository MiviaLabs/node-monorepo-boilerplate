import { NotImplementedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { AdminInboxOverviewDto } from '../../dto';
import { GetAdminInboxOverviewQuery } from '../../queries';

@QueryHandler(GetAdminInboxOverviewQuery)
export class GetAdminInboxOverviewHandler implements IQueryHandler<
  GetAdminInboxOverviewQuery,
  AdminInboxOverviewDto
> {
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(): Promise<AdminInboxOverviewDto> {
    throw new NotImplementedException('Admin inbox aggregation ships in issue #14.');
  }
}
