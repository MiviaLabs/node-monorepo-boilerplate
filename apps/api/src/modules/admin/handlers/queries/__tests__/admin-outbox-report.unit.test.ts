import { GetAdminOutboxOverviewQuery } from '../../../queries';
import { buildOutboxFilters } from '../admin-outbox-report';

describe('admin-outbox-report', () => {
  it('constrains no-retry filtering to failed events without a scheduled retry', () => {
    const filters = buildOutboxFilters(
      new GetAdminOutboxOverviewQuery({
        retryState: 'no_retry'
      })
    );

    const chunks = (
      filters[0] as {
        queryChunks: Array<
          | {
              name?: string;
              value?: string[];
            }
          | string
        >;
      }
    ).queryChunks;

    expect(chunks[1]).toEqual(expect.objectContaining({ name: 'status' }));
    expect(chunks[3]).toBe('failed');
    expect(chunks[5]).toEqual(expect.objectContaining({ name: 'next_retry_at' }));
    expect(chunks[6]).toEqual(
      expect.objectContaining({ value: expect.arrayContaining([' is null']) })
    );
  });
});
