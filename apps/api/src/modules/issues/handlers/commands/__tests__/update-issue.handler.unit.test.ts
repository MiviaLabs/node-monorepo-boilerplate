import { describe, expect, it, jest } from '@jest/globals';

import { UpdateIssueHandler } from '../update-issue.handler';

import type { UpdateIssueCommand } from '../../../commands';

describe('UpdateIssueHandler', () => {
  it('delegates issue updates to the service with trace context', async () => {
    const updateIssue = jest.fn(async (..._args: unknown[]) => ({ id: 77 }));
    const issuesService = {
      updateIssue
    };
    const handler = new UpdateIssueHandler(issuesService as never);
    const command = {
      tenantId: '5',
      userId: '9',
      actorId: 'actor-9',
      roles: ['tenant_user'],
      issueId: '77',
      dto: { status: 'done' },
      requestId: 'req-2',
      correlationId: 'corr-2',
      causationId: 'cause-2'
    } as unknown as UpdateIssueCommand;

    await handler.execute(command);

    expect(updateIssue).toHaveBeenCalledWith(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      { status: 'done' },
      {
        requestId: 'req-2',
        correlationId: 'corr-2',
        causationId: 'cause-2'
      }
    );
  });
});
